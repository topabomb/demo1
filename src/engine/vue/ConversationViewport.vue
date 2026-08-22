<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { VList, type VListHandle } from 'virtua/vue'
import type { ConversationExecutionController } from '../conversation/contracts'
import {
  billedInputTokens,
  cacheHitPercent,
  contextOccupancyPercent,
  deriveSessionIndicator,
  formatTokens,
  sessionIndicatorLabel,
} from '../conversation/session-semantics'
import type { ConversationSessionRuntime, SessionUiSnapshot, ShiftPlan } from '../runtime/session-runtime'
import type { SessionViewMemory } from '../viewport/state'
import { VIEWPORT_POLICY, type CommittedViewportAnchor } from '../viewport/contracts'
import ConversationNodeSeat from './ConversationNodeSeat.vue'
import type { RendererResolver } from './renderers/registry'
import { ViewportNavigationController } from './viewport-navigation-controller'

const props = defineProps<{ runtime: ConversationSessionRuntime; stream: ConversationExecutionController; uiState: SessionUiSnapshot; renderers?: RendererResolver }>()
const emit = defineEmits<{ viewportMetrics: [metrics: { mountedRows: number }] }>()

const VIRTUAL_BUFFER_PX = 900
const VIRTUAL_ITEM_HINT_PX = 180

const listRef = ref<VListHandle | null>(null)
const scrollStageRef = ref<HTMLElement | null>(null)
const composerInputRef = ref<HTMLTextAreaElement | null>(null)
const composerShellRef = ref<HTMLElement | null>(null)
const order = shallowRef<string[]>([...props.runtime.projection.order])
const composerText = ref(props.runtime.draftText)
const mountedRows = ref(0)
const shifting = ref(false)
const uiState = computed(() => props.uiState)
let metricsFrame = 0
let viewportResizeFrame = 0
let viewportResizeRunning = false
let viewportResizeQueued = false
let viewportObserver: ResizeObserver | null = null
let unsubscribeOrder: (() => void) | null = null
let pendingComposerAnchor: CommittedViewportAnchor | null = null
let pendingComposerPinned = false

const messagesAfter = computed(() => uiState.value.messagesAfter)
const showLatest = computed(() => props.runtime.logicalCount > 0 && (!uiState.value.atVisualBottom || messagesAfter.value > 0))
const followLabel = computed(() => uiState.value.followTail ? 'following tail' : 'tail paused')
const sessionIndicator = computed(() => {
  void uiState.value.eventRevision
  return deriveSessionIndicator(props.runtime.kernel.summary)
})
const statusLabel = computed(() => sessionIndicatorLabel(sessionIndicator.value))
const canSend = computed(() => Boolean(composerText.value.trim()) && !uiState.value.pendingInteraction)
const sendLabel = computed(() => uiState.value.sessionStatus === 'working' ? 'Queue prompt' : 'Send prompt')
const composerPlaceholder = computed(() => uiState.value.pendingInteraction
  ? 'Resolve the pending request before continuing…'
  : uiState.value.sessionStatus === 'working'
    ? 'Queue a follow-up while the agent is working…'
    : 'Ask the agent anything…')
const tokenUsage = computed(() => {
  void uiState.value.eventRevision
  return props.runtime.kernel.usage
})
const billedInput = computed(() => billedInputTokens(tokenUsage.value))
const cacheHit = computed(() => cacheHitPercent(tokenUsage.value))
const contextPercent = computed(() => contextOccupancyPercent(props.runtime.kernel.context))
const interactionPrimary = computed(() => uiState.value.pendingInteraction?.kind === 'question' ? 'Continue' : 'Approve')
const interactionSecondary = computed(() => uiState.value.pendingInteraction?.kind === 'question' ? 'Skip' : 'Deny')

function frame(): Promise<void> { return new Promise(resolve => requestAnimationFrame(() => resolve())) }
async function settleFrames(count = 2): Promise<void> { for (let i = 0; i < count; i += 1) { await nextTick(); await frame() } }
function nodeFor(id: string) { return props.runtime.projection.getNode(id) }
function itemProps({ item, index }: { item: string; index: number }) {
  const node = nodeFor(item)
  return {
    class: 'virtua-row',
    'data-virtual-item': 'true',
    'data-index': index,
    'data-message-index': node?.messageIndex ?? -1,
    'data-render-unit': item,
    'data-session-id': props.runtime.id,
  }
}

const navigation = new ViewportNavigationController({
  runtime: props.runtime,
  getOrder: () => order.value,
  getList: () => listRef.value,
  getStage: () => scrollStageRef.value,
  getVirtualEpoch: () => uiState.value.virtualEpoch,
  settleFrames,
  onNavigationSettled: () => { if (viewportResizeQueued) scheduleViewportResizeReconcile() },
})

function refreshMountedRows(): void {
  if (metricsFrame) return
  metricsFrame = requestAnimationFrame(() => {
    metricsFrame = 0
    const next = scrollStageRef.value?.querySelectorAll('[data-virtual-item="true"]').length ?? 0
    if (mountedRows.value === next) return
    mountedRows.value = next
    emit('viewportMetrics', { mountedRows: next })
  })
}

function onUserWheel(event: WheelEvent): void {
  const direction: -1 | 0 | 1 = event.deltaY < 0 ? -1 : event.deltaY > 0 ? 1 : 0
  navigation.markUserIntent(direction)
  if (direction < 0 && uiState.value.streamTarget && props.runtime.followTail) {
    event.preventDefault(); props.runtime.setFollowTail(false); const delta = event.deltaY
    requestAnimationFrame(() => { if (!props.runtime.followTail) listRef.value?.scrollBy(delta) })
  }
}
function onUserPointerDown(): void { navigation.markUserIntent(0) }
function onVirtualScroll(offset: number): void {
  navigation.recordScrollOffset(offset)
  const hasIntent = navigation.hasUserIntent()
  if (hasIntent) navigation.updateReaderFromUserScroll(offset)
  refreshMountedRows()
  if (!hasIntent || !uiState.value.streamTarget) return
  if (navigation.scrollDirection < 0) props.runtime.setFollowTail(false)
  else if (navigation.scrollDirection > 0 && navigation.remainingToBottom() < VIEWPORT_POLICY.bottomTolerancePx) props.runtime.setFollowTail(true)
}
function onVirtualScrollEnd(): void {
  refreshMountedRows()
  const hasUserIntent = navigation.hasUserIntent()
  if (hasUserIntent) navigation.rememberCommittedAnchor()
  if (shifting.value || !hasUserIntent) return
  if (navigation.scrollDirection < 0 && (listRef.value?.scrollOffset ?? Infinity) < VIEWPORT_POLICY.edgeThresholdPx) void shiftBackward()
  else if (navigation.scrollDirection > 0 && navigation.remainingToBottom() < VIEWPORT_POLICY.edgeThresholdPx) void shiftForward()
}

async function applyShift(plan: ShiftPlan): Promise<void> {
  const readerBefore = props.runtime.currentLogicalPosition
  const anchor = navigation.committedAnchor ?? navigation.captureCommittedAnchor()
  if (plan.direction === 'backward') { props.runtime.applyIntermediate(plan.intermediate, true); await settleFrames(3); props.runtime.commitShift(plan, false); await settleFrames(2) }
  else { props.runtime.applyIntermediate(plan.intermediate, false); await settleFrames(2); props.runtime.commitShift(plan, true); await settleFrames(3) }
  props.runtime.finishShift()
  if (anchor) await navigation.restoreListAnchor(anchor)
  props.runtime.setReaderPosition(readerBefore, false)
  await nextTick(); refreshMountedRows()
}
async function shiftBackward(): Promise<void> { if (shifting.value) return; const plan = props.runtime.planShiftBackward(); if (!plan) return; shifting.value = true; navigation.clearUserIntent(); props.runtime.setFollowTail(false); await applyShift(plan); shifting.value = false }
async function shiftForward(): Promise<void> { if (shifting.value) return; const plan = props.runtime.planShiftForward(); if (!plan) return; shifting.value = true; navigation.clearUserIntent(); await applyShift(plan); shifting.value = false }

async function jumpToMessage(raw = props.runtime.currentLogicalPosition): Promise<void> {
  if (props.runtime.logicalCount <= 0) return
  const revision = navigation.begin()
  try {
    const target = Math.max(0, Math.min(props.runtime.logicalCount - 1, Math.floor(Number(raw) || 0)))
    navigation.clearUserIntent()
    const previousEpoch = uiState.value.virtualEpoch
    const previousHandle = listRef.value
    props.runtime.jump(target)
    if (!await navigation.waitForJumpEpoch(previousEpoch, previousHandle, target, revision)) return
    await navigation.scrollToLogical(target, 'center', revision)
  } finally {
    navigation.finish(revision)
  }
}
async function jumpToLatest(): Promise<void> {
  if (props.runtime.logicalCount <= 0) return
  const revision = navigation.begin()
  try {
    navigation.clearUserIntent()
    const last = props.runtime.logicalCount - 1
    if (props.runtime.range.end !== props.runtime.logicalCount) {
      const previousEpoch = uiState.value.virtualEpoch
      const previousHandle = listRef.value
      props.runtime.jump(last)
      props.runtime.refreshProjection()
      if (!await navigation.waitForJumpEpoch(previousEpoch, previousHandle, last, revision)) return
    } else {
      props.runtime.refreshProjection()
      await settleFrames(1)
      if (!navigation.isCurrent(revision)) return
    }
    if (!await navigation.scrollToLogical(last, 'end', revision)) return
    const pinned = await navigation.pinMeasuredEnd(VIEWPORT_POLICY.restoreAttempts, revision)
    if (!navigation.isCurrent(revision)) return
    props.runtime.setFollowTail(props.stream.running && pinned)
  } finally {
    navigation.finish(revision)
  }
}

function abortRun(): void { props.stream.abort() }
function resolveInteraction(approved: boolean): void { props.stream.resolveInteraction(approved) }

function resizeComposer(): void {
  const input = composerInputRef.value
  if (!input) return
  input.style.height = '0px'
  input.style.height = `${Math.max(1, input.scrollHeight)}px`
  input.style.overflowY = input.scrollHeight > input.clientHeight ? 'auto' : 'hidden'
}
function capturePendingLayoutIntent(): void {
  const shouldPin = pendingComposerPinned
    || (props.runtime.atVisualBottom && props.runtime.range.end === props.runtime.logicalCount)
  if (shouldPin) {
    pendingComposerPinned = true
    pendingComposerAnchor = null
    return
  }
  if (!pendingComposerAnchor) pendingComposerAnchor = navigation.committedAnchor ?? navigation.captureCommittedAnchor()
  if (!navigation.committedAnchor && pendingComposerAnchor) navigation.committedAnchor = pendingComposerAnchor
}
function onComposerInput(): void {
  props.runtime.setDraftText(composerText.value)
  capturePendingLayoutIntent()
  void nextTick().then(resizeComposer)
}
async function sendComposer(): Promise<void> {
  const prompt = composerText.value.trim()
  if (!prompt || uiState.value.pendingInteraction) return
  const disposition = props.stream.submit(prompt)
  if (disposition === 'blocked') return
  composerText.value = ''; props.runtime.setDraftText('')
  capturePendingLayoutIntent()
  await nextTick(); resizeComposer()
  if (disposition === 'started') { await settleFrames(2); await jumpToLatest() }
}
function scheduleViewportResizeReconcile(): void {
  viewportResizeQueued = true
  if (navigation.running || viewportResizeFrame || viewportResizeRunning) return
  viewportResizeFrame = requestAnimationFrame(() => {
    viewportResizeFrame = 0
    void reconcileViewportResize()
  })
}
async function reconcileViewportResize(): Promise<void> {
  if (navigation.running || viewportResizeRunning) return
  viewportResizeRunning = true
  try {
    while (viewportResizeQueued && !navigation.running) {
      viewportResizeQueued = false
      const readerBefore = props.runtime.currentLogicalPosition
      await settleFrames(2)
      if (navigation.running) { viewportResizeQueued = true; break }
      const pin = pendingComposerPinned || (pendingComposerAnchor === null && (props.runtime.atVisualBottom || props.runtime.followTail))
      const anchor = pendingComposerAnchor ?? navigation.committedAnchor
      pendingComposerPinned = false; pendingComposerAnchor = null
      if (pin && props.runtime.range.end === props.runtime.logicalCount) await navigation.pinMeasuredEnd()
      else if (anchor) {
        const restored = await navigation.restoreListAnchor(anchor)
        if (restored) props.runtime.setReaderPosition(readerBefore, false)
      } else props.runtime.setReaderPosition(readerBefore, false)
      refreshMountedRows()
    }
  } finally {
    viewportResizeRunning = false
    if (viewportResizeQueued && !navigation.running) scheduleViewportResizeReconcile()
  }
}
function captureSnapshot(): SessionViewMemory {
  const anchor = navigation.committedAnchor ?? navigation.captureCommittedAnchor()
  if (anchor) navigation.committedAnchor = anchor
  const snapshot = anchor ? props.runtime.snapshot(anchor.id, anchor.offsetPx) : props.runtime.snapshot()
  props.runtime.rememberSnapshot(snapshot)
  return snapshot
}
async function restoreSnapshot(): Promise<void> {
  const revision = navigation.begin()
  try {
    const snapshot = props.runtime.rememberedSnapshot
    await settleFrames(3)
    if (!navigation.isCurrent(revision)) return
    const list = listRef.value
    if (!list || order.value.length === 0) { refreshMountedRows(); return }
    if (snapshot.atVisualBottom && props.runtime.range.end === props.runtime.logicalCount) {
      props.runtime.refreshProjection()
      await settleFrames(1)
      if (!navigation.isCurrent(revision)) return
      if (!await navigation.scrollToLogical(props.runtime.logicalCount - 1, 'end', revision)) return
      await navigation.pinMeasuredEnd(VIEWPORT_POLICY.restoreAttempts, revision)
    } else if (snapshot.anchorUnitId && order.value.includes(snapshot.anchorUnitId)) {
      const restored = await navigation.restoreListAnchor({ id: snapshot.anchorUnitId, offsetPx: snapshot.anchorOffsetPx, viewportTopPx: snapshot.anchorOffsetPx }, revision)
      if (restored && navigation.isCurrent(revision)) props.runtime.setReaderPosition(snapshot.logicalPosition, false)
    } else {
      await navigation.scrollToLogical(snapshot.logicalPosition, 'center', revision)
    }
    if (!navigation.isCurrent(revision)) return
    await settleFrames(2)
    navigation.setScrollOffset(listRef.value?.scrollOffset ?? 0)
    if (!snapshot.atVisualBottom && !navigation.committedAnchor) navigation.rememberCommittedAnchor()
    refreshMountedRows()
  } finally {
    navigation.finish(revision)
  }
}
function formatAfter(count: number): string { return count.toLocaleString('en-US') }
function attachViewportObserver(): void {
  viewportObserver?.disconnect(); viewportObserver = new ResizeObserver(scheduleViewportResizeReconcile)
  if (scrollStageRef.value) viewportObserver.observe(scrollStageRef.value)
  if (composerShellRef.value) viewportObserver.observe(composerShellRef.value)
  navigation.rememberCommittedAnchor()
}

watch(() => props.uiState.eventRevision, (next, previous) => {
  if (next === previous || !props.uiState.followTail) return
  void nextTick().then(() => listRef.value?.scrollToIndex(Math.max(0, order.value.length - 1), { align: 'end' }))
})

onMounted(() => {
  unsubscribeOrder = props.runtime.projection.subscribeOrder(() => { order.value = [...props.runtime.projection.order] })
  resizeComposer(); void restoreSnapshot().then(attachViewportObserver)
})

onBeforeUnmount(() => {
  navigation.invalidate()
  props.runtime.setDraftText(composerText.value); props.runtime.rememberSnapshot(captureSnapshot())
  unsubscribeOrder?.(); viewportObserver?.disconnect()
  if (metricsFrame) cancelAnimationFrame(metricsFrame)
  if (viewportResizeFrame) cancelAnimationFrame(viewportResizeFrame)
})

defineExpose({ captureSnapshot, jumpToMessage, jumpToLatest, shiftBackward, shiftForward })
</script>

<template>
  <main class="conversation-shell" data-conversation-engine="vue" :data-session-id="runtime.id">
    <header class="conversation-header">
      <div class="conversation-heading">
        <div class="conversation-title"><strong>{{ runtime.title }}</strong><span>conversation / {{ runtime.id }}</span></div>
        <div class="conversation-header-context"><slot name="header-context" /></div>
      </div>
      <div class="conversation-header-actions">
        <slot name="header-actions" />
        <span class="run-status" :class="`indicator-${sessionIndicator}`" :title="runtime.kernel.lastFailure?.message"><i /> {{ statusLabel }}</span>
        <button v-if="uiState.sessionStatus === 'working'" class="header-stop" data-testid="abort-run" type="button" title="Stop run" @click="abortRun">■</button>
      </div>
    </header>

    <div ref="scrollStageRef" class="scroll-stage" data-testid="scrollport" @wheel.capture="onUserWheel" @pointerdown.capture="onUserPointerDown">
      <slot name="viewport-overlay" :mounted-rows="mountedRows" :follow-label="followLabel" :ui-state="uiState" />

      <div v-if="order.length === 0" class="empty-conversation" data-testid="empty-conversation"><div class="empty-agent-mark">✦</div><h2>Start a conversation</h2><p>Send a prompt to begin. Session state is independent from the mounted viewport.</p></div>

      <VList v-else :key="`${runtime.id}:${uiState.virtualEpoch}`" ref="listRef" class="conversation-vlist" :data="order" :item-size="VIRTUAL_ITEM_HINT_PX" :buffer-size="VIRTUAL_BUFFER_PX" :shift="runtime.shiftMode" :item-props="itemProps" @scroll="onVirtualScroll" @scroll-end="onVirtualScrollEnd">
        <template #default="{ item }"><ConversationNodeSeat :runtime="runtime" :node-id="item" :renderers="renderers" /></template>
      </VList>

      <button v-if="showLatest" class="jump-latest" data-testid="jump-latest" type="button" @click="jumpToLatest"><span>↓</span><strong>Latest</strong><em v-if="messagesAfter > 0" data-testid="messages-after">{{ formatAfter(messagesAfter) }}</em></button>
    </div>

    <footer ref="composerShellRef" class="composer-shell" data-testid="composer-shell">
      <div v-if="uiState.pendingInteraction" class="pending-interaction" data-testid="pending-interaction" :data-kind="uiState.pendingInteraction.kind">
        <div class="pending-icon">!</div><div><strong>{{ uiState.pendingInteraction.title }}</strong><p>{{ uiState.pendingInteraction.detail }}</p></div>
        <div class="pending-actions"><button class="secondary" data-testid="deny-interaction" type="button" @click="resolveInteraction(false)">{{ interactionSecondary }}</button><button data-testid="approve-interaction" type="button" @click="resolveInteraction(true)">{{ interactionPrimary }}</button></div>
      </div>
      <div v-else-if="sessionIndicator === 'failed'" class="turn-outcome-banner failure" data-testid="last-turn-failure"><strong>Last turn failed</strong><span>{{ runtime.kernel.lastFailure?.code }} · {{ runtime.kernel.lastFailure?.message }}</span></div>
      <div v-else-if="sessionIndicator === 'max-tokens'" class="turn-outcome-banner warning"><strong>Last turn reached the output-token limit</strong><span>You can continue this session with another prompt.</span></div>
      <div v-if="uiState.queuedPrompts > 0" class="queue-banner" data-testid="queue-banner">{{ uiState.queuedPrompts }} follow-up{{ uiState.queuedPrompts === 1 ? '' : 's' }} queued for this session</div>
      <div class="composer-box">
        <textarea ref="composerInputRef" v-model="composerText" data-testid="composer-input" rows="1" :placeholder="composerPlaceholder" :disabled="Boolean(uiState.pendingInteraction)" @input="onComposerInput" @keydown.enter.exact.prevent="sendComposer" />
        <div class="composer-actions">
          <div class="composer-extension"><slot name="composer-tools" /></div>
          <div><span class="context-meter" data-testid="stats-context">{{ contextPercent ?? 0 }}% context</span><button v-if="uiState.sessionStatus === 'working'" class="stop-button" data-testid="composer-stop" type="button" title="Stop run" @click="abortRun">■</button><button class="send-button" :class="{ queued: uiState.sessionStatus === 'working' }" :disabled="!canSend" type="button" :title="sendLabel" @click="sendComposer">{{ uiState.sessionStatus === 'working' ? '↗' : '↑' }}</button></div>
        </div>
      </div>
      <div class="session-stats-line" data-testid="session-stats-line">
        <span>{{ runtime.kernel.turnCount.toLocaleString() }} turns · {{ runtime.kernel.stepCount.toLocaleString() }} steps</span>
        <span v-if="cacheHit !== null" data-testid="stats-cache-hit">cache {{ cacheHit }}%</span>
        <span data-testid="stats-input-tokens">in {{ formatTokens(billedInput) }}</span>
        <span data-testid="stats-output-tokens">out {{ formatTokens(tokenUsage.outputTokens) }}</span>
        <span v-if="tokenUsage.reasoningTokens > 0">reasoning {{ formatTokens(tokenUsage.reasoningTokens) }}</span>
      </div>
      <span class="composer-hint">Enter to send</span>
    </footer>
  </main>
</template>