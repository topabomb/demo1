<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { usePerformanceMetrics } from '../use-performance-metrics'
import type { ConversationDescriptor } from '../../engine/conversation/contracts'
import type { SessionViewMemory } from '../../engine/viewport/state'
import {
  cacheHitPercent,
  deriveSessionIndicator,
  sessionIndicatorGlyph,
  sessionIndicatorLabel,
  type SessionIndicator,
} from '../../engine/conversation/session-semantics'
import { createAgentScenarioPack, createMarkdownGalleryTurn, createMixedDemoTurns } from '../scenarios'
import { useWorkspaceRuntime } from '../vue/use-workspace-runtime'
import ConversationViewport from '../../engine/vue/ConversationViewport.vue'
import DemoDiagnosticsPanel from './DemoDiagnosticsPanel.vue'

interface ViewportHandle {
  captureSnapshot(): SessionViewMemory
  jumpToMessage(index?: number): Promise<void>
  jumpToLatest(): Promise<void>
  shiftBackward(): Promise<void>
  shiftForward(): Promise<void>
}

const { workspace, activeSession, activeUiState, workspaceRevision } = useWorkspaceRuntime()
const viewportRef = ref<ViewportHandle | null>(null)
const diagnosticsOpen = ref(typeof navigator !== 'undefined' && navigator.webdriver)
const sessionQuery = ref('')
const mobileSessionsOpen = ref(false)
const fixtureOrdinal = ref(1)
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
const blockedSessionCount = computed(() => { void workspaceRevision.value; return workspace.blockedSessionCount })
const failedSessionCount = computed(() => { void workspaceRevision.value; return workspace.failedSessionCount })
const canInjectFixtures = computed(() => activeUiState.value.sessionStatus !== 'working' && !activeUiState.value.pendingInteraction)

function switchSession(id: string): void {
  if (id !== activeSession.value.id) {
    const snapshot = viewportRef.value?.captureSnapshot()
    workspace.activate(id, snapshot)
  }
  mobileSessionsOpen.value = false
}

function newSession(): void {
  const snapshot = viewportRef.value?.captureSnapshot()
  if (snapshot) workspace.saveSnapshot(activeSession.value.id, snapshot)
  const id = workspace.createSession()
  workspace.activate(id)
  mobileSessionsOpen.value = false
}

async function openAgentScenarios(): Promise<void> {
  const target = 'dsh-transport'
  if (activeSession.value.id !== target) {
    const snapshot = viewportRef.value?.captureSnapshot()
    workspace.activate(target, snapshot)
    await nextTick()
  }
  if (activeSession.value.kernel.status === 'working' || activeSession.value.kernel.pendingInteraction) return
  activeSession.value.kernel.appendCanonicalMessages(createAgentScenarioPack(target, fixtureOrdinal.value++))
  await Promise.resolve()
  await nextTick()
  await viewportRef.value?.jumpToLatest()
  mobileSessionsOpen.value = false
}

function jump(target = activeSession.value.jumpInput): void {
  activeSession.value.jumpInput = target
  void viewportRef.value?.jumpToMessage(target)
}
function indicator(descriptor: ConversationDescriptor): SessionIndicator { return deriveSessionIndicator(descriptor) }
function indicatorDetail(descriptor: ConversationDescriptor): string {
  const state = indicator(descriptor)
  if (state === 'blocked') return descriptor.pendingInteraction?.kind === 'question' ? 'Question' : 'Approval'
  if (state === 'failed') return descriptor.lastFailure?.code ?? 'Error'
  if (descriptor.queuedPrompts) return `${descriptor.queuedPrompts} queued`
  const hit = descriptor.usage ? cacheHitPercent({
    inputTokens: descriptor.usage.inputTokens ?? 0,
    outputTokens: descriptor.usage.outputTokens ?? 0,
    cacheReadTokens: descriptor.usage.cacheReadTokens ?? 0,
    cacheWriteTokens: descriptor.usage.cacheWriteTokens ?? 0,
    reasoningTokens: descriptor.usage.reasoningTokens ?? 0,
  }) : null
  if (hit !== null) return `${hit}% cache`
  return `${descriptor.logicalCount.toLocaleString()} messages`
}

async function injectMixed(turns: number): Promise<void> {
  if (!canInjectFixtures.value) return
  const start = fixtureOrdinal.value
  activeSession.value.kernel.appendCanonicalMessages(createMixedDemoTurns(activeSession.value.id, start, turns))
  fixtureOrdinal.value += turns
  await Promise.resolve()
  await viewportRef.value?.jumpToLatest()
}

async function injectMarkdownGallery(): Promise<void> {
  if (!canInjectFixtures.value) return
  activeSession.value.kernel.appendCanonicalMessages(createMarkdownGalleryTurn(activeSession.value.id, fixtureOrdinal.value++))
  await Promise.resolve()
  await viewportRef.value?.jumpToLatest()
}

async function injectAgentScenarios(): Promise<void> {
  if (!canInjectFixtures.value) return
  activeSession.value.kernel.appendCanonicalMessages(createAgentScenarioPack(activeSession.value.id, fixtureOrdinal.value++))
  await Promise.resolve()
  await viewportRef.value?.jumpToLatest()
}
</script>

<template>
  <section class="agent-app" :class="{ 'diagnostics-closed': !diagnosticsOpen, 'mobile-sessions-open': mobileSessionsOpen }">
    <button class="mobile-session-toggle" data-testid="mobile-session-toggle" type="button" aria-label="Open sessions" @click="mobileSessionsOpen = true">☰</button>
    <button v-if="mobileSessionsOpen" class="mobile-session-backdrop" aria-label="Close sessions" @click="mobileSessionsOpen = false" />

    <aside class="session-sidebar" data-testid="session-sidebar">
      <div class="sidebar-head"><div class="product-name">Agent Workspace Lab</div><div class="sidebar-head-actions"><a class="architecture-link" href="#architecture" data-testid="architecture-link" title="Architecture reference">⌘</a><button class="mobile-session-close" aria-label="Close sessions" @click="mobileSessionsOpen = false">×</button></div></div>
      <div class="workspace-context"><span class="workspace-dot" /><span>reference-workspace</span><small>backend-neutral</small></div>
      <button class="new-session" data-testid="new-session" @click="newSession">＋ New session</button>
      <button class="new-session" data-testid="scenario-launch" @click="openAgentScenarios">✦ Agent scenarios</button>
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
          :class="[`indicator-${indicator(descriptor)}`, { active: descriptor.id === activeSession.id, unread: descriptor.unread }]"
          :data-testid="`session-${descriptor.id}`"
          @click="switchSession(descriptor.id)"
        >
          <span class="session-glyph" :class="`indicator-${indicator(descriptor)}`">{{ sessionIndicatorGlyph(indicator(descriptor)) }}</span>
          <span class="session-copy"><strong>{{ descriptor.title }}</strong><small><span>{{ sessionIndicatorLabel(indicator(descriptor)) }}</span><span> · {{ indicatorDetail(descriptor) }}</span></small></span>
          <span class="session-row-meta"><i v-if="descriptor.unread" class="unread-dot" /><time>{{ descriptor.age }}</time></span>
        </button>
        <div v-if="sessionDescriptors.length === 0" class="session-empty">No matching sessions</div>
      </div>
      <div class="sidebar-footer"><span class="status-led" /><span>{{ runningSessionCount }} working</span><span v-if="blockedSessionCount">· {{ blockedSessionCount }} blocked</span><span v-if="failedSessionCount">· {{ failedSessionCount }} failed</span><span class="sidebar-version">{{ hotSessionCount }}/3 hot</span></div>
    </aside>

    <ConversationViewport data-conversation-engine="vue" :key="activeSession.id" ref="viewportRef" :runtime="activeSession" :stream="activeStream" :ui-state="activeUiState" :diagnostics="diagnosticsOpen" />

    <DemoDiagnosticsPanel
      v-show="diagnosticsOpen"
      :runtime="activeSession"
      :ui-state="activeUiState"
      :stream="activeStream"
      :hot-session-ids="hotSessionIds"
      :hot-session-count="hotSessionCount"
      :running-session-count="runningSessionCount"
      :blocked-session-count="blockedSessionCount"
      :failed-session-count="failedSessionCount"
      :fps="fps"
      :frame-p95="frameP95"
      :long-tasks="longTasks"
      :heap-mb="heapMb"
      :can-inject-fixtures="canInjectFixtures"
      @close="diagnosticsOpen = false"
      @jump="jump"
      @shift-backward="viewportRef?.shiftBackward()"
      @shift-forward="viewportRef?.shiftForward()"
      @inject-mixed="injectMixed"
      @inject-markdown="injectMarkdownGallery"
      @inject-agent="injectAgentScenarios"
    />

    <button v-if="!diagnosticsOpen" class="diagnostics-reopen" data-testid="diagnostics-open" title="Architecture diagnostics" @click="diagnosticsOpen = true">◫</button>
  </section>
</template>
