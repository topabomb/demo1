<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowReactive, shallowRef } from 'vue'
import { VList, type VListHandle } from 'virtua/vue'
import RenderUnitView from './RenderUnitView.vue'
import { SyntheticConversationSource } from '../core/synthetic'
import { WindowMaterializer } from '../core/window-materializer'
import { PageHeightIndex, DEFAULT_PAGE_SIZE } from '../core/page-index'
import { usePerformanceMetrics } from '../core/perf'
import { touchedFoldStateCount } from './renderers/fold-state'
import { highlightCacheSize } from './renderers/highlight-client'
import type { RenderUnit } from '../core/types'

const WINDOW_MESSAGES = 2048
const SHIFT_MESSAGES = 512
const EDGE_THRESHOLD_PX = 900
const FOLLOW_THRESHOLD_PX = 140
const LIVE_CHUNK_LIMIT = 6500
const USER_SCROLL_INTENT_MS = 650
const VIRTUAL_BUFFER_PX = 900
const VIRTUAL_ITEM_HINT_PX = 180

const logicalCount = ref(1_000_000)
const source = shallowRef(new SyntheticConversationSource(logicalCount.value))
const windowModel = shallowRef(new WindowMaterializer(source.value, WINDOW_MESSAGES, SHIFT_MESSAGES))
const pageHeights = shallowRef(new PageHeightIndex(logicalCount.value))
const activeUnits = shallowRef<RenderUnit[]>([...windowModel.value.units])
const liveTailUnits = shallowRef<RenderUnit[]>([])
const overrides = shallowReactive(new Map<string, RenderUnit>())

const listRef = ref<VListHandle | null>(null)
const scrollStageRef = ref<HTMLElement | null>(null)
const virtualEpoch = ref(0)
const shiftMode = ref(false)
const segmentStart = ref(windowModel.value.range.start)
const segmentEnd = ref(windowModel.value.range.end)
const jumpInput = ref(Math.floor(logicalCount.value / 2))
const shifting = ref(false)
const streamRate = ref(20)
const streamIngressTicks = ref(0)
const streamRenderTicks = ref(0)
const streamTarget = ref<string | null>(null)
const diagnosticsOpen = ref(true)
const composerText = ref('')
const followTail = ref(true)
const mountedRows = ref(0)
const currentLogicalPosition = ref(segmentEnd.value - 1)
const foldStateCount = ref(0)
const highlightEntries = ref(0)

let streamTimer: number | null = null
let streamFrame = 0
let metricsFrame = 0
let pendingDelta = ''
let streamChunkText = ''
let streamBaseUnit: RenderUnit | null = null
let tailIntentGeneration = 0
let userScrollIntentUntil = 0
let userScrollDirection: -1 | 0 | 1 = 0
let lastScrollOffset = 0

const sessions = [
  ['Million-message stress session', 'now'],
  ['DSH transport architecture', '14m'],
  ['Virtualized tool-call rendering', '1h'],
  ['Agent event normalization', '2h'],
  ['Dynamic height edge cases', '4h'],
  ['Workspace filesystem design', '1d'],
  ['Android client protocol notes', '2d'],
  ['Long context cache analysis', '3d'],
]

const { fps, frameP95, longTasks, heapMb } = usePerformanceMetrics()
const atTailSegment = computed(() => segmentEnd.value === logicalCount.value)
const displayUnits = computed<RenderUnit[]>(() => atTailSegment.value
  ? [...activeUnits.value, ...liveTailUnits.value]
  : [...activeUnits.value])
const activeUnitCount = computed(() => displayUnits.value.length)
const estimatedTotalHeight = computed(() => pageHeights.value.estimatedTotalHeight())

function resolvedUnit(unit: RenderUnit): RenderUnit {
  return overrides.get(unit.id) ?? unit
}

function itemProps({ item, index }: { item: RenderUnit; index: number }) {
  return {
    class: 'virtua-row',
    'data-index': index,
    'data-message-index': item.messageIndex,
    'data-render-unit': item.id,
  }
}

function frame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

async function settleFrames(count = 2): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await nextTick()
    await frame()
  }
}

function refreshMountedRows() {
  if (metricsFrame) return
  metricsFrame = requestAnimationFrame(() => {
    metricsFrame = 0
    mountedRows.value = scrollStageRef.value?.querySelectorAll('.virtua-row').length ?? 0
    foldStateCount.value = touchedFoldStateCount()
    highlightEntries.value = highlightCacheSize()
  })
}

function syncRange() {
  const range = windowModel.value.range
  segmentStart.value = range.start
  segmentEnd.value = range.end
  updatePageEstimates()
}

function updatePageEstimates() {
  const byPage = new Map<number, { height: number; messages: Set<number> }>()
  for (const unit of activeUnits.value) {
    const page = Math.floor(unit.messageIndex / DEFAULT_PAGE_SIZE)
    let bucket = byPage.get(page)
    if (!bucket) {
      bucket = { height: 0, messages: new Set() }
      byPage.set(page, bucket)
    }
    bucket.height += unit.estimatePx
    bucket.messages.add(unit.messageIndex)
  }
  for (const [page, bucket] of byPage) {
    const scale = DEFAULT_PAGE_SIZE / Math.max(1, bucket.messages.size)
    pageHeights.value.updatePage(page, bucket.height * scale)
  }
}

function pruneOverrides() {
  const activeIds = new Set([...activeUnits.value, ...liveTailUnits.value].map(unit => unit.id))
  for (const key of overrides.keys()) if (!activeIds.has(key)) overrides.delete(key)
}

function remainingToBottom(): number {
  const list = listRef.value
  if (!list) return Number.POSITIVE_INFINITY
  return Math.max(0, list.scrollSize - list.scrollOffset - list.viewportSize)
}

function updateLogicalPosition(offset = listRef.value?.scrollOffset ?? 0) {
  const list = listRef.value
  if (!list || displayUnits.value.length === 0) return
  const probe = Math.max(0, offset + list.viewportSize * 0.65)
  const index = Math.max(0, Math.min(displayUnits.value.length - 1, list.findItemIndex(probe)))
  const unit = displayUnits.value[index]
  if (unit) currentLogicalPosition.value = unit.messageIndex
}

function escapeTailFollow() {
  if (!streamTarget.value) return
  if (followTail.value) {
    followTail.value = false
    tailIntentGeneration += 1
  }
}

function resumeTailFollow() {
  if (!streamTarget.value || followTail.value) return
  followTail.value = true
  tailIntentGeneration += 1
}

function markUserScrollIntent(direction: -1 | 0 | 1) {
  userScrollIntentUntil = performance.now() + USER_SCROLL_INTENT_MS
  if (direction !== 0) userScrollDirection = direction
}

function clearUserScrollIntent() {
  userScrollIntentUntil = 0
  userScrollDirection = 0
}

function onUserWheel(event: WheelEvent) {
  const direction: -1 | 0 | 1 = event.deltaY < 0 ? -1 : event.deltaY > 0 ? 1 : 0
  markUserScrollIntent(direction)
  if (direction < 0) escapeTailFollow()
}

function onUserPointerDown() {
  markUserScrollIntent(0)
}

function onVirtualScroll(offset: number) {
  const inferredDirection: -1 | 0 | 1 = offset < lastScrollOffset ? -1 : offset > lastScrollOffset ? 1 : 0
  lastScrollOffset = offset
  const hasUserIntent = performance.now() < userScrollIntentUntil
  if (hasUserIntent && inferredDirection !== 0) userScrollDirection = inferredDirection

  updateLogicalPosition(offset)
  refreshMountedRows()

  // Tail following is reader intent, not a geometric side effect. A stale
  // programmatic scroll event near the bottom must never re-enable follow after
  // the user has started scrolling upward. Follow resumes only when a user-driven
  // downward scroll explicitly returns to the bottom threshold.
  if (!streamTarget.value || !hasUserIntent) return
  const remaining = remainingToBottom()
  if (userScrollDirection < 0) escapeTailFollow()
  else if (userScrollDirection > 0 && remaining < 32) resumeTailFollow()
}

function onVirtualScrollEnd() {
  refreshMountedRows()
  if (shifting.value || performance.now() >= userScrollIntentUntil) return
  const list = listRef.value
  if (!list) return

  const remaining = remainingToBottom()
  if (userScrollDirection < 0 && list.scrollOffset < EDGE_THRESHOLD_PX) void shiftBackward()
  else if (userScrollDirection > 0 && remaining < EDGE_THRESHOLD_PX) void shiftForward()
}

async function shiftBackward() {
  if (shifting.value || windowModel.value.range.start === 0) return
  shifting.value = true
  clearUserScrollIntent()
  escapeTailFollow()

  const previous = windowModel.value.range
  const oldUnits = [...activeUnits.value]
  const finalUnits = [...windowModel.value.shiftBackward()]
  const incoming = finalUnits.filter(unit => unit.messageIndex < previous.start)

  // Virtua's shift mode is specifically defined for insert/remove at the list start.
  // First grow the window by prepending history so stable keyed rows stay anchored.
  shiftMode.value = true
  activeUnits.value = [...incoming, ...oldUnits]
  syncRange()
  await settleFrames(3)

  // The tail trim does not move rows before the reader, so turn shift off before
  // returning to the normal bounded 2048-message hot window.
  shiftMode.value = false
  activeUnits.value = finalUnits
  await settleFrames(2)
  pruneOverrides()
  updateLogicalPosition()
  refreshMountedRows()
  shifting.value = false
}

async function shiftForward() {
  if (shifting.value || windowModel.value.range.end === logicalCount.value) return
  shifting.value = true
  clearUserScrollIntent()

  const previous = windowModel.value.range
  const oldUnits = [...activeUnits.value]
  const finalUnits = [...windowModel.value.shiftForward()]
  const incoming = finalUnits.filter(unit => unit.messageIndex >= previous.end)

  // Appending at the end is start-relative and needs no shift compensation.
  shiftMode.value = false
  activeUnits.value = [...oldUnits, ...incoming]
  syncRange()
  await settleFrames(2)

  // Removing the old head is exactly Virtua's reverse-infinite-scroll use case.
  shiftMode.value = true
  activeUnits.value = finalUnits
  await settleFrames(3)
  shiftMode.value = false
  await nextTick()
  pruneOverrides()
  updateLogicalPosition()
  refreshMountedRows()
  shifting.value = false
}

async function scrollToMessage(target: number) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const list = listRef.value
    if (!list) {
      await settleFrames(1)
      continue
    }
    const index = displayUnits.value.findIndex(unit => unit.messageIndex === target)
    if (index < 0) return
    list.scrollToIndex(index, { align: 'center' })
    await settleFrames(2)

    const mounted = scrollStageRef.value?.querySelector(`[data-message-index="${target}"]`)
    if (mounted) break
  }
  lastScrollOffset = listRef.value?.scrollOffset ?? 0
  updateLogicalPosition()
  refreshMountedRows()
}

async function jumpToMessage(raw = jumpInput.value) {
  const target = Math.max(0, Math.min(logicalCount.value - 1, Math.floor(Number(raw) || 0)))
  stopStreaming()
  shifting.value = true
  clearUserScrollIntent()
  shiftMode.value = false

  activeUnits.value = [...windowModel.value.jump(target)]
  liveTailUnits.value = []
  syncRange()
  pruneOverrides()

  // A random jump is a new physical coordinate system. Remounting a bounded
  // virtualizer is cheaper and more correct than carrying measurements from an
  // unrelated 2048-message segment and trying to compensate them with DOM math.
  virtualEpoch.value += 1
  await settleFrames(3)
  await scrollToMessage(target)

  currentLogicalPosition.value = target
  jumpInput.value = target
  shifting.value = false
}

async function configureCount(count: number) {
  stopStreaming()
  logicalCount.value = count
  source.value = new SyntheticConversationSource(count)
  windowModel.value = new WindowMaterializer(source.value, WINDOW_MESSAGES, SHIFT_MESSAGES)
  pageHeights.value = new PageHeightIndex(count)
  activeUnits.value = [...windowModel.value.units]
  liveTailUnits.value = []
  shiftMode.value = false
  syncRange()
  pruneOverrides()
  virtualEpoch.value += 1
  jumpInput.value = Math.floor(count / 2)
  currentLogicalPosition.value = count - 1
  await settleFrames(3)
  void startStreaming(false)
}

function randomJump() {
  const next = (Math.imul(currentLogicalPosition.value + 17, 1103515245) + 12345) >>> 0
  void jumpToMessage(next % logicalCount.value)
}

function createNextLiveChunk(previous: RenderUnit): RenderUnit {
  const chunkIndex = liveTailUnits.value.length + 1
  return {
    ...previous,
    id: `${previous.messageId}:live-extra-${chunkIndex}`,
    revision: 0,
    estimatePx: 180,
    payload: { ...previous.payload, markdown: '', live: true, partIndex: chunkIndex, partCount: chunkIndex + 1 },
  }
}

function nextSyntheticDelta(): string {
  const n = streamIngressTicks.value
  const phrases = [
    'I inspected the affected render path and preserved stable node identity.',
    'The next step is validating dynamic measurements before changing the scroll anchor.',
    'Tool output is folded structurally so hidden payload does not inflate the DOM.',
    'Streaming deltas are coalesced to animation frames instead of publishing every token.',
    'Backend events remain normalized behind the canonical conversation boundary.',
  ]
  if (n % 11 === 0) return `\n\n### Progress ${Math.floor(n / 11) + 1}\n\n${phrases[n % phrases.length]} `
  return `${phrases[n % phrases.length]} `
}

function publishStreamFrame() {
  streamFrame = 0
  if (!pendingDelta || !streamTarget.value || !streamBaseUnit) return

  if (streamChunkText.length >= LIVE_CHUNK_LIMIT) {
    const next = createNextLiveChunk(streamBaseUnit)
    liveTailUnits.value = [...liveTailUnits.value, next]
    streamBaseUnit = next
    streamTarget.value = next.id
    streamChunkText = ''
    pendingDelta = `${pendingDelta}\n\n`
  }

  streamChunkText += pendingDelta
  pendingDelta = ''
  const currentTarget = streamTarget.value
  overrides.set(currentTarget, {
    ...streamBaseUnit,
    revision: streamBaseUnit.revision + streamRenderTicks.value + 1,
    estimatePx: Math.max(streamBaseUnit.estimatePx, 180 + Math.min(5200, streamChunkText.length * 0.12)),
    payload: { ...streamBaseUnit.payload, markdown: streamChunkText, live: true },
  })
  streamRenderTicks.value += 1
  refreshMountedRows()
  if (followTail.value) void stickToTail(false)
}

function ingestStreamDelta() {
  streamIngressTicks.value += 1
  pendingDelta += nextSyntheticDelta()
  if (!streamFrame) streamFrame = requestAnimationFrame(publishStreamFrame)
}

async function stickToTail(force: boolean) {
  if (!atTailSegment.value || displayUnits.value.length === 0) return
  if (!force && !followTail.value) return
  const intent = tailIntentGeneration

  await nextTick()
  if (intent !== tailIntentGeneration || (!force && !followTail.value)) return
  listRef.value?.scrollToIndex(displayUnits.value.length - 1, { align: 'end' })
  await frame()

  if (intent !== tailIntentGeneration || (!force && !followTail.value)) return
  listRef.value?.scrollToIndex(displayUnits.value.length - 1, { align: 'end' })
  await frame()
  updateLogicalPosition()
  refreshMountedRows()
}

async function startStreaming(reset = true) {
  if (reset) stopStreaming()
  if (!atTailSegment.value) await jumpToMessage(logicalCount.value - 1)
  await nextTick()

  const tail = [...activeUnits.value].reverse().find(unit => unit.messageIndex === logicalCount.value - 1)
  if (!tail) return
  if (reset) {
    liveTailUnits.value = []
    for (const key of [...overrides.keys()]) if (key.startsWith(tail.messageId)) overrides.delete(key)
  }

  streamBaseUnit = tail
  streamTarget.value = tail.id
  streamChunkText = String(tail.payload.markdown ?? '')
  pendingDelta = ''
  streamIngressTicks.value = 0
  streamRenderTicks.value = 0
  followTail.value = true
  tailIntentGeneration += 1
  await stickToTail(true)
  streamTimer = window.setInterval(ingestStreamDelta, Math.max(16, Math.round(1000 / streamRate.value)))
}

function stopStreaming(clear = true) {
  if (streamTimer !== null) window.clearInterval(streamTimer)
  streamTimer = null
  if (streamFrame) cancelAnimationFrame(streamFrame)
  streamFrame = 0
  pendingDelta = ''
  streamBaseUnit = null
  tailIntentGeneration += 1
  if (clear) {
    const liveMessageId = `m-${logicalCount.value - 1}`
    for (const key of [...overrides.keys()]) if (key.startsWith(liveMessageId)) overrides.delete(key)
    liveTailUnits.value = []
  }
  streamTarget.value = null
}

function sendComposer() {
  if (!composerText.value.trim()) return
  composerText.value = ''
  void startStreaming(true)
}

function forcePrepend() { void shiftBackward() }
function forceForward() { void shiftForward() }

onMounted(async () => {
  await settleFrames(2)
  lastScrollOffset = listRef.value?.scrollOffset ?? 0
  refreshMountedRows()
  void startStreaming(true)
})

onBeforeUnmount(() => {
  stopStreaming()
  if (metricsFrame) cancelAnimationFrame(metricsFrame)
})
</script>

<template>
  <section class="agent-app" :class="{ 'diagnostics-closed': !diagnosticsOpen }">
    <nav class="workspace-rail" aria-label="Primary navigation">
      <div class="app-mark">N</div>
      <button class="rail-button active" title="Chat">✦</button>
      <button class="rail-button" title="Workspaces">▦</button>
      <button class="rail-button" title="Files">◇</button>
      <button class="rail-button" title="Agents">⌁</button>
      <div class="rail-spacer" />
      <button class="rail-button" title="Settings">⚙</button>
      <div class="avatar">T</div>
    </nav>

    <aside class="session-sidebar">
      <div class="sidebar-head"><div class="product-name">CodeNomad Lab</div><button class="icon-button">⌘</button></div>
      <button class="workspace-picker"><span class="workspace-dot" /> million-message-workspace <span>⌄</span></button>
      <button class="new-session">＋ New session</button>
      <div class="session-search">⌕ <span>Search sessions</span><kbd>⌘K</kbd></div>
      <div class="session-section-label">Recent</div>
      <div class="session-list">
        <button v-for="(session, index) in sessions" :key="session[0]" class="session-row" :class="{ active: index === 0 }">
          <span class="session-glyph">{{ index === 0 ? '✦' : '○' }}</span>
          <span class="session-copy"><strong>{{ session[0] }}</strong><small>{{ index === 0 ? 'Running · synthetic backend' : 'Completed' }}</small></span>
          <time>{{ session[1] }}</time>
        </button>
      </div>
      <div class="sidebar-footer"><span class="status-led" /> Runtime connected <span class="sidebar-version">Vue / Virtua</span></div>
    </aside>

    <main class="conversation-shell">
      <header class="conversation-header">
        <div class="conversation-title"><strong>Million-message stress session</strong><span>million-message-workspace / main</span></div>
        <div class="header-chips">
          <button class="model-chip">Synthetic Agent · 1M context⌄</button>
          <span class="run-status"><i /> {{ streamTarget ? 'streaming' : 'idle' }}</span>
          <button class="header-icon" title="Search">⌕</button>
          <button class="header-icon" title="Diagnostics" @click="diagnosticsOpen = !diagnosticsOpen">◫</button>
        </div>
      </header>

      <div ref="scrollStageRef" class="scroll-stage">
        <VList
          :key="virtualEpoch"
          ref="listRef"
          class="scrollport"
          data-testid="scrollport"
          :data="displayUnits"
          :buffer-size="VIRTUAL_BUFFER_PX"
          :item-size="VIRTUAL_ITEM_HINT_PX"
          :shift="shiftMode"
          :item-props="itemProps"
          @pointerdown.passive="onUserPointerDown"
          @wheel.passive="onUserWheel"
          @scroll="onVirtualScroll"
          @scroll-end="onVirtualScrollEnd"
        >
          <template #default="{ item }">
            <RenderUnitView :key="item.id" :unit="resolvedUnit(item)" />
          </template>
        </VList>

        <div class="conversation-meta-strip">
          <span>Loaded <strong data-testid="segment-range">{{ segmentStart.toLocaleString() }} – {{ (segmentEnd - 1).toLocaleString() }}</strong></span>
          <span>Reader <strong data-testid="reader-position">#{{ currentLogicalPosition.toLocaleString() }}</strong></span>
          <span>{{ mountedRows }} DOM rows</span>
          <span v-if="streamTarget" data-testid="follow-state">{{ followTail ? 'following tail' : 'tail paused' }}</span>
        </div>
      </div>

      <footer class="composer-shell">
        <div class="composer-box">
          <textarea v-model="composerText" rows="2" placeholder="Ask the agent anything…" @keydown.enter.exact.prevent="sendComposer" />
          <div class="composer-actions">
            <div><button class="composer-icon">＋</button><button class="mode-button">Agent ▾</button></div>
            <div><span class="context-meter">{{ logicalCount.toLocaleString() }} synthetic messages</span><button class="send-button" :disabled="!composerText.trim()" @click="sendComposer">↑</button></div>
          </div>
        </div>
        <span class="composer-hint">Enter to send · frame-coalesced live output · Virtua native dynamic-height anchoring</span>
      </footer>
    </main>

    <aside v-if="diagnosticsOpen" class="diagnostics-panel">
      <div class="diagnostics-head"><div><span class="eyebrow">Performance lab</span><strong>Conversation diagnostics</strong></div><button class="icon-button" @click="diagnosticsOpen = false">×</button></div>
      <div class="control-group">
        <label>Logical history</label>
        <div class="segmented" data-testid="count-selector">
          <button :class="{ active: logicalCount === 10_000 }" @click="configureCount(10_000)">10K</button>
          <button :class="{ active: logicalCount === 100_000 }" @click="configureCount(100_000)">100K</button>
          <button :class="{ active: logicalCount === 1_000_000 }" data-testid="count-1m" @click="configureCount(1_000_000)">1M</button>
        </div>
      </div>
      <div class="control-group">
        <label for="jump">Jump to global message</label>
        <div class="inline-control"><input id="jump" v-model.number="jumpInput" data-testid="jump-input" type="number" min="0" :max="logicalCount - 1" /><button data-testid="jump-button" @click="jumpToMessage()">Jump</button></div>
        <button class="secondary wide" @click="randomJump">Deterministic random jump</button>
      </div>
      <div class="control-group">
        <label>History window</label>
        <div class="inline-control"><button class="secondary" data-testid="prepend-button" @click="forcePrepend">← prepend 512</button><button class="secondary" @click="forceForward">append 512 →</button></div>
      </div>
      <div class="control-group">
        <label>Live LLM output</label>
        <div class="inline-control">
          <select v-model.number="streamRate" data-testid="stream-rate"><option :value="5">5 Hz ingress</option><option :value="20">20 Hz ingress</option><option :value="60">60 Hz ingress</option></select>
          <button data-testid="stream-start" @click="startStreaming(true)">Restart</button><button class="secondary" @click="stopStreaming(false)">Pause</button>
        </div>
      </div>
      <div class="metrics" data-testid="metrics">
        <div><span>logical</span><strong data-testid="logical-count">{{ logicalCount.toLocaleString() }}</strong></div>
        <div><span>hot messages</span><strong>{{ (segmentEnd - segmentStart).toLocaleString() }}</strong></div>
        <div><span>render units</span><strong data-testid="active-units">{{ activeUnitCount.toLocaleString() }}</strong></div>
        <div><span>DOM rows</span><strong data-testid="mounted-rows">{{ mountedRows }}</strong></div>
        <div><span>FPS</span><strong>{{ fps }}</strong></div><div><span>frame p95</span><strong>{{ frameP95 }} ms</strong></div>
        <div><span>long tasks</span><strong>{{ longTasks }}</strong></div><div><span>JS heap</span><strong>{{ heapMb === null ? 'n/a' : `${heapMb} MB` }}</strong></div>
        <div><span>stream ingress</span><strong data-testid="stream-ingress">{{ streamIngressTicks }}</strong></div><div><span>UI publishes</span><strong data-testid="stream-ticks">{{ streamRenderTicks }}</strong></div>
        <div><span>live chunks</span><strong data-testid="live-chunks">{{ liveTailUnits.length + 1 }}</strong></div><div><span>fold state</span><strong>{{ foldStateCount }}</strong></div>
        <div><span>highlight LRU</span><strong>{{ highlightEntries }}</strong></div>
      </div>
      <div class="architecture-note">
        <strong>Bounded rendering path</strong>
        <span>{{ logicalCount.toLocaleString() }} logical messages stay outside Vue deep reactivity.</span>
        <span>Physical virtualizer: {{ activeUnitCount.toLocaleString() }} hot RenderUnits; {{ mountedRows }} DOM rows.</span>
        <span>Global page index: {{ pageHeights.pageCount.toLocaleString() }} Fenwick leaves.</span>
        <span>Large jumps start a fresh bounded virtualizer epoch; adjacent history uses native shift anchoring.</span>
        <span>Live output rolls to a new RenderUnit after {{ LIVE_CHUNK_LIMIT.toLocaleString() }} chars.</span>
        <span>Estimated logical height: {{ Math.round(estimatedTotalHeight / 1_000_000).toLocaleString() }}M px, never emitted as one DOM height.</span>
      </div>
    </aside>
  </section>
</template>