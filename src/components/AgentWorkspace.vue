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
const diagnosticsOpen = ref(true)
const { fps, frameP95, longTasks, heapMb } = usePerformanceMetrics()

const activeStream = computed(() => workspace.streamFor(activeSession.value.id))
const hotSessionIds = computed(() => {
  void workspaceRevision.value
  return workspace.hotSessionIds.join(', ')
})
const hotSessionCount = computed(() => {
  void workspaceRevision.value
  return workspace.hotSessionCount
})
const foldStateCount = computed(() => {
  void activeUiState.value
  return touchedFoldStateCount()
})
const highlightEntries = computed(() => {
  void activeUiState.value
  return highlightCacheSize()
})

function switchSession(id: string): void {
  if (id === activeSession.value.id) return
  const snapshot = viewportRef.value?.captureSnapshot()
  workspace.activate(id, snapshot)
}

function jump(): void {
  void viewportRef.value?.jumpToMessage(activeSession.value.jumpInput)
}

function randomJump(): void {
  const runtime = activeSession.value
  const next = (Math.imul(activeUiState.value.reader + 17, 1103515245) + 12345) >>> 0
  runtime.jumpInput = next % runtime.logicalCount
  void viewportRef.value?.jumpToMessage(runtime.jumpInput)
}

function onRateChange(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value)
  viewportRef.value?.setStreamRate(value)
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
      <div class="sidebar-head">
        <div class="product-name">CodeNomad Lab</div>
        <button class="icon-button">⌘</button>
      </div>
      <button class="workspace-picker"><span class="workspace-dot" /> million-message-workspace <span>⌄</span></button>
      <button class="new-session">＋ New session</button>
      <div class="session-search">⌕ <span>Search sessions</span><kbd>⌘K</kbd></div>
      <div class="session-section-label">Recent</div>
      <div class="session-list" data-testid="recent-sessions">
        <button
          v-for="descriptor in workspace.descriptors"
          :key="descriptor.id"
          class="session-row"
          :class="{ active: descriptor.id === activeSession.id }"
          :data-testid="`session-${descriptor.id}`"
          @click="switchSession(descriptor.id)"
        >
          <span class="session-glyph">{{ descriptor.id === activeSession.id ? '✦' : '○' }}</span>
          <span class="session-copy">
            <strong>{{ descriptor.title }}</strong>
            <small>{{ descriptor.status === 'running' ? 'Running · synthetic backend' : `${descriptor.logicalCount.toLocaleString()} messages` }}</small>
          </span>
          <time>{{ descriptor.age }}</time>
        </button>
      </div>
      <div class="sidebar-footer">
        <span class="status-led" /> Runtime connected
        <span class="sidebar-version">{{ hotSessionCount }}/3 hot</span>
      </div>
    </aside>

    <ConversationViewport
      :key="activeSession.id"
      ref="viewportRef"
      :runtime="activeSession"
      :stream="activeStream"
    />

    <aside v-if="diagnosticsOpen" class="diagnostics-panel">
      <div class="diagnostics-head">
        <div><span class="eyebrow">Architecture proof</span><strong>Session diagnostics</strong></div>
        <button class="icon-button" @click="diagnosticsOpen = false">×</button>
      </div>

      <div class="session-scope-card" data-testid="active-session-card">
        <span>active scope</span>
        <strong data-testid="active-session-id">{{ activeSession.id }}</strong>
        <small>{{ activeSession.title }}</small>
      </div>

      <div class="control-group">
        <label for="jump">Jump to global message</label>
        <div class="inline-control">
          <input id="jump" v-model.number="activeSession.jumpInput" data-testid="jump-input" type="number" min="0" :max="activeSession.logicalCount - 1" />
          <button data-testid="jump-button" @click="jump">Jump</button>
        </div>
        <button class="secondary wide" @click="randomJump">Deterministic random jump</button>
      </div>

      <div class="control-group">
        <label>History window</label>
        <div class="inline-control">
          <button class="secondary" data-testid="prepend-button" @click="viewportRef?.shiftBackward()">← prepend 512</button>
          <button class="secondary" @click="viewportRef?.shiftForward()">append 512 →</button>
        </div>
      </div>

      <div class="control-group">
        <label>Live LLM output</label>
        <div class="inline-control">
          <select :value="activeUiState.streamRate" @change="onRateChange">
            <option :value="5">5 Hz</option>
            <option :value="20">20 Hz</option>
            <option :value="60">60 Hz</option>
          </select>
          <button data-testid="stream-start" :disabled="activeSession.status !== 'running'" @click="viewportRef?.restartStream()">Restart</button>
          <button class="secondary" @click="viewportRef?.pauseStream()">Pause</button>
        </div>
      </div>

      <div class="metrics" data-testid="metrics">
        <div><span>logical</span><strong data-testid="logical-count">{{ activeSession.logicalCount.toLocaleString() }}</strong></div>
        <div><span>hot sessions</span><strong data-testid="hot-sessions">{{ hotSessionCount }}</strong></div>
        <div><span>hot messages</span><strong>{{ (activeUiState.rangeEnd - activeUiState.rangeStart).toLocaleString() }}</strong></div>
        <div><span>render units</span><strong data-testid="active-units">{{ activeUiState.projectionSize.toLocaleString() }}</strong></div>
        <div><span>DOM rows</span><strong data-testid="mounted-rows">{{ activeUiState.mountedRows }}</strong></div>
        <div><span>messages after</span><strong data-testid="messages-after-metric">{{ activeUiState.messagesAfter.toLocaleString() }}</strong></div>
        <div><span>FPS</span><strong>{{ fps }}</strong></div>
        <div><span>frame p95</span><strong>{{ frameP95 }} ms</strong></div>
        <div><span>long tasks</span><strong>{{ longTasks }}</strong></div>
        <div><span>JS heap</span><strong>{{ heapMb === null ? 'n/a' : `${heapMb} MB` }}</strong></div>
        <div><span>stream ingress</span><strong data-testid="stream-ingress">{{ activeUiState.streamIngressTicks }}</strong></div>
        <div><span>UI publishes</span><strong data-testid="stream-ticks">{{ activeUiState.streamRenderTicks }}</strong></div>
        <div><span>live chunks</span><strong data-testid="live-chunks">{{ activeUiState.liveChunkCount }}</strong></div>
        <div><span>fold state</span><strong>{{ foldStateCount }}</strong></div>
        <div><span>highlight LRU</span><strong>{{ highlightEntries }}</strong></div>
        <div><span>virtual epoch</span><strong>{{ activeUiState.virtualEpoch }}</strong></div>
      </div>

      <div class="architecture-note">
        <strong>Bounded scoped rendering</strong>
        <span>Backend → adapter → canonical timeline → keyed projection → NodeSeat → Virtua.</span>
        <span>Hot runtime LRU: <b data-testid="hot-session-ids">{{ hotSessionIds }}</b></span>
        <span>Stable order: {{ activeUiState.projectionSize.toLocaleString() }} IDs; streaming patches one keyed node.</span>
        <span>Global page index: {{ activeSession.pageHeights.pageCount.toLocaleString() }} Fenwick leaves.</span>
        <span>Estimated logical height: {{ Math.round(activeUiState.estimatedTotalHeight / 1_000_000).toLocaleString() }}M px; never one DOM element.</span>
      </div>
    </aside>

    <button v-else class="diagnostics-reopen" title="Diagnostics" @click="diagnosticsOpen = true">◫</button>
  </section>
</template>
