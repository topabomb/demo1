<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowReactive, shallowRef } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import RenderUnitView from './RenderUnitView.vue'
import { SyntheticConversationSource } from '../core/synthetic'
import { WindowMaterializer } from '../core/window-materializer'
import { estimateUnitHeight } from '../core/estimates'
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
const PROGRAMMATIC_SETTLE_MS = 180
const USER_SCROLL_INTENT_MS = 650

const logicalCount = ref(1_000_000)
const source = shallowRef(new SyntheticConversationSource(logicalCount.value))
const windowModel = shallowRef(new WindowMaterializer(source.value, WINDOW_MESSAGES, SHIFT_MESSAGES))
const pageHeights = shallowRef(new PageHeightIndex(logicalCount.value))
const activeUnits = shallowRef<readonly RenderUnit[]>(windowModel.value.units)
const liveTailUnits = shallowRef<readonly RenderUnit[]>([])
const overrides = shallowReactive(new Map<string, RenderUnit>())

const parentRef = ref<HTMLElement | null>(null)
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
let streamTimer: number | null = null
let streamFrame = 0
let scrollFrame = 0
let pendingDelta = ''
let streamChunkText = ''
let streamBaseUnit: RenderUnit | null = null
let tailIntentGeneration = 0
let programmaticScrollUntil = 0
let userScrollIntentUntil = 0
let userScrollDirection: -1 | 0 | 1 = 0
let lastScrollTop = 0

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
const renderUnits = computed<readonly RenderUnit[]>(() => atTailSegment.value
  ? [...activeUnits.value, ...liveTailUnits.value]
  : activeUnits.value)

function unitAt(index: number): RenderUnit | undefined {
  const base = renderUnits.value[index]
  return base ? overrides.get(base.id) ?? base : undefined
}

const virtualizerOptions = computed(() => ({
  count: renderUnits.value.length,
  getScrollElement: () => parentRef.value,
  estimateSize: (index: number) => estimateUnitHeight(unitAt(index)),
  getItemKey: (index: number) => renderUnits.value[index]?.id ?? index,
  overscan: 10,
}))

const rowVirtualizer = useVirtualizer(virtualizerOptions)
const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())
const mountedRows = computed(() => virtualRows.value.length)
const activeUnitCount = computed(() => renderUnits.value.length)
const estimatedTotalHeight = computed(() => pageHeights.value.estimatedTotalHeight())
const currentLogicalPosition = ref(segmentEnd.value - 1)
const foldStateCount = ref(0)
const highlightEntries = ref(0)

function measureElement(el: unknown) {
  if (el instanceof Element) rowVirtualizer.value.measureElement(el)
}

function syncRange() {
  const range = windowModel.value.range
  segmentStart.value = range.start
  segmentEnd.value = range.end
  updatePageEstimates()
}

function applyWindow(units: readonly RenderUnit[]) {
  activeUnits.value = units
  const activeIds = new Set([...units, ...liveTailUnits.value].map(unit => unit.id))
  for (const key of overrides.keys()) if (!activeIds.has(key)) overrides.delete(key)
  syncRange()
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

interface Anchor { id: string; viewportTop: number }

function renderedElement(id: string): HTMLElement | null {
  const el = parentRef.value
  if (!el) return null
  for (const node of el.querySelectorAll<HTMLElement>('[data-render-unit]')) {
    if (node.dataset.renderUnit === id) return node
  }
  return null
}

function renderedMessageElement(messageIndex: number): HTMLElement | null {
  return parentRef.value?.querySelector<HTMLElement>(`[data-message-index="${messageIndex}"]`) ?? null
}

function captureAnchor(): Anchor | null {
  const el = parentRef.value
  if (!el) return null
  const viewport = el.getBoundingClientRect()
  const rows = [...el.querySelectorAll<HTMLElement>('[data-render-unit]')]
  const candidate = rows.find(row => row.getBoundingClientRect().bottom > viewport.top + 1) ?? rows[0]
  if (!candidate?.dataset.renderUnit) return null
  return { id: candidate.dataset.renderUnit, viewportTop: candidate.getBoundingClientRect().top - viewport.top }
}

function frame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

function markProgrammaticScroll(ms = PROGRAMMATIC_SETTLE_MS) {
  programmaticScrollUntil = Math.max(programmaticScrollUntil, performance.now() + ms)
}

function isProgrammaticScroll(): boolean {
  return performance.now() < programmaticScrollUntil
}

function consumeUserScrollIntent() {
  userScrollIntentUntil = 0
  userScrollDirection = 0
}

function markUserScrollIntent(direction: -1 | 0 | 1) {
  userScrollIntentUntil = performance.now() + USER_SCROLL_INTENT_MS
  if (direction !== 0) userScrollDirection = direction
}

async function restoreAnchor(anchor: Anchor | null) {
  if (!anchor) return
  const index = renderUnits.value.findIndex(unit => unit.id === anchor.id)
  if (index < 0) return

  markProgrammaticScroll(900)
  await nextTick()
  rowVirtualizer.value.measure()
  rowVirtualizer.value.scrollToIndex(index, { align: 'start' })

  for (let attempt = 0; attempt < 8; attempt += 1) {
    markProgrammaticScroll(300)
    await frame()
    await nextTick()
    rowVirtualizer.value.measure()
    const el = parentRef.value
    const node = renderedElement(anchor.id)
    if (!el || !node) {
      rowVirtualizer.value.scrollToIndex(index, { align: 'start' })
      continue
    }
    const currentTop = node.getBoundingClientRect().top - el.getBoundingClientRect().top
    const delta = currentTop - anchor.viewportTop
    if (Math.abs(delta) < 0.75) break
    el.scrollTop += delta
  }
  markProgrammaticScroll()
  await frame()
}

async function shiftBackward() {
  if (shifting.value || windowModel.value.range.start === 0) return
  shifting.value = true
  consumeUserScrollIntent()
  markProgrammaticScroll(900)
  const anchor = captureAnchor()
  applyWindow(windowModel.value.shiftBackward())
  await restoreAnchor(anchor)
  markProgrammaticScroll()
  shifting.value = false
}

async function shiftForward() {
  if (shifting.value || windowModel.value.range.end === logicalCount.value) return
  shifting.value = true
  consumeUserScrollIntent()
  markProgrammaticScroll(900)
  const anchor = captureAnchor()
  applyWindow(windowModel.value.shiftForward())
  await restoreAnchor(anchor)
  markProgrammaticScroll()
  shifting.value = false
}

function updateLogicalPosition() {
  const el = parentRef.value
  if (!el) return
  const viewport = el.getBoundingClientRect()
  const rows = [...el.querySelectorAll<HTMLElement>('[data-render-unit]')]
    .filter(row => row.getBoundingClientRect().top < viewport.bottom && row.getBoundingClientRect().bottom > viewport.top)
  const last = rows.at(-1)
  if (!last) return
  const index = Number(last.dataset.index)
  const unit = renderUnits.value[index]
  if (unit) currentLogicalPosition.value = unit.messageIndex
}

function remainingToBottom(): number {
  const el = parentRef.value
  if (!el) return Number.POSITIVE_INFINITY
  return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight)
}

function escapeTailFollow() {
  if (!streamTarget.value) return
  if (followTail.value) {
    followTail.value = false
    tailIntentGeneration += 1
  }
}

function onUserWheel(event: WheelEvent) {
  const direction: -1 | 0 | 1 = event.deltaY < 0 ? -1 : event.deltaY > 0 ? 1 : 0
  markUserScrollIntent(direction)
  if (direction < 0) escapeTailFollow()
}

function onUserPointerDown() {
  markUserScrollIntent(0)
}

function onScroll() {
  const el = parentRef.value
  if (!el) return

  const currentTop = el.scrollTop
  const inferredDirection: -1 | 0 | 1 = currentTop < lastScrollTop ? -1 : currentTop > lastScrollTop ? 1 : 0
  lastScrollTop = currentTop

  const fromUser = !isProgrammaticScroll() && performance.now() < userScrollIntentUntil
  if (fromUser && inferredDirection !== 0) userScrollDirection = inferredDirection

  const remainingNow = remainingToBottom()
  if (!isProgrammaticScroll() && streamTarget.value) {
    if (remainingNow > FOLLOW_THRESHOLD_PX) escapeTailFollow()
    else if (remainingNow < 40) followTail.value = true
  }

  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    const scrollEl = parentRef.value
    if (!scrollEl || shifting.value) return
    updateLogicalPosition()

    // Segment rebasing is a response to reader navigation, never to a scroll event
    // generated by jump(), anchor restoration, ResizeObserver correction or tail-follow.
    if (isProgrammaticScroll() || performance.now() >= userScrollIntentUntil) return
    const remaining = remainingToBottom()
    if (userScrollDirection < 0 && scrollEl.scrollTop < EDGE_THRESHOLD_PX) void shiftBackward()
    else if (userScrollDirection > 0 && remaining < EDGE_THRESHOLD_PX) void shiftForward()
  })
}

async function jumpToMessage(raw = jumpInput.value) {
  const target = Math.max(0, Math.min(logicalCount.value - 1, Math.floor(Number(raw) || 0)))
  stopStreaming()
  shifting.value = true
  consumeUserScrollIntent()
  markProgrammaticScroll(1400)
  applyWindow(windowModel.value.jump(target))

  await nextTick()
  const el = parentRef.value
  if (!el) {
    shifting.value = false
    return
  }

  // A completely different hot segment must not inherit the old segment's physical
  // scroll offset. Reset first, then let the virtualizer estimate the target, then
  // reconcile against real DOM geometry as dynamic measurements settle.
  el.scrollTop = 0
  lastScrollTop = 0
  rowVirtualizer.value.measure()
  await frame()

  const index = renderUnits.value.findIndex(unit => unit.messageIndex === target)
  if (index >= 0) {
    rowVirtualizer.value.scrollToIndex(index, { align: 'center' })
    for (let attempt = 0; attempt < 10; attempt += 1) {
      markProgrammaticScroll(320)
      await frame()
      await nextTick()
      rowVirtualizer.value.measure()
      const node = renderedMessageElement(target)
      if (!node) {
        rowVirtualizer.value.scrollToIndex(index, { align: 'center' })
        continue
      }

      const viewport = el.getBoundingClientRect()
      const rect = node.getBoundingClientRect()
      const usableHeight = Math.max(80, el.clientHeight - 64)
      const visibleHeight = Math.min(rect.height, usableHeight)
      const desiredTop = Math.max(24, (el.clientHeight - visibleHeight) / 2)
      const delta = (rect.top - viewport.top) - desiredTop
      if (Math.abs(delta) < 2) break
      el.scrollTop += delta
    }
  }

  currentLogicalPosition.value = target
  jumpInput.value = target
  markProgrammaticScroll(260)
  await frame()
  shifting.value = false
}

async function configureCount(count: number) {
  stopStreaming()
  logicalCount.value = count
  source.value = new SyntheticConversationSource(count)
  windowModel.value = new WindowMaterializer(source.value, WINDOW_MESSAGES, SHIFT_MESSAGES)
  pageHeights.value = new PageHeightIndex(count)
  liveTailUnits.value = []
  applyWindow(windowModel.value.units)
  jumpInput.value = Math.floor(count / 2)
  await nextTick()
  rowVirtualizer.value.measure()
  currentLogicalPosition.value = count - 1
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
    void nextTick().then(() => rowVirtualizer.value.measure())
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
  foldStateCount.value = touchedFoldStateCount()
  highlightEntries.value = highlightCacheSize()
  if (followTail.value) void stickToTail(false)
}

function ingestStreamDelta() {
  streamIngressTicks.value += 1
  pendingDelta += nextSyntheticDelta()
  if (!streamFrame) streamFrame = requestAnimationFrame(publishStreamFrame)
}

async function stickToTail(force: boolean) {
  if (!atTailSegment.value || renderUnits.value.length === 0) return
  if (!force && !followTail.value) return
  const intent = tailIntentGeneration
  markProgrammaticScroll(700)
  await nextTick()
  if (intent !== tailIntentGeneration || (!force && !followTail.value)) return

  rowVirtualizer.value.measure()
  rowVirtualizer.value.scrollToIndex(renderUnits.value.length - 1, { align: 'end' })
  await frame()
  if (intent !== tailIntentGeneration || (!force && !followTail.value)) return

  const el = parentRef.value
  if (!el) return
  markProgrammaticScroll(300)
  el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
  await frame()
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
  await nextTick()
  const el = parentRef.value
  if (el) lastScrollTop = el.scrollTop
  void startStreaming(true)
})

onBeforeUnmount(() => {
  stopStreaming()
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
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
      <div class="sidebar-footer"><span class="status-led" /> Runtime connected <span class="sidebar-version">Vue / virtual</span></div>
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

      <div
        ref="parentRef"
        class="scrollport"
        data-testid="scrollport"
        @pointerdown.passive="onUserPointerDown"
        @wheel.passive="onUserWheel"
        @scroll.passive="onScroll"
      >
        <div class="conversation-meta-strip">
          <span>Loaded <strong data-testid="segment-range">{{ segmentStart.toLocaleString() }} – {{ (segmentEnd - 1).toLocaleString() }}</strong></span>
          <span>Reader <strong data-testid="reader-position">#{{ currentLogicalPosition.toLocaleString() }}</strong></span>
          <span>{{ mountedRows }} DOM rows</span>
          <span v-if="streamTarget">{{ followTail ? 'following tail' : 'tail paused' }}</span>
        </div>
        <div class="virtual-canvas" :style="{ height: `${totalSize}px` }">
          <div
            v-for="virtualRow in virtualRows"
            :key="String(virtualRow.key)"
            :ref="measureElement"
            :data-index="virtualRow.index"
            :data-message-index="renderUnits[virtualRow.index]?.messageIndex"
            :data-render-unit="renderUnits[virtualRow.index]?.id"
            class="virtual-row"
            :style="{ transform: `translateY(${virtualRow.start}px)` }"
          >
            <RenderUnitView v-if="unitAt(virtualRow.index)" :unit="unitAt(virtualRow.index)!" />
          </div>
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
        <span class="composer-hint">Enter to send · live output is frame-coalesced and chunked into bounded RenderUnits</span>
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
          <select v-model.number="streamRate"><option :value="5">5 Hz ingress</option><option :value="20">20 Hz ingress</option><option :value="60">60 Hz ingress</option></select>
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
        <span>Physical virtualizer: {{ activeUnitCount.toLocaleString() }} hot RenderUnits.</span>
        <span>Global page index: {{ pageHeights.pageCount.toLocaleString() }} Fenwick leaves.</span>
        <span>Live output rolls to a new RenderUnit after {{ LIVE_CHUNK_LIMIT.toLocaleString() }} chars.</span>
        <span>Estimated logical height: {{ Math.round(estimatedTotalHeight / 1_000_000).toLocaleString() }}M px, never emitted as one DOM height.</span>
      </div>
    </aside>
  </section>
</template>
