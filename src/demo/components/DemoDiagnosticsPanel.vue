<script setup lang="ts">
import { computed } from 'vue'
import type { ConversationSessionRuntime, SessionUiSnapshot } from '../../engine/runtime/session-runtime'
import {
  billedInputTokens,
  cacheHitPercent,
  contextOccupancyPercent,
  formatTokens,
} from '../../engine/conversation/session-semantics'
import { registeredRendererIds } from '../../engine/vue/renderers/registry'
import { touchedFoldStateCount } from '../../engine/vue/renderers/fold-state'
import { highlightCacheSize } from '../../engine/vue/renderers/highlight-client'
import { markdownCacheSize } from '../../engine/vue/renderers/markdown-cache'
import type { SyntheticStreamController } from '../stream-controller'

const props = defineProps<{
  runtime: ConversationSessionRuntime
  uiState: SessionUiSnapshot
  stream: SyntheticStreamController
  hotSessionIds: string
  hotSessionCount: number
  runningSessionCount: number
  blockedSessionCount: number
  failedSessionCount: number
  fps: number
  frameP95: number
  longTasks: number
  heapMb: number | null
  canInjectFixtures: boolean
}>()

const emit = defineEmits<{
  close: []
  jump: [target: number]
  shiftBackward: []
  shiftForward: []
  injectMixed: [turns: number]
  injectMarkdown: []
  injectAgent: []
}>()

const activeUsage = computed(() => { void props.uiState.eventRevision; return props.runtime.kernel.usage })
const activeCacheHit = computed(() => cacheHitPercent(activeUsage.value))
const activeContext = computed(() => contextOccupancyPercent(props.runtime.kernel.context))
const foldStateCount = computed(() => { void props.uiState.eventRevision; return touchedFoldStateCount() })
const highlightEntries = computed(() => { void props.uiState.eventRevision; return highlightCacheSize() })
const markdownEntries = computed(() => { void props.uiState.eventRevision; return markdownCacheSize() })
const streamRate = computed(() => { void props.uiState.eventRevision; return props.stream.rate })
const streamIngressTicks = computed(() => { void props.uiState.eventRevision; return props.stream.ingressTicks })
const streamPublishTicks = computed(() => { void props.uiState.eventRevision; return props.stream.publishTicks })

function jump(): void { emit('jump', props.runtime.jumpInput) }
function randomJump(): void {
  if (props.runtime.logicalCount <= 0) return
  const next = (Math.imul(props.uiState.reader + 17, 1103515245) + 12345) >>> 0
  props.runtime.jumpInput = next % props.runtime.logicalCount
  emit('jump', props.runtime.jumpInput)
}
function onRateChange(event: Event): void { props.stream.setRate(Number((event.target as HTMLSelectElement).value)) }
function resumeStream(): void { props.stream.start(false) }
function pauseStream(): void { props.stream.pause() }
</script>

<template>
  <aside class="diagnostics-panel">
    <div class="diagnostics-head"><div><span class="eyebrow">Architecture proof</span><strong>Session diagnostics</strong></div><button class="icon-button" @click="emit('close')">×</button></div>
    <div class="session-scope-card" data-testid="active-session-card"><span>active scope</span><strong data-testid="active-session-id">{{ runtime.id }}</strong><small>{{ runtime.title }}</small></div>

    <div class="control-group"><label for="jump">Jump to global message</label><div class="inline-control"><input id="jump" v-model.number="runtime.jumpInput" data-testid="jump-input" type="number" min="0" :max="Math.max(0, runtime.logicalCount - 1)" /><button data-testid="jump-button" :disabled="runtime.logicalCount === 0" @click="jump">Jump</button></div><button class="secondary wide" :disabled="runtime.logicalCount === 0" @click="randomJump">Deterministic random jump</button></div>
    <div class="control-group"><label>History window</label><div class="inline-control"><button class="secondary" data-testid="prepend-button" @click="emit('shiftBackward')">← prepend 512</button><button class="secondary" @click="emit('shiftForward')">append 512 →</button></div></div>

    <div class="control-group">
      <label>Runtime heterogeneous content</label>
      <div class="fixture-grid">
        <button data-testid="inject-mixed-one" :disabled="!canInjectFixtures" @click="emit('injectMixed', 1)">+ 1 mixed turn</button>
        <button data-testid="inject-mixed-five" :disabled="!canInjectFixtures" @click="emit('injectMixed', 5)">+ 5 mixed turns</button>
        <button class="secondary" data-testid="inject-markdown-gallery" :disabled="!canInjectFixtures" @click="emit('injectMarkdown')">Markdown gallery</button>
        <button class="secondary" data-testid="inject-agent-scenarios" :disabled="!canInjectFixtures" @click="emit('injectAgent')">Agent scenario pack</button>
      </div>
      <small class="control-note">Canonical scenarios: streaming output, uploads, image generation, TTS/ASR and diverse tool results; no DOM-side fixture shortcut.</small>
    </div>

    <div class="control-group"><label>Live LLM output</label><div class="inline-control"><select :value="streamRate" @change="onRateChange"><option :value="5">5 Hz</option><option :value="20">20 Hz</option><option :value="60">60 Hz</option></select><button data-testid="stream-start" :disabled="uiState.sessionStatus !== 'working'" @click="resumeStream">Resume</button><button class="secondary" :disabled="uiState.sessionStatus !== 'working'" @click="pauseStream">Pause</button></div></div>

    <div class="metrics" data-testid="metrics">
      <div><span>logical</span><strong data-testid="logical-count">{{ runtime.logicalCount.toLocaleString() }}</strong></div>
      <div><span>running kernels</span><strong data-testid="running-kernels">{{ runningSessionCount }}</strong></div>
      <div><span>blocked sessions</span><strong data-testid="blocked-sessions">{{ blockedSessionCount }}</strong></div>
      <div><span>failed last turn</span><strong data-testid="failed-sessions">{{ failedSessionCount }}</strong></div>
      <div><span>hot sessions</span><strong data-testid="hot-sessions">{{ hotSessionCount }}</strong></div>
      <div><span>hot messages</span><strong>{{ (uiState.rangeEnd - uiState.rangeStart).toLocaleString() }}</strong></div>
      <div><span>render units</span><strong data-testid="active-units">{{ uiState.projectionSize.toLocaleString() }}</strong></div>
      <div><span>DOM rows</span><strong data-testid="mounted-rows">{{ uiState.mountedRows }}</strong></div>
      <div><span>projection cache</span><strong data-testid="projection-cache">{{ uiState.projectionCacheSize }}</strong></div>
      <div><span>projection hits</span><strong data-testid="projection-cache-hits">{{ uiState.projectionCacheHits }}</strong></div>
      <div><span>full projects</span><strong data-testid="projection-full-projects">{{ uiState.projectionFullProjects }}</strong></div>
      <div><span>incremental patches</span><strong data-testid="projection-incremental">{{ uiState.projectionIncrementalPatches }}</strong></div>
      <div><span>messages after</span><strong data-testid="messages-after-metric">{{ uiState.messagesAfter.toLocaleString() }}</strong></div>
      <div><span>queue</span><strong data-testid="queued-prompts">{{ uiState.queuedPrompts }}</strong></div>
      <div><span>input tokens</span><strong data-testid="diagnostic-input-tokens">{{ formatTokens(billedInputTokens(activeUsage)) }}</strong></div>
      <div><span>output tokens</span><strong data-testid="diagnostic-output-tokens">{{ formatTokens(activeUsage.outputTokens) }}</strong></div>
      <div><span>cache hit</span><strong data-testid="diagnostic-cache-hit">{{ activeCacheHit === null ? 'n/a' : `${activeCacheHit}%` }}</strong></div>
      <div><span>context</span><strong data-testid="diagnostic-context">{{ activeContext === null ? 'n/a' : `${activeContext}%` }}</strong></div>
      <div><span>last turn</span><strong data-testid="last-turn-reason">{{ runtime.kernel.lastTurnReason ?? 'active' }}</strong></div>
      <div><span>failure</span><strong data-testid="last-failure-code">{{ runtime.kernel.lastFailure?.code ?? '—' }}</strong></div>
      <div><span>FPS</span><strong>{{ fps }}</strong></div><div><span>frame p95</span><strong>{{ frameP95 }} ms</strong></div><div><span>long tasks</span><strong>{{ longTasks }}</strong></div><div><span>JS heap</span><strong>{{ heapMb === null ? 'n/a' : `${heapMb} MB` }}</strong></div>
      <div><span>stream ingress</span><strong data-testid="stream-ingress">{{ streamIngressTicks }}</strong></div><div><span>UI publishes</span><strong data-testid="stream-ticks">{{ streamPublishTicks }}</strong></div><div><span>live chunks</span><strong data-testid="live-chunks">{{ uiState.liveChunkCount }}</strong></div>
      <div><span>fold state</span><strong>{{ foldStateCount }}</strong></div><div><span>highlight LRU</span><strong>{{ highlightEntries }}</strong></div><div><span>markdown LRU</span><strong>{{ markdownEntries }}</strong></div><div><span>renderer registry</span><strong>{{ registeredRendererIds().length }}</strong></div><div><span>virtual epoch</span><strong>{{ uiState.virtualEpoch }}</strong></div>
    </div>

    <div class="architecture-note"><strong>Durable domain / rebuildable presentation</strong><span>Canonical ContentBlock[] lives in the session model. ProjectionEngine keeps bounded hot memoization and incrementally patches live reasoning and the mutable Markdown tail.</span><span>Hot runtime LRU: <b data-testid="hot-session-ids">{{ hotSessionIds }}</b></span><span>Viewport policy consumes semantic keys/geometry; Virtua and product CSS remain replaceable physical adapters.</span><span>Global page index: {{ runtime.pageHeights.pageCount.toLocaleString() }} Fenwick leaves.</span></div>
  </aside>
</template>
