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

const listRef = ref<VListHandle | null>(null)
const scrollStageRef = ref<HTMLElement | null>(null)
// Domain projection remains readonly. Virtua's Vue binding requires a mutable
// array type, so copy only when membership/order actually changes.
const order = shallowRef<string[]>([...props.runtime.projection.order])
const stateRevision = ref(0)
const composerText = ref('')
const shifting = ref(false)
let lastStreamTick = props.runtime.streamRenderTicks
let userScrollIntentUntil = 0
let userScrollDirection: -1 | 0 | 1 = 0
let lastScrollOffset = 0
let metricsFrame = 0
let unsubscribeOrder: (() => void) | null = null
let unsubscribeState: (() => void) | null = null

const messagesAfter = computed(() => {
  void stateRevision.value
  return props.runtime.messagesAfterCurrent
})
const showLatest = computed(() => {
  void stateRevision.value
  return messagesAfter.value > 0 || !props.runtime.atVisualBottom
})
const followLabel = computed(() => {
  void stateRevision.value
  return props.runtime.followTail ? 'following tail' : 'tail paused'
})

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

function updateReader(offset = listRef.value?.scrollOffset ?? 0): void {
  const list = listRef.value
  if (!list || order.value.length === 0) return
  const probe = Math.max(0, offset + list.viewportSize * 0.65)
  const index = Math.max(0, Math.min(order.value.length - 1, list.findItemIndex(probe)))
  const node = nodeFor(order.value[index]!)
  const atBottom = remainingToBottom() < 32 && props.runtime.range.end === props.runtime.logicalCount
  if (node) props.runtime.setReaderPosition(node.messageIndex, atBottom)
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

  // The first upward gesture leaving a streaming pinned tail is serialized via
  // Virtua's own scroll queue. This avoids racing a scheduled end-follow write
  // and ResizeObserver compensation while preserving native scrolling afterward.
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

async function scrollToLogical(target: number, align: 'start' | 'center' | 'end' = 'center'): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const list = listRef.value
    if (!list) {
      await settleFrames(1)
      continue
    }
    const index = order.value.findIndex(id => nodeFor(id)?.messageIndex === target)
    if (index < 0) return
    list.scrollToIndex(index, { align })
    await settleFrames(2)
    if (scrollStageRef.value?.querySelector(`[data-message-index="${target}"]`)) break
  }
  lastScrollOffset = listRef.value?.scrollOffset ?? 0
  updateReader()
}

async function jumpToMessage(raw = props.runtime.jumpInput): Promise<void> {
  const target = Math.max(0, Math.min(props.runtime.logicalCount - 1, Math.floor(Number(raw) || 0)))
  clearUserIntent()
  if (props.stream.running) props.stream.stop(false)
  props.runtime.jump(target)
  await settleFrames(3)
  await scrollToLogical(target)
}

async function jumpToLatest(): Promise<void> {
  clearUserIntent()
  const last = props.runtime.logicalCount - 1
  if (props.runtime.range.end !== props.runtime.logicalCount) {
    props.runtime.jump(last)
    await settleFrames(3)
  }
  props.runtime.setFollowTail(props.runtime.status === 'running')
  listRef.value?.scrollToIndex(Math.max(0, order.value.length - 1), { align: 'end' })
  await settleFrames(2)
  updateReader()
  if (props.runtime.status === 'running' && !props.stream.running) props.stream.start(false)
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

function sendComposer(): void {
  if (!composerText.value.trim()) return
  composerText.value = ''
  if (props.runtime.status === 'running') props.stream.start(true)
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
    list.scrollToIndex(Math.max(0, order.value.length - 1), { align: 'end' })
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
  if (count < 1000) return `${count}`
  if (count < 1_000_000) return `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}K`
  return `${(count / 1_000_000).toFixed(1)}M`
}

onMounted(() => {
  unsubscribeOrder = props.runtime.projection.subscribeOrder(() => {
    order.value = [...props.runtime.projection.order]
  })
  unsubscribeState = props.runtime.subscribeState(() => {
    stateRevision.value += 1
    const tick = props.runtime.streamRenderTicks
    if (tick !== lastStreamTick) {
      lastStreamTick = tick
      if (props.runtime.followTail) void nextTick().then(() => {
        listRef.value?.scrollToIndex(Math.max(0, order.value.length - 1), { align: 'end' })
      })
    }
  })
  void restoreSnapshot()
})

onBeforeUnmount(() => {
  props.runtime.rememberSnapshot(captureSnapshot())
  unsubscribeOrder?.()
  unsubscribeState?.()
  if (metricsFrame) cancelAnimationFrame(metricsFrame)
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
        <span class="run-status"><i :class="{ idle: !runtime.streamTarget }" /> {{ runtime.streamTarget ? 'streaming' : runtime.status }}</span>
        <button class="header-icon" title="Search">⌕</button>
      </div>
    </header>

    <div ref="scrollStageRef" class="scroll-stage" data-testid="scrollport" @wheel.capture="onUserWheel" @pointerdown.capture="onUserPointerDown">
      <div class="conversation-meta-strip">
        <span>Loaded <strong data-testid="segment-range">{{ runtime.range.start.toLocaleString() }} – {{ (runtime.range.end - 1).toLocaleString() }}</strong></span>
        <span>Reader <strong data-testid="reader-position">#{{ runtime.currentLogicalPosition.toLocaleString() }}</strong></span>
        <span data-testid="mounted-label">{{ runtime.mountedRows }} DOM rows</span>
        <span v-if="runtime.streamTarget" data-testid="follow-state">{{ followLabel }}</span>
      </div>

      <VList
        :key="`${runtime.id}:${runtime.virtualEpoch}`"
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

    <footer class="composer-shell">
      <div class="composer-box">
        <textarea v-model="composerText" rows="2" placeholder="Ask the agent anything…" @keydown.enter.exact.prevent="sendComposer" />
        <div class="composer-actions">
          <div><button class="composer-icon">＋</button><button class="mode-button">Agent ▾</button></div>
          <div><span class="context-meter">{{ runtime.logicalCount.toLocaleString() }} logical messages</span><button class="send-button" :disabled="!composerText.trim() || runtime.status !== 'running'" @click="sendComposer">↑</button></div>
        </div>
      </div>
      <span class="composer-hint">Stable keyed nodes · session-scoped runtime · bounded physical DOM</span>
    </footer>
  </main>
</template>