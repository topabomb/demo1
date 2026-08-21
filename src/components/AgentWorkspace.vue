<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePerformanceMetrics } from '../core/perf'
import { touchedFoldStateCount } from './renderers/fold-state'
import { highlightCacheSize } from './renderers/highlight-client'
import { useWorkspaceRuntime } from '../vue/use-workspace-runtime'
import ConversationViewport from './ConversationViewport.vue'
import type { ViewportSnapshot } from '../conversation/contracts'

interface ViewportHandle {
  captureSnapshot(): ViewportSnapshot
  jumpToMessage(index?: number): Promise<void>
  jumpToLatest(): Promise<void>
  shiftBackward(): Promise<void>
  shiftForward(): Promise<void>
  restartStream(): void
  pauseStream(): void
  setStreamRate(rate: number): void
}

const { workspace, activeSession, activeUiState, workspaceRevision } = useWorkspaceRuntime()
const viewportRef = ref<ViewportHandle | null>(null)
const diagnosticsOpen = ref(typeof navigator !== 'undefined' && navigator.webdriver)
const sessionQuery = ref('')
const { fps, frameP95, longTasks, heapMb } = usePerformanceMetrics()

const activeStream = computed(() => workspace.executionFor(activeSession.value.id))
const sessionDescriptors = computed(() => {
  void workspaceRevision.value
  const query = sessionQuery.value.trim().toLowerCase()
  const all = workspace.descriptors
  if (!query) return all
  return all.filter(entry => entry.title.toLowerCase().includes(query) || entry.id.toLowerCase().includes(query))
})
const hotSessionIds = computed(() => { void workspaceRevision.value; return workspace.hotSessionIds.join(', ') })
const hotSessionCount = computed(() => { void workspaceRevision.value; return workspace.hotSessionCount })
const runningSessionCount = computed(() => { void workspaceRevision.value; return workspace.runningSessionCount })
const foldStateCount = computed(() => { void activeUiState.value; return touchedFoldStateCount() })
const highlightEntries = computed(() => { void activeUiState.value; return highlightCacheSize() })

function switchSession(id: string): void {
  if (id === activeSession.value.id) return
  const snapshot = viewportRef.value?.captureSnapshot()
  workspace.activate(id, snapshot)
}

function newSession(): void {
  const snapshot = viewportRef.value?.captureSnapshot()
  if (snapshot) workspace.saveSnapshot(activeSession.value.id, snapshot)
  const id = workspace.createSession()
  workspace.activate(id)
}

function jump(): void { void viewportRef.value?.jumpToMessage(activeSession.value.jumpInput) }
function randomJump(): void {
  const runtime = activeSession.value
  if (runtime.logicalCount <= 0) return
  const next = (Math.imul(activeUiState.value.reader + 17, 1103515245) + 12345) >>> 0
  runtime.jumpInput = next % runtime.logicalCount
  void viewportRef.value?.jumpToMessage(runtime.jumpInput)
}
function onRateChange(event: Event): void { viewportRef.value?.setStreamRate(Number((event.target as HTMLSelectElement).value)) }
function statusLabel(status: string): string {
  if (status === 'working') return 'Working'
  if (status === 'waiting') return 'Needs approval'
  if (status === 'interrupted') return 'Interrupted'
  return 'Idle'
}
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
      <div class="sidebar-head"><div class="product-name">CodeNomad Lab</div><button class="icon-button" title="Workspace menu">⌘</button></div>
      <button class="workspace-picker"><span class="workspace-dot" /> million-message-workspace <span>⌄</span></button>
      <button class="new-session" data-testid="new-session" @click="newSession">＋ New session</button>
      <label class="session-search" for="session-filter">⌕
        <input id="session-filter" v-model="sessionQuery" data-testid="session-search" placeholder="Search sessions" />
        <kbd>⌘K</kbd>
      </label>
      <div class="session-section-label">Recent</div>
      <div class="session-list" data-testid="recent-sessions">
        <button
          v-for="descriptor in sessionDescriptors"
          :key="descriptor.id"
          class="session-row"
          :class="{ active: descriptor.id === activeSession.id, unread: descriptor.unread }"
          :data-testid="`session-${descriptor.id}`"
          @click="switchSession(descriptor.id)"
        >
          <span class="session-glyph" :class="`status-${descriptor.status}`">{{ descriptor.status === 'working' ? '●' : descriptor.status === 'waiting' ? '!' : descriptor.status === 'interrupted' ? '×' : '○' }}</span>
          <span class="session-copy">
            <strong>{{ descriptor.title }}</strong>
            <small><span>{{ statusLabel(descriptor.status) }}</span><span v-if="descriptor.queuedPrompts"> · {{ descriptor.queuedPrompts }} queued</span><span v-else-if="descriptor.status === 'idle'"> · {{ descriptor.logicalCount.toLocaleString() }} messages</span></small>
          </span>
          <span class="session-row-meta"><i v-if="descriptor.unread" class="unread-dot" /><time>{{ descriptor.age }}</time></span>
        </button>
        <div v-if="sessionDescriptors.length === 0" class="session-empty">No matching sessions</div>
      </div>
      <div class="sidebar-footer"><span class="status-led" /> Runtime connected <span class="sidebar-version">{{ runningSessionCount }} running · {{ hotSessionCount }}/3 hot</span></div>
    </aside>

    <ConversationViewport :key="activeSession.id" ref="viewportRef" :runtime="activeSession" :stream="activeStream" :diagnostics="diagnosticsOpen" />

    <aside v-show="diagnosticsOpen" class="diagnostics-panel">
      <div class="diagnostics-head"><div><span class="eyebrow">Architecture proof</span><strong>Session diagnostics</strong></div><button class="icon-button" @click="diagnosticsOpen = false">×</button></div>
      <div class="session-scope-card" data-testid="active-session-card"><span>active scope</span><strong data-testid="active-session-id">{{ activeSession.id }}</strong><small>{{ activeSession.title }}</small></div>

      <div class="control-group">
        <label for="jump">Jump to global message</label>
        <div class="inline-control"><input id="jump" v-model.number="activeSession.jumpInput" data-testid="jump-input" type="number" min="0" :max="Math.max(0, activeSession.logicalCount - 1)" /><button data-testid="jump-button" :disabled="activeSession.logicalCount === 0" @click="jump">Jump</button></div>
        <button class="secondary wide" :disabled="activeSession.logicalCount === 0" @click="randomJump">Deterministic random jump</button>
      </div>

      <div class="control-group"><label>History window</label><div class="inline-control"><button class="secondary" data-testid="prepend-button" @click="viewportRef?.shiftBackward()">← prepend 512</button><button class="secondary" @click="viewportRef?.shiftForward()">append 512 →</button></div></div>

      <div class="control-group">
        <label>Live LLM output</label>
        <div class="inline-control">
          <select :value="activeUiState.streamRate" @change="onRateChange"><option :value="5">5 Hz</option><option :value="20">20 Hz</option><option :value="60">60 Hz</option></select>
          <button data-testid="stream-start" :disabled="activeUiState.sessionStatus !== 'working'" @click="viewportRef?.restartStream()">Resume</button>
          <button class="secondary" :disabled="activeUiState.sessionStatus !== 'working'" @click="viewportRef?.pauseStream()">Pause</button>
        </div>
      </div>

      <div class="metrics" data-testid="metrics">
        <div><span>logical</span><strong data-testid="logical-count">{{ activeSession.logicalCount.toLocaleString() }}</strong></div>
        <div><span>running kernels</span><strong data-testid="running-kernels">{{ runningSessionCount }}</strong></div>
        <div><span>hot sessions</span><strong data-testid="hot-sessions">{{ hotSessionCount }}</strong></div>
        <div><span>hot messages</span><strong>{{ (activeUiState.rangeEnd - activeUiState.rangeStart).toLocaleString() }}</strong></div>
        <div><span>render units</span><strong data-testid="active-units">{{ activeUiState.projectionSize.toLocaleString() }}</strong></div>
        <div><span>DOM rows</span><strong data-testid="mounted-rows">{{ activeUiState.mountedRows }}</strong></div>
        <div><span>messages after</span><strong data-testid="messages-after-metric">{{ activeUiState.messagesAfter.toLocaleString() }}</strong></div>
        <div><span>queue</span><strong data-testid="queued-prompts">{{ activeUiState.queuedPrompts }}</strong></div>
        <div><span>FPS</span><strong>{{ fps }}</strong></div><div><span>frame p95</span><strong>{{ frameP95 }} ms</strong></div><div><span>long tasks</span><strong>{{ longTasks }}</strong></div><div><span>JS heap</span><strong>{{ heapMb === null ? 'n/a' : `${heapMb} MB` }}</strong></div>
        <div><span>stream ingress</span><strong data-testid="stream-ingress">{{ activeUiState.streamIngressTicks }}</strong></div><div><span>UI publishes</span><strong data-testid="stream-ticks">{{ activeUiState.streamRenderTicks }}</strong></div><div><span>live chunks</span><strong data-testid="live-chunks">{{ activeUiState.liveChunkCount }}</strong></div>
        <div><span>fold state</span><strong>{{ foldStateCount }}</strong></div><div><span>highlight LRU</span><strong>{{ highlightEntries }}</strong></div><div><span>virtual epoch</span><strong>{{ activeUiState.virtualEpoch }}</strong></div>
      </div>

      <div class="architecture-note"><strong>Kernel / viewport split</strong><span>SessionKernel owns execution, queue, pending input and appended turns; hot ConversationRuntime owns only projection/viewport state.</span><span>Hot runtime LRU: <b data-testid="hot-session-ids">{{ hotSessionIds }}</b></span><span>Stable keyed projection: streaming patches only the active assistant message.</span><span>Global page index: {{ activeSession.pageHeights.pageCount.toLocaleString() }} Fenwick leaves.</span></div>
    </aside>

    <button v-if="!diagnosticsOpen" class="diagnostics-reopen" data-testid="diagnostics-open" title="Architecture diagnostics" @click="diagnosticsOpen = true">◫</button>
  </section>
</template>
