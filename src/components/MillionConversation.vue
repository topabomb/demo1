<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowReactive, shallowRef } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import RenderUnitView from './RenderUnitView.vue'
import { SyntheticConversationSource } from '../core/synthetic'
import { WindowMaterializer } from '../core/window-materializer'
import { estimateUnitHeight } from '../core/estimates'
import { PageHeightIndex, DEFAULT_PAGE_SIZE } from '../core/page-index'
import { usePerformanceMetrics } from '../core/perf'
import type { RenderUnit } from '../core/types'

const WINDOW_MESSAGES = 2048
const SHIFT_MESSAGES = 512
const EDGE_THRESHOLD_PX = 900

const logicalCount = ref(1_000_000)
const source = shallowRef(new SyntheticConversationSource(logicalCount.value))
const windowModel = shallowRef(new WindowMaterializer(source.value, WINDOW_MESSAGES, SHIFT_MESSAGES))
const pageHeights = shallowRef(new PageHeightIndex(logicalCount.value))
const activeUnits = shallowRef<readonly RenderUnit[]>(windowModel.value.units)
const overrides = shallowReactive(new Map<string, RenderUnit>())

const parentRef = ref<HTMLElement | null>(null)
const segmentStart = ref(windowModel.value.range.start)
const segmentEnd = ref(windowModel.value.range.end)
const jumpInput = ref(Math.floor(logicalCount.value / 2))
const shifting = ref(false)
const streamRate = ref(20)
const streamTicks = ref(0)
const streamTarget = ref<string | null>(null)
const streamChars = ref(0)
const diagnosticsOpen = ref(true)
const composerText = ref('')
let streamTimer: number | null = null
let scrollFrame = 0

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

function unitAt(index: number): RenderUnit | undefined {
  const base = activeUnits.value[index]
  return base ? overrides.get(base.id) ?? base : undefined
}

const virtualizerOptions = computed(() => ({
  count: activeUnits.value.length,
  getScrollElement: () => parentRef.value,
  estimateSize: (index: number) => estimateUnitHeight(unitAt(index)),
  getItemKey: (index: number) => activeUnits.value[index]?.id ?? index,
  overscan: 10,
}))

const rowVirtualizer = useVirtualizer(virtualizerOptions)
const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())
const mountedRows = computed(() => virtualRows.value.length)
const activeUnitCount = computed(() => activeUnits.value.length)
const estimatedTotalHeight = computed(() => pageHeights.value.estimatedTotalHeight())
const currentLogicalPosition = ref(segmentEnd.value - 1)

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
  const activeIds = new Set(units.map(unit => unit.id))
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

interface Anchor { id: string; offset: number }

function captureAnchor(): Anchor | null {
  const el = parentRef.value
  if (!el) return null
  const scrollTop = el.scrollTop
  const candidates = rowVirtualizer.value.getVirtualItems()
  const row = candidates.find(item => item.end >= scrollTop) ?? candidates[0]
  if (!row) return null
  const unit = activeUnits.value[row.index]
  return unit ? { id: unit.id, offset: row.start - scrollTop } : null
}

function frame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

async function restoreAnchor(anchor: Anchor | null) {
  if (!anchor) return
  const index = activeUnits.value.findIndex(unit => unit.id === anchor.id)
  if (index < 0) return
  await nextTick()
  rowVirtualizer.value.measure()
  rowVirtualizer.value.scrollToIndex(index, { align: 'start' })
  await frame()
  const row = rowVirtualizer.value.getVirtualItems().find(item => item.index === index)
  if (row) rowVirtualizer.value.scrollToOffset(Math.max(0, row.start - anchor.offset))
}

async function shiftBackward() {
  if (shifting.value || windowModel.value.range.start === 0) return
  shifting.value = true
  const anchor = captureAnchor()
  applyWindow(windowModel.value.shiftBackward())
  await restoreAnchor(anchor)
  shifting.value = false
}

async function shiftForward() {
  if (shifting.value || windowModel.value.range.end === logicalCount.value) return
  shifting.value = true
  const anchor = captureAnchor()
  applyWindow(windowModel.value.shiftForward())
  await restoreAnchor(anchor)
  shifting.value = false
}

function updateLogicalPosition() {
  const el = parentRef.value
  if (!el) return
  const top = el.scrollTop
  const bottom = top + el.clientHeight
  const rows = rowVirtualizer.value.getVirtualItems()
  const visible = rows.find(row => row.end >= top) ?? rows[0]
  const lastVisible = [...rows].reverse().find(row => row.start <= bottom) ?? rows.at(-1)
  const index = lastVisible?.index ?? visible?.index
  if (index !== undefined) currentLogicalPosition.value = activeUnits.value[index]?.messageIndex ?? currentLogicalPosition.value
}

function onScroll() {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    const el = parentRef.value
    if (!el || shifting.value) return
    updateLogicalPosition()
    const remaining = totalSize.value - el.scrollTop - el.clientHeight
    if (el.scrollTop < EDGE_THRESHOLD_PX) void shiftBackward()
    else if (remaining < EDGE_THRESHOLD_PX) void shiftForward()
  })
}

async function jumpToMessage(raw = jumpInput.value) {
  const target = Math.max(0, Math.min(logicalCount.value - 1, Math.floor(Number(raw) || 0)))
  stopStreaming()
  shifting.value = true
  applyWindow(windowModel.value.jump(target))
  await nextTick()
  rowVirtualizer.value.measure()
  const index = activeUnits.value.findIndex(unit => unit.messageIndex >= target)
  rowVirtualizer.value.scrollToIndex(Math.max(0, index), { align: 'center' })
  await frame()
  currentLogicalPosition.value = target
  jumpInput.value = target
  shifting.value = false
}

async function configureCount(count: number) {
  logicalCount.value = count
  source.value = new SyntheticConversationSource(count)
  windowModel.value = new WindowMaterializer(source.value, WINDOW_MESSAGES, SHIFT_MESSAGES)
  pageHeights.value = new PageHeightIndex(count)
  applyWindow(windowModel.value.units)
  jumpInput.value = Math.floor(count / 2)
  await nextTick()
  rowVirtualizer.value.measure()
  rowVirtualizer.value.scrollToIndex(Math.max(0, activeUnits.value.length - 1), { align: 'end' })
  currentLogicalPosition.value = count - 1
}

function randomJump() {
  const next = (Math.imul(currentLogicalPosition.value + 17, 1103515245) + 12345) >>> 0
  void jumpToMessage(next % logicalCount.value)
}

function streamStep() {
  const targetId = streamTarget.value
  if (!targetId) return
  const base = activeUnits.value.find(unit => unit.id === targetId)
  if (!base) return stopStreaming()
  streamChars.value += 18 + (streamTicks.value % 37)
  const repeats = Math.max(1, Math.floor(streamChars.value / 32))
  overrides.set(targetId, {
    ...base,
    kind: 'markdown',
    revision: base.revision + streamTicks.value + 1,
    estimatePx: Math.max(base.estimatePx, 180 + repeats * 16),
    payload: {
      markdown: `### Live streaming node\n\nMessage **${base.messageIndex.toLocaleString()}** is receiving synthetic model deltas.\n\n${'streaming delta keeps changing the measured height and exercises ResizeObserver anchor correction. '.repeat(repeats)}`,
    },
  })
  streamTicks.value += 1
}

function startStreaming() {
  stopStreaming(false)
  const rows = rowVirtualizer.value.getVirtualItems()
  const candidate = rows.at(-1)
  const unit = candidate ? activeUnits.value[candidate.index] : activeUnits.value.at(-1)
  if (!unit) return
  streamTarget.value = unit.id
  streamChars.value = 0
  streamTicks.value = 0
  streamTimer = window.setInterval(streamStep, Math.max(16, Math.round(1000 / streamRate.value)))
}

function stopStreaming(clear = true) {
  if (streamTimer !== null) window.clearInterval(streamTimer)
  streamTimer = null
  if (clear && streamTarget.value) overrides.delete(streamTarget.value)
  streamTarget.value = null
}

function sendComposer() {
  if (!composerText.value.trim()) return
  composerText.value = ''
  startStreaming()
}

function forcePrepend() { void shiftBackward() }
function forceForward() { void shiftForward() }

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
      <div class="sidebar-head">
        <div class="product-name">CodeNomad Lab</div>
        <button class="icon-button">⌘</button>
      </div>
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
      <div class="sidebar-footer">
        <span class="status-led" /> Runtime connected
        <span class="sidebar-version">Vue / virtual</span>
      </div>
    </aside>

    <main class="conversation-shell">
      <header class="conversation-header">
        <div class="conversation-title">
          <strong>Million-message stress session</strong>
          <span>million-message-workspace / main</span>
        </div>
        <div class="header-chips">
          <button class="model-chip">Synthetic Agent · 1M context⌄</button>
          <span class="run-status"><i /> running</span>
          <button class="header-icon" title="Search">⌕</button>
          <button class="header-icon" title="Diagnostics" @click="diagnosticsOpen = !diagnosticsOpen">◫</button>
        </div>
      </header>

      <div ref="parentRef" class="scrollport" data-testid="scrollport" @scroll.passive="onScroll">
        <div class="conversation-meta-strip">
          <span>Loaded segment <strong data-testid="segment-range">{{ segmentStart.toLocaleString() }} – {{ (segmentEnd - 1).toLocaleString() }}</strong></span>
          <span>Reader <strong data-testid="reader-position">#{{ currentLogicalPosition.toLocaleString() }}</strong></span>
          <span>{{ mountedRows }} physical rows</span>
        </div>
        <div class="virtual-canvas" :style="{ height: `${totalSize}px` }">
          <div
            v-for="virtualRow in virtualRows"
            :key="virtualRow.key"
            :ref="measureElement"
            :data-index="virtualRow.index"
            :data-render-unit="activeUnits[virtualRow.index]?.id"
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
            <div><span class="context-meter">1,000,000 synthetic messages</span><button class="send-button" :disabled="!composerText.trim()" @click="sendComposer">↑</button></div>
          </div>
        </div>
        <span class="composer-hint">Enter to send · output streams into the visible virtualized conversation</span>
      </footer>
    </main>

    <aside v-if="diagnosticsOpen" class="diagnostics-panel">
      <div class="diagnostics-head">
        <div><span class="eyebrow">Performance lab</span><strong>Conversation diagnostics</strong></div>
        <button class="icon-button" @click="diagnosticsOpen = false">×</button>
      </div>

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
        <div class="inline-control">
          <input id="jump" v-model.number="jumpInput" data-testid="jump-input" type="number" min="0" :max="logicalCount - 1" />
          <button data-testid="jump-button" @click="jumpToMessage()">Jump</button>
        </div>
        <button class="secondary wide" @click="randomJump">Deterministic random jump</button>
      </div>

      <div class="control-group">
        <label>History window</label>
        <div class="inline-control">
          <button class="secondary" data-testid="prepend-button" @click="forcePrepend">← prepend 512</button>
          <button class="secondary" @click="forceForward">append 512 →</button>
        </div>
      </div>

      <div class="control-group">
        <label>Streaming resize torture</label>
        <div class="inline-control">
          <select v-model.number="streamRate">
            <option :value="5">5 Hz</option>
            <option :value="20">20 Hz</option>
            <option :value="60">60 Hz</option>
          </select>
          <button data-testid="stream-start" @click="startStreaming">Start</button>
          <button class="secondary" @click="stopStreaming()">Stop</button>
        </div>
      </div>

      <div class="metrics" data-testid="metrics">
        <div><span>logical</span><strong data-testid="logical-count">{{ logicalCount.toLocaleString() }}</strong></div>
        <div><span>hot messages</span><strong>{{ (segmentEnd - segmentStart).toLocaleString() }}</strong></div>
        <div><span>render units</span><strong data-testid="active-units">{{ activeUnitCount.toLocaleString() }}</strong></div>
        <div><span>DOM rows</span><strong data-testid="mounted-rows">{{ mountedRows }}</strong></div>
        <div><span>FPS</span><strong>{{ fps }}</strong></div>
        <div><span>frame p95</span><strong>{{ frameP95 }} ms</strong></div>
        <div><span>long tasks</span><strong>{{ longTasks }}</strong></div>
        <div><span>JS heap</span><strong>{{ heapMb === null ? 'n/a' : `${heapMb} MB` }}</strong></div>
        <div><span>stream ticks</span><strong data-testid="stream-ticks">{{ streamTicks }}</strong></div>
      </div>

      <div class="architecture-note">
        <strong>Bounded rendering path</strong>
        <span>{{ logicalCount.toLocaleString() }} logical messages stay outside Vue reactivity.</span>
        <span>Physical virtualizer: {{ activeUnitCount.toLocaleString() }} hot RenderUnits.</span>
        <span>Global page index: {{ pageHeights.pageCount.toLocaleString() }} Fenwick leaves.</span>
        <span>Estimated logical height: {{ Math.round(estimatedTotalHeight / 1_000_000).toLocaleString() }}M px, never emitted as one DOM height.</span>
      </div>
    </aside>
  </section>
</template>
