<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ConversationSessionRuntime, SessionUiSnapshot } from '../../engine/runtime/session-runtime'
import {
  billedInputTokens,
  cacheHitPercent,
  contextOccupancyPercent,
  formatTokens,
} from '../../engine/conversation/session-semantics'
import type { SyntheticStreamController } from '../stream-controller'

const props = defineProps<{
  runtime: ConversationSessionRuntime
  uiState: SessionUiSnapshot
  stream: SyntheticStreamController
  mountedRows: number
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

const jumpTarget = ref(props.uiState.reader)
const activeUsage = computed(() => { void props.uiState.eventRevision; return props.runtime.kernel.usage })
const activeCacheHit = computed(() => cacheHitPercent(activeUsage.value))
const activeContext = computed(() => contextOccupancyPercent(props.runtime.kernel.context))
const streamRate = computed(() => { void props.uiState.eventRevision; return props.stream.rate })
const streamIngressTicks = computed(() => { void props.uiState.eventRevision; return props.stream.ingressTicks })
const streamPublishTicks = computed(() => { void props.uiState.eventRevision; return props.stream.publishTicks })

watch(() => props.runtime.id, () => { jumpTarget.value = props.uiState.reader })

function jump(): void { emit('jump', jumpTarget.value) }
function randomJump(): void {
  if (props.runtime.logicalCount <= 0) return
  const next = (Math.imul(props.uiState.reader + 17, 1103515245) + 12345) >>> 0
  jumpTarget.value = next % props.runtime.logicalCount
  emit('jump', jumpTarget.value)
}
function onRateChange(event: Event): void { props.stream.setRate(Number((event.target as HTMLSelectElement).value)) }
function resumeStream(): void { props.stream.start(false) }
function pauseStream(): void { props.stream.pause() }
</script>

<template>
  <aside class="diagnostics-panel">
    <div class="diagnostics-head">
      <div><span class="eyebrow">Engine observability</span><strong>Session diagnostics</strong></div>
      <button class="icon-button" type="button" aria-label="Close diagnostics" @click="emit('close')">×</button>
    </div>
    <div class="session-scope-card" data-testid="active-session-card">
      <span>active session</span><strong data-testid="active-session-id">{{ runtime.id }}</strong><small>{{ runtime.title }}</small>
    </div>

    <div class="control-group">
      <label for="jump">History navigation</label>
      <div class="inline-control"><input id="jump" v-model.number="jumpTarget" data-testid="jump-input" type="number" min="0" :max="Math.max(0, runtime.logicalCount - 1)" /><button data-testid="jump-button" :disabled="runtime.logicalCount === 0" @click="jump">Jump</button></div>
      <div class="inline-control"><button class="secondary" :disabled="runtime.logicalCount === 0" @click="randomJump">Random history point</button><button class="secondary" data-testid="prepend-button" @click="emit('shiftBackward')">Load older</button><button class="secondary" @click="emit('shiftForward')">Load newer</button></div>
      <small class="control-note">Exercises exact global navigation and bounded history-window replacement without changing semantic reader ownership.</small>
    </div>

    <div class="control-group">
      <label>Live output</label>
      <div class="inline-control"><select :value="streamRate" aria-label="Stream rate" @change="onRateChange"><option :value="5">5 Hz</option><option :value="20">20 Hz</option><option :value="60">60 Hz</option></select><button data-testid="stream-start" :disabled="uiState.sessionStatus !== 'working'" @click="resumeStream">Resume</button><button class="secondary" :disabled="uiState.sessionStatus !== 'working'" @click="pauseStream">Pause</button></div>
      <small class="control-note">Changes producer cadence while the Engine keeps semantic mutations ordered and presentation work bounded.</small>
    </div>

    <div class="control-group">
      <label>Renderer verification</label>
      <div class="fixture-grid">
        <button data-testid="inject-mixed-five" :disabled="!canInjectFixtures" @click="emit('injectMixed', 5)">Mixed content ×5</button>
        <button class="secondary" data-testid="inject-markdown-gallery" :disabled="!canInjectFixtures" @click="emit('injectMarkdown')">Markdown suite</button>
        <button class="secondary" data-testid="inject-agent-scenarios" :disabled="!canInjectFixtures" @click="emit('injectAgent')">Media + tools suite</button>
      </div>
      <small class="control-note">Adds canonical test conversations through SessionKernel; no DOM-only fixtures or renderer bypasses.</small>
    </div>

    <div class="control-group">
      <label>Scale & concurrency</label>
      <div class="metrics" data-testid="metrics">
        <div><span>logical messages</span><strong data-testid="logical-count">{{ runtime.logicalCount.toLocaleString() }}</strong></div>
        <div><span>hot messages</span><strong>{{ (uiState.rangeEnd - uiState.rangeStart).toLocaleString() }}</strong></div>
        <div><span>render units</span><strong data-testid="active-units">{{ uiState.projectionSize.toLocaleString() }}</strong></div>
        <div><span>DOM rows</span><strong data-testid="mounted-rows">{{ mountedRows }}</strong></div>
        <div><span>running kernels</span><strong data-testid="running-kernels">{{ runningSessionCount }}</strong></div>
        <div><span>hot runtimes</span><strong data-testid="hot-sessions">{{ hotSessionCount }}</strong></div>
        <div><span>blocked sessions</span><strong data-testid="blocked-sessions">{{ blockedSessionCount }}</strong></div>
        <div><span>failed sessions</span><strong data-testid="failed-sessions">{{ failedSessionCount }}</strong></div>
        <div><span>messages after reader</span><strong data-testid="messages-after-metric">{{ uiState.messagesAfter.toLocaleString() }}</strong></div>
        <div><span>queued prompts</span><strong data-testid="queued-prompts">{{ uiState.queuedPrompts }}</strong></div>
      </div>
    </div>

    <div class="control-group">
      <label>Projection & streaming</label>
      <div class="metrics">
        <div><span>projection cache</span><strong data-testid="projection-cache">{{ uiState.projectionCacheSize }}</strong></div>
        <div><span>full projects</span><strong data-testid="projection-full-projects">{{ uiState.projectionFullProjects }}</strong></div>
        <div><span>incremental patches</span><strong data-testid="projection-incremental">{{ uiState.projectionIncrementalPatches }}</strong></div>
        <div><span>stream ingress</span><strong data-testid="stream-ingress">{{ streamIngressTicks }}</strong></div>
        <div><span>UI publishes</span><strong data-testid="stream-ticks">{{ streamPublishTicks }}</strong></div>
        <div><span>live render units</span><strong data-testid="live-chunks">{{ uiState.liveChunkCount }}</strong></div>
      </div>
    </div>

    <div class="control-group">
      <label>Session accounting</label>
      <div class="metrics">
        <div><span>billed input</span><strong data-testid="diagnostic-input-tokens">{{ formatTokens(billedInputTokens(activeUsage)) }}</strong></div>
        <div><span>output</span><strong data-testid="diagnostic-output-tokens">{{ formatTokens(activeUsage.outputTokens) }}</strong></div>
        <div><span>provider cache hit</span><strong data-testid="diagnostic-cache-hit">{{ activeCacheHit === null ? 'n/a' : `${activeCacheHit}%` }}</strong></div>
        <div><span>context used</span><strong data-testid="diagnostic-context">{{ activeContext === null ? 'n/a' : `${activeContext}%` }}</strong></div>
        <div><span>last turn</span><strong data-testid="last-turn-reason">{{ runtime.kernel.lastTurnReason ?? 'active' }}</strong></div>
        <div><span>failure</span><strong data-testid="last-failure-code">{{ runtime.kernel.lastFailure?.code ?? '—' }}</strong></div>
      </div>
    </div>

    <div class="control-group">
      <label>Browser performance</label>
      <div class="metrics">
        <div><span>FPS</span><strong>{{ fps }}</strong></div>
        <div><span>frame p95</span><strong>{{ frameP95 }} ms</strong></div>
        <div><span>long tasks</span><strong>{{ longTasks }}</strong></div>
        <div><span>JS heap</span><strong>{{ heapMb === null ? 'n/a' : `${heapMb} MB` }}</strong></div>
      </div>
    </div>

    <div class="architecture-note">
      <strong>What this panel proves</strong>
      <span>Large logical history stays decoupled from hot projection and mounted DOM, while background SessionKernels, queue/blockers, streaming and exact reader state remain observable.</span>
    </div>
  </aside>
</template>
