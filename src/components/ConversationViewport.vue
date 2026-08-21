<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { VList, type VListHandle } from 'virtua/vue'
import type { ViewportSnapshot } from '../conversation/contracts'
import type { ConversationSessionRuntime, SessionUiSnapshot, ShiftPlan } from '../conversation/session-runtime'
import type { SyntheticStreamController } from '../conversation/stream-controller'
import ConversationNodeSeat from './ConversationNodeSeat.vue'

const props = defineProps<{ runtime: ConversationSessionRuntime; stream: SyntheticStreamController; diagnostics?: boolean }>()

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
const uiState = shallowRef<SessionUiSnapshot>(props.runtime.uiSnapshot)
let lastStreamTick = uiState.value.streamRenderTicks
let userScrollIntentUntil = 0
let userScrollDirection: -1 | 0 | 1 = 0
let lastScrollOffset = 0
let metricsFrame = 0
let viewportResizeFrame = 0
let viewportObserver: ResizeObserver | null = null
let unsubscribeOrder: (() => void) | null = null
let unsubscribeState: (() => void) | null = null

interface LayoutAnchor { id: string; offsetPx: number; viewportTopPx: number }
let pendingComposerAnchor: LayoutAnchor | null = null
let pendingComposerPinned = false

const messagesAfter = computed(() => uiState.value.messagesAfter)
const showLatest = computed(() => props.runtime.logicalCount > 0 && (!uiState.value.atVisualBottom || messagesAfter.value > 0))
const followLabel = computed(() => uiState.value.followTail ? 'following tail' : 'tail paused')
const statusLabel = computed(() => {
  if (uiState.value.pendingInteraction) return 'needs input'
  if (uiState.value.sessionStatus === 'working') return 'working'
  if (uiState.value.sessionStatus === 'interrupted') return 'interrupted'
  return 'idle'
})
const canSend = computed(() => Boolean(composerText.value.trim()) && !uiState.value.pendingInteraction)
const sendLabel = computed(() => uiState.value.sessionStatus === 'working' ? 'Queue prompt' : 'Send prompt')
const composerPlaceholder = computed(() => uiState.value.pendingInteraction
  ? 'Resolve the pending request before continuing…'
  : uiState.value.sessionStatus === 'working'
    ? 'Queue a follow-up while the agent is working…'
    : 'Ask the agent anything…')

function frame(): Promise<void> { return new Promise(resolve => requestAnimationFrame(() => resolve())) }
async function settleFrames(count = 2): Promise<void> { for (let i = 0; i < count; i += 1) { await nextTick(); await frame() } }
function nodeFor(id: string) { return props.runtime.projection.getNode(id) }
function itemProps({ item, index }: { item: string; index: number }) {
  const node = nodeFor(item)
  return { class: 'virtua-row', 'data-index': index, 'data-message-index': node?.messageIndex ?? -1, 'data-render-unit': item, 'data-session-id': props.runtime.id }
}
function renderedRow(id: string): HTMLElement | null {
  const stage = scrollStageRef.value
  if (!stage) return null
  for (const row of stage.querySelectorAll<HTMLElement>('[data-render-unit]')) if (row.dataset.renderUnit === id) return row
  return null
}

/** Mounted DOM is not viewport truth: exclude Virtua measurement probes. */
function captureCommittedAnchor(): LayoutAnchor | null {
  const stage = scrollStageRef.value
  if (!stage) return null
  const viewport = stage.getBoundingClientRect()
  const reader = uiState.value.reader
  const candidates = [...stage.querySelectorAll<HTMLElement>('[data-render-unit]')]
    .map(row => ({ row, node: nodeFor(row.dataset.renderUnit ?? ''), rect: row.getBoundingClientRect() }))
    .filter(entry => entry.node && entry.node.messageIndex <= reader + 1 && entry.rect.bottom > viewport.top && entry.rect.top < viewport.bottom)
    .sort((a, b) => a.rect.top - b.rect.top)
  const first = candidates[0]
  if (!first) return null
  const top = first.rect.top - viewport.top
  return { id: first.row.dataset.renderUnit ?? '', offsetPx: top, viewportTopPx: top }
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
  if (!list || order.value.length === 0 || props.runtime.logicalCount <= 0) return
  const atBottom = remainingToBottom() < 32 && props.runtime.range.end === props.runtime.logicalCount
  if (atBottom) { props.runtime.setReaderPosition(props.runtime.logicalCount - 1, true); return }
  const bottomProbe = Math.max(0, Math.min(list.scrollSize - 1, offset + Math.max(1, list.viewportSize - 2)))
  const index = Math.max(0, Math.min(order.value.length - 1, list.findItemIndex(bottomProbe)))
  const node = nodeFor(order.value[index]!)
  if (node) props.runtime.setReaderPosition(node.messageIndex, false)
}

async function restoreListAnchor(anchor: LayoutAnchor): Promise<void> {
  const list = listRef.value
  if (!list) return
  const index = order.value.indexOf(anchor.id)
  if (index < 0) return
  list.scrollToIndex(index, { align: 'start', offset: -anchor.offsetPx })
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await settleFrames(1)
    const currentList = listRef.value
    const stage = scrollStageRef.value
    const row = renderedRow(anchor.id)
    if (!currentList || !stage || !row) { currentList?.scrollToIndex(index, { align: 'start', offset: -anchor.offsetPx }); continue }
    const currentTop = row.getBoundingClientRect().top - stage.getBoundingClientRect().top
    const delta = currentTop - anchor.viewportTopPx
    if (Math.abs(delta) < 0.75) break
    currentList.scrollBy(delta)
  }
  await settleFrames(1)
}

async function pinMeasuredEnd(maxFrames = 6): Promise<void> {
  if (props.runtime.logicalCount <= 0) return
  for (let attempt = 0; attempt < maxFrames; attempt += 1) {
    await nextTick(); await frame()
    const list = listRef.value
    if (!list) return
    list.scrollTo(Math.max(0, list.scrollSize - list.viewportSize))
    await frame()
    if (remainingToBottom() < 1) break
  }
  lastScrollOffset = listRef.value?.scrollOffset ?? 0
  updateReader(lastScrollOffset)
}
function markUserIntent(direction: -1 | 0 | 1): void { userScrollIntentUntil = performance.now() + USER_SCROLL_INTENT_MS; if (direction !== 0) userScrollDirection = direction }
function clearUserIntent(): void { userScrollIntentUntil = 0; userScrollDirection = 0 }
function onUserWheel(event: WheelEvent): void {
  const direction: -1 | 0 | 1 = event.deltaY < 0 ? -1 : event.deltaY > 0 ? 1 : 0
  markUserIntent(direction)
  if (direction < 0 && uiState.value.streamTarget && props.runtime.followTail) {
    event.preventDefault(); props.runtime.setFollowTail(false); const delta = event.deltaY
    requestAnimationFrame(() => { if (!props.runtime.followTail) listRef.value?.scrollBy(delta) })
  }
}
function onUserPointerDown(): void { markUserIntent(0) }
function onVirtualScroll(offset: number): void {
  const inferred: -1 | 0 | 1 = offset < lastScrollOffset ? -1 : offset > lastScrollOffset ? 1 : 0
  lastScrollOffset = offset
  const hasIntent = performance.now() < userScrollIntentUntil
  if (hasIntent && userScrollDirection === 0 && inferred !== 0) userScrollDirection = inferred
  updateReader(offset); refreshMountedRows()
  if (!hasIntent || !uiState.value.streamTarget) return
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
  const anchor = captureCommittedAnchor()
  if (plan.direction === 'backward') { props.runtime.applyIntermediate(plan.intermediate, true); await settleFrames(3); props.runtime.commitShift(plan, false); await settleFrames(2) }
  else { props.runtime.applyIntermediate(plan.intermediate, false); await settleFrames(2); props.runtime.commitShift(plan, true); await settleFrames(3) }
  props.runtime.finishShift()
  if (anchor) await restoreListAnchor(anchor)
  await nextTick(); updateReader(); refreshMountedRows()
}
async function shiftBackward(): Promise<void> { if (shifting.value) return; const plan = props.runtime.planShiftBackward(); if (!plan) return; shifting.value = true; clearUserIntent(); props.runtime.setFollowTail(false); await applyShift(plan); shifting.value = false }
async function shiftForward(): Promise<void> { if (shifting.value) return; const plan = props.runtime.planShiftForward(); if (!plan) return; shifting.value = true; clearUserIntent(); await applyShift(plan); shifting.value = false }

function findMessageUnitIndex(target: number, preferLast = false): number {
  let found = -1
  for (let i = 0; i < order.value.length; i += 1) {
    if (nodeFor(order.value[i]!)?.messageIndex !== target) continue
    found = i
    if (!preferLast) break
  }
  return found
}
function targetIsCommittedVisible(target: number): boolean {
  const stage = scrollStageRef.value
  if (!stage) return false
  const viewport = stage.getBoundingClientRect()
  for (const row of stage.querySelectorAll<HTMLElement>(`[data-message-index="${target}"]`)) {
    const rect = row.getBoundingClientRect()
    if (rect.bottom > viewport.top && rect.top < viewport.bottom) return true
  }
  return false
}
async function scrollToLogical(target: number, align: 'start' | 'center' | 'end' = 'center'): Promise<void> {
  if (props.runtime.logicalCount <= 0) return
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await settleFrames(1)
    const list = listRef.value
    if (!list) continue
    const index = findMessageUnitIndex(target, align === 'end')
    if (index < 0) continue
    list.scrollToIndex(index, { align }); await settleFrames(2)
    if (!targetIsCommittedVisible(target)) continue
    lastScrollOffset = list.scrollOffset; updateReader(lastScrollOffset); await settleFrames(1)
    if (targetIsCommittedVisible(target) && Math.abs(props.runtime.currentLogicalPosition - target) < 64) return
  }
  lastScrollOffset = listRef.value?.scrollOffset ?? 0; updateReader(lastScrollOffset)
}
async function waitForJumpEpoch(previousEpoch: number, previousHandle: VListHandle | null, target: number): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await settleFrames(1)
    const epochReady = uiState.value.virtualEpoch > previousEpoch && uiState.value.virtualEpoch === props.runtime.virtualEpoch
    const orderReady = findMessageUnitIndex(target) >= 0
    const handleReady = Boolean(listRef.value) && (listRef.value !== previousHandle || attempt >= 4)
    if (epochReady && orderReady && handleReady) return
  }
}
async function jumpToMessage(raw = props.runtime.jumpInput): Promise<void> {
  if (props.runtime.logicalCount <= 0) return
  const target = Math.max(0, Math.min(props.runtime.logicalCount - 1, Math.floor(Number(raw) || 0)))
  clearUserIntent(); const previousEpoch = uiState.value.virtualEpoch; const previousHandle = listRef.value
  props.runtime.jump(target); await waitForJumpEpoch(previousEpoch, previousHandle, target); await scrollToLogical(target)
}
async function jumpToLatest(): Promise<void> {
  clearUserIntent()
  if (props.runtime.logicalCount <= 0) return
  const last = props.runtime.logicalCount - 1
  if (props.runtime.range.end !== props.runtime.logicalCount) {
    const previousEpoch = uiState.value.virtualEpoch; const previousHandle = listRef.value
    props.runtime.jump(last); props.runtime.refreshProjection(); await waitForJumpEpoch(previousEpoch, previousHandle, last)
  } else { props.runtime.refreshProjection(); await settleFrames(1) }
  await scrollToLogical(last, 'end'); await pinMeasuredEnd()
  const physicallyAtBottom = remainingToBottom() < 32
  props.runtime.setReaderPosition(last, physicallyAtBottom); props.runtime.setFollowTail(props.stream.running && physicallyAtBottom)
}

function restartStream(): void { props.stream.start(false) }
function pauseStream(): void { props.stream.stop(false) }
function setStreamRate(rate: number): void { props.stream.setRate(rate) }
function abortRun(): void { props.stream.abort() }
function resolveInteraction(approved: boolean): void { props.stream.resolveInteraction(approved) }

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
  pendingComposerAnchor = pendingComposerPinned ? null : captureCommittedAnchor()
  void nextTick().then(resizeComposer)
}
async function sendComposer(): Promise<void> {
  const prompt = composerText.value.trim()
  if (!prompt || uiState.value.pendingInteraction) return
  const disposition = props.stream.submit(prompt)
  if (disposition === 'blocked') return
  composerText.value = ''; props.runtime.setDraftText('')
  pendingComposerPinned = props.runtime.atVisualBottom && props.runtime.range.end === props.runtime.logicalCount
  pendingComposerAnchor = pendingComposerPinned ? null : captureCommittedAnchor()
  await nextTick(); resizeComposer()
  if (disposition === 'started') { await settleFrames(2); await jumpToLatest() }
}
function scheduleViewportResizeReconcile(): void {
  if (viewportResizeFrame) cancelAnimationFrame(viewportResizeFrame)
  viewportResizeFrame = requestAnimationFrame(async () => {
    viewportResizeFrame = 0; await nextTick()
    const pin = pendingComposerPinned || (pendingComposerAnchor === null && (props.runtime.atVisualBottom || props.runtime.followTail))
    const anchor = pendingComposerAnchor; pendingComposerPinned = false; pendingComposerAnchor = null
    if (pin && props.runtime.range.end === props.runtime.logicalCount) await pinMeasuredEnd()
    else if (anchor) { await restoreListAnchor(anchor); updateReader() }
    else updateReader()
    refreshMountedRows()
  })
}
function captureSnapshot(): ViewportSnapshot {
  const anchor = captureCommittedAnchor()
  const snapshot = anchor ? props.runtime.snapshot(anchor.id, anchor.offsetPx) : props.runtime.snapshot()
  props.runtime.rememberSnapshot(snapshot)
  return snapshot
}
async function restoreSnapshot(): Promise<void> {
  const snapshot = props.runtime.rememberedSnapshot
  await settleFrames(3)
  const list = listRef.value
  if (!list || order.value.length === 0) { refreshMountedRows(); return }
  if (snapshot.atVisualBottom && props.runtime.range.end === props.runtime.logicalCount) {
    props.runtime.refreshProjection(); await settleFrames(1); await scrollToLogical(props.runtime.logicalCount - 1, 'end'); await pinMeasuredEnd()
  } else if (snapshot.anchorUnitId && order.value.includes(snapshot.anchorUnitId)) {
    await restoreListAnchor({ id: snapshot.anchorUnitId, offsetPx: snapshot.anchorOffsetPx, viewportTopPx: snapshot.anchorOffsetPx })
  } else await scrollToLogical(snapshot.logicalPosition)
  await settleFrames(2); lastScrollOffset = listRef.value?.scrollOffset ?? 0; updateReader(lastScrollOffset); refreshMountedRows()
}
function formatAfter(count: number): string { return count.toLocaleString('en-US') }
function attachViewportObserver(): void {
  viewportObserver?.disconnect(); viewportObserver = new ResizeObserver(scheduleViewportResizeReconcile)
  if (scrollStageRef.value) viewportObserver.observe(scrollStageRef.value)
  if (composerShellRef.value) viewportObserver.observe(composerShellRef.value)
}

onMounted(() => {
  unsubscribeOrder = props.runtime.projection.subscribeOrder(() => { order.value = [...props.runtime.projection.order] })
  unsubscribeState = props.runtime.subscribeState(() => {
    const next = props.runtime.uiSnapshot; uiState.value = next
    if (next.streamRenderTicks !== lastStreamTick) {
      lastStreamTick = next.streamRenderTicks
      if (next.followTail) void nextTick().then(() => listRef.value?.scrollToIndex(Math.max(0, order.value.length - 1), { align: 'end' }))
    }
  })
  resizeComposer(); void restoreSnapshot().then(attachViewportObserver)
})

onBeforeUnmount(() => {
  props.runtime.setDraftText(composerText.value); props.runtime.rememberSnapshot(captureSnapshot())
  unsubscribeOrder?.(); unsubscribeState?.(); viewportObserver?.disconnect()
  if (metricsFrame) cancelAnimationFrame(metricsFrame)
  if (viewportResizeFrame) cancelAnimationFrame(viewportResizeFrame)
})

defineExpose({ captureSnapshot, jumpToMessage, jumpToLatest, shiftBackward, shiftForward, restartStream, pauseStream, setStreamRate })
</script>

<template>
  <main class="conversation-shell" :data-session-id="runtime.id">
    <header class="conversation-header">
      <div class="conversation-title"><strong>{{ runtime.title }}</strong><span>million-message-workspace / {{ runtime.id }}</span></div>
      <div class="header-chips">
        <button class="model-chip">Synthetic Agent</button><button class="model-chip secondary-model">Reasoning · balanced</button>
        <span class="run-status" :class="`run-${uiState.sessionStatus}`"><i /> {{ statusLabel }}</span>
        <button v-if="uiState.sessionStatus === 'working'" class="header-stop" data-testid="abort-run" title="Stop run" @click="abortRun">■</button>
        <button class="header-icon" title="Search conversation">⌕</button>
      </div>
    </header>

    <div ref="scrollStageRef" class="scroll-stage" data-testid="scrollport" @wheel.capture="onUserWheel" @pointerdown.capture="onUserPointerDown">
      <div v-show="diagnostics" class="conversation-meta-strip">
        <span>Loaded <strong data-testid="segment-range">{{ uiState.rangeStart.toLocaleString() }} – {{ Math.max(uiState.rangeStart, uiState.rangeEnd - 1).toLocaleString() }}</strong></span>
        <span>Reader <strong data-testid="reader-position">#{{ uiState.reader.toLocaleString() }}</strong></span>
        <span data-testid="mounted-label">{{ uiState.mountedRows }} DOM rows</span><span v-if="uiState.streamTarget" data-testid="follow-state">{{ followLabel }}</span>
      </div>

      <div v-if="order.length === 0" class="empty-conversation" data-testid="empty-conversation"><div class="empty-agent-mark">✦</div><h2>Start a new agent session</h2><p>Ask a question or give the agent a task. The session can keep running while you switch elsewhere.</p></div>

      <VList v-else :key="`${runtime.id}:${uiState.virtualEpoch}`" ref="listRef" class="conversation-vlist" :data="order" :item-size="VIRTUAL_ITEM_HINT_PX" :buffer-size="VIRTUAL_BUFFER_PX" :shift="runtime.shiftMode" :item-props="itemProps" @scroll="onVirtualScroll" @scroll-end="onVirtualScrollEnd">
        <template #default="{ item }"><ConversationNodeSeat :runtime="runtime" :node-id="item" /></template>
      </VList>

      <button v-if="showLatest" class="jump-latest" data-testid="jump-latest" type="button" @click="jumpToLatest"><span>↓</span><strong>Latest</strong><em v-if="messagesAfter > 0" data-testid="messages-after">{{ formatAfter(messagesAfter) }}</em></button>
    </div>

    <footer ref="composerShellRef" class="composer-shell" data-testid="composer-shell">
      <div v-if="uiState.pendingInteraction" class="pending-interaction" data-testid="pending-interaction">
        <div class="pending-icon">!</div><div><strong>{{ uiState.pendingInteraction.title }}</strong><p>{{ uiState.pendingInteraction.detail }}</p></div>
        <div class="pending-actions"><button class="secondary" data-testid="deny-interaction" @click="resolveInteraction(false)">Deny</button><button data-testid="approve-interaction" @click="resolveInteraction(true)">Approve</button></div>
      </div>
      <div v-if="uiState.queuedPrompts > 0" class="queue-banner" data-testid="queue-banner">{{ uiState.queuedPrompts }} follow-up{{ uiState.queuedPrompts === 1 ? '' : 's' }} queued for this session</div>
      <div class="composer-box">
        <textarea ref="composerInputRef" v-model="composerText" data-testid="composer-input" rows="1" :placeholder="composerPlaceholder" :disabled="Boolean(uiState.pendingInteraction)" @input="onComposerInput" @keydown.enter.exact.prevent="sendComposer" />
        <div class="composer-actions">
          <div><button class="composer-icon" title="Attach">＋</button><button class="mode-button">Agent ▾</button><button class="mode-button">Model ▾</button></div>
          <div><span class="context-meter">{{ runtime.logicalCount.toLocaleString() }} messages</span><button v-if="uiState.sessionStatus === 'working'" class="stop-button" data-testid="composer-stop" title="Stop run" @click="abortRun">■</button><button class="send-button" :class="{ queued: uiState.sessionStatus === 'working' }" :disabled="!canSend" :title="sendLabel" @click="sendComposer">{{ uiState.sessionStatus === 'working' ? '↗' : '↑' }}</button></div>
        </div>
      </div>
      <span class="composer-hint">Enter to send · background runs survive session switches · drafts are session-scoped</span>
    </footer>
  </main>
</template>
