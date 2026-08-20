<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { VList, type VListHandle } from 'virtua/vue'
import type { ViewportSnapshot } from '../conversation/contracts'
import type { ConversationSessionRuntime, ShiftPlan } from '../conversation/session-runtime'
import type { SyntheticStreamController } from '../conversation/stream-controller'
import ConversationNodeSeat from './ConversationNodeSeat.vue'

const props = defineProps<{
  runtime: ConversationSessionRuntime
  stream: SyntheticStreamController
}>()

const EDGE_THRESHOLD_PX = 900
const USER_SCROLL_INTENT_MS = 650
const VIRTUAL_BUFFER_PX = 900
const VIRTUAL_ITEM_HINT_PX = 180
const COMPOSER_MIN_PX = 56
const COMPOSER_MAX_PX = 180

const listRef = ref<VListHandle | null>(null)
const scrollStageRef = ref<HTMLElement | null>(null)
const composerInputRef = ref<HTMLTextAreaElement | null>(null)
const composerShellRef = ref<HTMLElement | null>(null)
const order = shallowRef<string[]>([...props.runtime.projection.order])
const composerText = ref(props.runtime.draftText)
const shifting = ref(false)

function readUiState() {
  return {
    rangeStart: props.runtime.range.start,
    rangeEnd: props.runtime.range.end,
    reader: props.runtime.currentLogicalPosition,
    followTail: props.runtime.followTail,
    atVisualBottom: props.runtime.atVisualBottom,
    mountedRows: props.runtime.mountedRows,
    streamTarget: props.runtime.streamTarget,
    streamTicks: props.runtime.streamRenderTicks,
    messagesAfter: props.runtime.messagesAfterCurrent,
    virtualEpoch: props.runtime.virtualEpoch,
  }
}

// One immutable snapshot per runtime notification prevents Vue from rendering
// reader/count/status fields from different revisions of a mutable domain object.
const uiState = shallowRef(readUiState())
let lastStreamTick = uiState.value.streamTicks
let userScrollIntentUntil = 0
let userScrollDirection: -1 | 0 | 1 = 0
let lastScrollOffset = 0
let metricsFrame = 0
let viewportResizeFrame = 0
let viewportObserver: ResizeObserver | null = null
let unsubscribeOrder: (() => void) | null = null
let unsubscribeState: (() => void) | null = null

interface LayoutAnchor {
  id: string
  offsetPx: number
}

let pendingComposerAnchor: LayoutAnchor | null = null
let pendingComposerPinned = false

const messagesAfter = computed(() => uiState.value.messagesAfter)
const showLatest = computed(() => !uiState.value.atVisualBottom || messagesAfter.value > 0)
const followLabel = computed(() => uiState.value.followTail ? 'following tail' : 'tail paused')

function frame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

async function settleFrames(count = 2): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await nextTick()
    await frame()
  }
}

function nodeFor(id: string) {
  return props.runtime.projection.getNode(id)
}

function itemProps({ item, index }: { item: string; index: number }) {
  const node = nodeFor(item)
  return {
    class: 'virtua-row',
    'data-index': index,
    'data-message-index': node?.messageIndex ?? -1,
    'data-render-unit': item,
    'data-session-id': props.runtime.id,
  }
}

function refreshMountedRows(): void {
  if (metricsFrame) return
  metricsFrame = requestAnimationFrame(() => {
    metricsFrame = 0
    props.runtime.mountedRows = scrollStageRef.value?.querySelectorAll('.virtua-row').length ?? 0
    props.runtime.markStateDirty()
  })
}

function remainingToBottom(): number {
  const list = listRef.value
  if (!list) return Number.POSITIVE_INFINITY
  return Math.max(0, list.scrollSize - list.scrollOffset - list.viewportSize)
}

/** The reader is the last logical message currently visible in the viewport. */
function updateReader(offset = listRef.value?.scrollOffset ?? 0): void {
  const list = listRef.value
  if (!list || order.value.length === 0) return
  const atBottom = remainingToBottom() < 32 && props.runtime.range.end === props.runtime.logicalCount
  if (atBottom) {
    props.runtime.setReaderPosition(props.runtime.logicalCount - 1, true)
    return
  }

  const bottomProbe = Math.max(0, Math.min(list.scrollSize - 1, offset + Math.max(1, list.viewportSize - 2)))
  const index = Math.max(0, Math.min(order.value.length - 1, list.findItemIndex(bottomProbe)))
  const node = nodeFor(order.value[index]!)
  if (node) props.runtime.setReaderPosition(node.messageIndex, false)
}

function captureListAnchor(): LayoutAnchor | null {
  const list = listRef.value
  if (!list || order.value.length === 0) return null
  const index = Math.max(0, Math.min(order.value.length - 1, list.findItemIndex(list.scrollOffset + 1)))
  const id = order.value[index]
  if (!id) return null
  return { id, offsetPx: list.getItemOffset(index) - list.scrollOffset }
}

async function restoreListAnchor(anchor: LayoutAnchor): Promise<void> {
  const list = listRef.value
  if (!list) return
  const index = order.value.indexOf(anchor.id)
  if (index < 0) return
  list.scrollToIndex(index, { align: 'start', offset: -anchor.offsetPx })
  await settleFrames(2)
}

function markUserIntent(direction: -1 | 0 | 1): void {
  userScrollIntentUntil = performance.now() + USER_SCROLL_INTENT_MS
  if (direction !== 0) userScrollDirection = direction
}

function clearUserIntent(): void {
  userScrollIntentUntil = 0
  userScrollDirection = 0
}

function onUserWheel(event: WheelEvent): void {
  const direction: -1 | 0 | 1 = event.deltaY < 0 ? -1 : event.deltaY > 0 ? 1 : 0
  markUserIntent(direction)

  if (direction < 0 && props.runtime.streamTarget && props.runtime.followTail) {
    event.preventDefault()
    props.runtime.setFollowTail(false)
    const intent = props.runtime.tailIntentGeneration
    const delta = event.deltaY
    requestAnimationFrame(() => {
      if (props.runtime.followTail || intent !== props.runtime.tailIntentGeneration) return
      listRef.value?.scrollBy(delta)
    })
  }
}

function onUserPointerDown(): void {
  markUserIntent(0)
}

function onVirtualScroll(offset: number): void {
  const inferred: -1 | 0 | 1 = offset < lastScrollOffset ? -1 : offset > lastScrollOffset ? 1 : 0
  lastScrollOffset = offset
  const hasIntent = performance.now() < userScrollIntentUntil
  if (hasIntent && userScrollDirection === 0 && inferred !== 0) userScrollDirection = inferred

  updateReader(offset)
  refreshMountedRows()

  if (!hasIntent || !props.runtime.streamTarget) return
  if (userScrollDirection < 0) props.runtime.setFollowTail(false)
  else if (userScrollDirection > 0 && remainingToBottom() < 32) props.runtime.setFollowTail(true)
}

function onVirtualScrollEnd(): void {
  refreshMountedRows()
  if (shifting.value || performance.now() >= userScrollIntentUntil) return
  if (userScrollDirection < 0 && (listRef.value?.scrollOffset ?? Infinity) < EDGE_THRESHOLD_PX) void shiftBackward()
  else if (userScrollDirection > 0 && remainingToBottom() < EDGE_THRESHOLD_PX) void shiftForward()
}

async function applyShift(plan: ShiftPlan): Promise<void> {
  if (plan.direction === 'backward') {
    props.runtime.applyIntermediate(plan.intermediate, true)
    await settleFrames(3)
    props.runtime.commitShift(plan, false)
    await settleFrames(2)
  } else {
    props.runtime.applyIntermediate(plan.intermediate, false)
    await settleFrames(2)
    props.runtime.commitShift(plan, true)
    await settleFrames(3)
  }
  props.runtime.finishShift()
  await nextTick()
  updateReader()
  refreshMountedRows()
}

async function shiftBackward(): Promise<void> {
  if (shifting.value) return
  const plan = props.runtime.planShiftBackward()
  if (!plan) return
  shifting.value = true
  clearUserIntent()
  props.runtime.setFollowTail(false)
  await applyShift(plan)
  shifting.value = false
}

async function shiftForward(): Promise<void> {
  if (shifting.value) return
  const plan = props.runtime.planShiftForward()
  if (!plan) return
  shifting.value = true
  clearUserIntent()
  await applyShift(plan)
  shifting.value = false
}

function findMessageUnitIndex(target: number, preferLast = false): number {
  let found = -1
  for (let i = 0; i < order.value.length; i += 1) {
    if (nodeFor(order.value[i]!)?.messageIndex !== target) continue
    found = i
    if (!preferLast) break
  }
  return found
}

async function scrollToLogical(target: number, align: 'start' | 'center' | 'end' = 'center'): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const list = listRef.value
    if (!list) {
      await settleFrames(1)
      continue
    }
    const index = findMessageUnitIndex(target, align === 'end')
    if (index < 0) {
      await settleFrames(1)
      continue
    }
    list.scrollToIndex(index, { align })
    await settleFrames(2)
    if (scrollStageRef.value?.querySelector(`[data-message-index="${target}"]`)) break
  }
  lastScrollOffset = listRef.value?.scrollOffset ?? 0
  updateReader()
}

/** Browsing history never cancels an asynchronous Agent run. */
async function jumpToMessage(raw = props.runtime.jumpInput): Promise<void> {
  const target = Math.max(0, Math.min(props.runtime.logicalCount - 1, Math.floor(Number(raw) || 0)))
  clearUserIntent()
  props.runtime.jump(target)
  await settleFrames(3)
  await scrollToLogical(target)
}

/** Latest is navigation only: it never starts/stops the underlying Agent run. */
async function jumpToLatest(): Promise<void> {
  clearUserIntent()
  const last = props.runtime.logicalCount - 1
  const streamRunning = props.stream.running

  if (props.runtime.range.end !== props.runtime.logicalCount) {
    props.runtime.jump(last)
    props.runtime.refreshProjection()
    await settleFrames(3)
  } else {
    props.runtime.refreshProjection()
    await settleFrames(1)
  }

  await scrollToLogical(last, 'end')
  await settleFrames(2)
  const physicallyAtBottom = remainingToBottom() < 48
  props.runtime.setReaderPosition(last, physicallyAtBottom)
  props.runtime.setFollowTail(streamRunning && physicallyAtBottom)
}

function restartStream(): void {
  props.stream.start(true)
}

function pauseStream(): void {
  props.stream.stop(false)
}

function setStreamRate(rate: number): void {
  props.stream.setRate(rate)
}

function resizeComposer(): void {
  const input = composerInputRef.value
  if (!input) return
  input.style.height = '0px'
  const next = Math.max(COMPOSER_MIN_PX, Math.min(COMPOSER_MAX_PX, input.scrollHeight))
  input.style.height = `${next}px`
  input.style.overflowY = input.scrollHeight > COMPOSER_MAX_PX ? 'auto' : 'hidden'
}

function onComposerInput(): void {
  props.runtime.setDraftText(composerText.value)
  pendingComposerPinned = props.runtime.atVisualBottom && props.runtime.range.end === props.runtime.logicalCount
  pendingComposerAnchor = pendingComposerPinned ? null : captureListAnchor()
  void nextTick().then(resizeComposer)
}

function sendComposer(): void {
  if (!composerText.value.trim()) return
  composerText.value = ''
  props.runtime.setDraftText('')
  pendingComposerPinned = props.runtime.atVisualBottom && props.runtime.range.end === props.runtime.logicalCount
  pendingComposerAnchor = pendingComposerPinned ? null : captureListAnchor()
  void nextTick().then(resizeComposer)
  if (props.runtime.status === 'running') props.stream.start(true)
}

/** Reconcile viewport geometry after the composer changes height. */
function scheduleViewportResizeReconcile(): void {
  if (viewportResizeFrame) cancelAnimationFrame(viewportResizeFrame)
  viewportResizeFrame = requestAnimationFrame(async () => {
    viewportResizeFrame = 0
    await nextTick()

    const pin = pendingComposerPinned || (pendingComposerAnchor === null && (props.runtime.atVisualBottom || props.runtime.followTail))
    const anchor = pendingComposerAnchor
    pendingComposerPinned = false
    pendingComposerAnchor = null

    if (pin && props.runtime.range.end === props.runtime.logicalCount) {
      const last = props.runtime.logicalCount - 1
      await scrollToLogical(last, 'end')
      if (remainingToBottom() < 48) props.runtime.setReaderPosition(last, true)
    } else if (anchor) {
      await restoreListAnchor(anchor)
      updateReader()
    } else {
      updateReader()
    }
    refreshMountedRows()
  })
}

function captureSnapshot(): ViewportSnapshot {
  const list = listRef.value
  if (!list || order.value.length === 0) return props.runtime.snapshot()
  const index = Math.max(0, Math.min(order.value.length - 1, list.findItemIndex(list.scrollOffset + 1)))
  const id = order.value[index] ?? null
  const anchorOffset = id ? list.getItemOffset(index) - list.scrollOffset : 0
  const snapshot = props.runtime.snapshot(id, anchorOffset)
  props.runtime.rememberSnapshot(snapshot)
  return snapshot
}

async function restoreSnapshot(): Promise<void> {
  const snapshot = props.runtime.rememberedSnapshot
  await settleFrames(3)
  const list = listRef.value
  if (!list) return

  if (snapshot.atVisualBottom && props.runtime.range.end === props.runtime.logicalCount) {
    props.runtime.refreshProjection()
    await settleFrames(1)
    await scrollToLogical(props.runtime.logicalCount - 1, 'end')
    if (remainingToBottom() < 48) props.runtime.setReaderPosition(props.runtime.logicalCount - 1, true)
  } else if (snapshot.anchorUnitId) {
    const index = order.value.indexOf(snapshot.anchorUnitId)
    if (index >= 0) list.scrollToIndex(index, { align: 'start', offset: -snapshot.anchorOffsetPx })
    else await scrollToLogical(snapshot.logicalPosition)
  } else {
    await scrollToLogical(snapshot.logicalPosition)
  }
  await settleFrames(2)
  lastScrollOffset = list.scrollOffset
  updateReader()
  refreshMountedRows()
}

function formatAfter(count: number): string {
  return count.toLocaleString('en-US')
}

function attachViewportObserver(): void {
  viewportObserver?.disconnect()
  viewportObserver = new ResizeObserver(scheduleViewportResizeReconcile)
  if (scrollStageRef.value) viewportObserver.observe(scrollStageRef.value)
  if (composerShellRef.value) viewportObserver.observe(composerShellRef.value)
}

onMounted(() => {
  unsubscribeOrder = props.runtime.projection.subscribeOrder(() => {
    order.value = [...props.runtime.projection.order]
  })
  unsubscribeState = props.runtime.subscribeState(() => {
    const next = readUiState()
    uiState.value = next
    if (next.streamTicks !== lastStreamTick) {
      lastStreamTick = next.streamTicks
      if (next.followTail) void nextTick().then(() => {
        listRef.value?.scrollToIndex(Math.max(0, order.value.length - 1), { align: 'end' })
      })
    }
  })

  // Establish the restored draft height first, then restore semantic viewport,
  // and only then start observing future layout changes. This avoids mount-time
  // composer geometry racing session restoration.
  resizeComposer()
  void restoreSnapshot().then(attachViewportObserver)
})

onBeforeUnmount(() => {
  props.runtime.setDraftText(composerText.value)
  props.runtime.rememberSnapshot(captureSnapshot())
  unsubscribeOrder?.()
  unsubscribeState?.()
  viewportObserver?.disconnect()
  if (metricsFrame) cancelAnimationFrame(metricsFrame)
  if (viewportResizeFrame) cancelAnimationFrame(viewportResizeFrame)
})

defineExpose({
  captureSnapshot,
  jumpToMessage,
  jumpToLatest,
  shiftBackward,
  shiftForward,
  restartStream,
  pauseStream,
  setStreamRate,
})
</script>

<template>
  <main class="conversation-shell" :data-session-id="runtime.id">
    <header class="conversation-header">
      <div class="conversation-title">
        <strong>{{ runtime.title }}</strong>
        <span>million-message-workspace / {{ runtime.id }}</span>
      </div>
      <div class="header-chips">
        <button class="model-chip">Synthetic Agent · canonical runtime⌄</button>
        <span class="run-status"><i :class="{ idle: !uiState.streamTarget }" /> {{ uiState.streamTarget ? 'streaming' : runtime.status }}</span>
        <button class="header-icon" title="Search">⌕</button>
      </div>
    </header>

    <div ref="scrollStageRef" class="scroll-stage" data-testid="scrollport" @wheel.capture="onUserWheel" @pointerdown.capture="onUserPointerDown">
      <div class="conversation-meta-strip">
        <span>Loaded <strong data-testid="segment-range">{{ uiState.rangeStart.toLocaleString() }} – {{ (uiState.rangeEnd - 1).toLocaleString() }}</strong></span>
        <span>Reader <strong data-testid="reader-position">#{{ uiState.reader.toLocaleString() }}</strong></span>
        <span data-testid="mounted-label">{{ uiState.mountedRows }} DOM rows</span>
        <span v-if="uiState.streamTarget" data-testid="follow-state">{{ followLabel }}</span>
      </div>

      <VList
        :key="`${runtime.id}:${uiState.virtualEpoch}`"
        ref="listRef"
        class="conversation-vlist"
        :data="order"
        :item-size="VIRTUAL_ITEM_HINT_PX"
        :buffer-size="VIRTUAL_BUFFER_PX"
        :shift="runtime.shiftMode"
        :item-props="itemProps"
        @scroll="onVirtualScroll"
        @scroll-end="onVirtualScrollEnd"
      >
        <template #default="{ item }">
          <ConversationNodeSeat :runtime="runtime" :node-id="item" />
        </template>
      </VList>

      <button
        v-if="showLatest"
        class="jump-latest"
        data-testid="jump-latest"
        type="button"
        @click="jumpToLatest"
      >
        <span>↓</span>
        <strong>Latest</strong>
        <em v-if="messagesAfter > 0" data-testid="messages-after">{{ formatAfter(messagesAfter) }}</em>
      </button>
    </div>

    <footer ref="composerShellRef" class="composer-shell" data-testid="composer-shell">
      <div class="composer-box">
        <textarea
          ref="composerInputRef"
          v-model="composerText"
          data-testid="composer-input"
          rows="1"
          placeholder="Ask the agent anything…"
          @input="onComposerInput"
          @keydown.enter.exact.prevent="sendComposer"
        />
        <div class="composer-actions">
          <div><button class="composer-icon">＋</button><button class="mode-button">Agent ▾</button></div>
          <div><span class="context-meter">{{ runtime.logicalCount.toLocaleString() }} logical messages</span><button class="send-button" :disabled="!composerText.trim() || runtime.status !== 'running'" @click="sendComposer">↑</button></div>
        </div>
      </div>
      <span class="composer-hint">Stable keyed nodes · async session scope · bounded physical DOM</span>
    </footer>
  </main>
</template>
