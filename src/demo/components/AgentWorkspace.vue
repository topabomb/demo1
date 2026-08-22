<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { usePerformanceMetrics } from '../use-performance-metrics'
import type { SessionViewMemory } from '../../engine/viewport/state'
import {
  deriveSessionIndicator,
  sessionIndicatorGlyph,
  sessionIndicatorLabel,
  type SessionIndicator,
} from '../../engine/conversation/session-semantics'
import { createAgentScenarioPack, createMarkdownGalleryTurn, createMixedDemoTurns } from '../scenarios'
import type { DemoSessionDescriptor } from '../workspace-fixtures'
import { useWorkspaceRuntime } from '../vue/use-workspace-runtime'
import { ActivePlanStrip, ConversationViewport } from '../../engine/vue'
import DemoDiagnosticsPanel from './DemoDiagnosticsPanel.vue'

interface ViewportHandle {
  captureSnapshot(): SessionViewMemory
  jumpToMessage(index?: number): Promise<void>
  jumpToLatest(): Promise<void>
  shiftBackward(): Promise<void>
  shiftForward(): Promise<void>
}

type DemoNavigationTarget =
  | 'restart-agent'
  | 'agent-plan'
  | 'agent-delegation'
  | 'agent-terminal'
  | 'agent-final'
  | 'office-briefing'
  | 'office-followup'
  | 'lifecycle-clarify'
  | 'lifecycle-fallback'
  | 'lifecycle-steer'

const AGENT_DEMO_MESSAGE = {
  'agent-plan': 83_999,
  'agent-delegation': 84_005,
  'agent-terminal': 84_007,
  'agent-final': 84_008,
} as const

const { workspace, activeSession, activeUiState, workspaceRevision } = useWorkspaceRuntime()
const viewportRef = ref<ViewportHandle | null>(null)
// Keep the public workspace clean by default, but diagnostics are always one click away.
// Playwright opens the panel automatically because the E2E suite consumes its observability surface.
const diagnosticsOpen = ref(typeof navigator !== 'undefined' && navigator.webdriver)
const mountedRows = ref(0)
const mobileSessionsOpen = ref(false)
const fixtureOrdinal = ref(1)
const { fps, frameP95, longTasks, heapMb } = usePerformanceMetrics()

const activeExecution = computed(() => workspace.executionFor(activeSession.value.id))
const sessionDescriptors = computed(() => { void workspaceRevision.value; return workspace.descriptors })
const hotSessionCount = computed(() => { void workspaceRevision.value; return workspace.hotSessionCount })
const runningSessionCount = computed(() => { void workspaceRevision.value; return workspace.runningSessionCount })
const blockedSessionCount = computed(() => { void workspaceRevision.value; return workspace.blockedSessionCount })
const failedSessionCount = computed(() => { void workspaceRevision.value; return workspace.failedSessionCount })
const canInjectFixtures = computed(() => activeUiState.value.sessionStatus !== 'working' && !activeUiState.value.pendingInteraction)
const activePlan = computed(() => { void activeUiState.value.eventRevision; return activeSession.value.kernel.activePlan })
const activeParentSessionId = computed(() => workspace.parentSessionId(activeSession.value.id))
const activeParentTitle = computed(() => {
  const id = activeParentSessionId.value
  return id ? workspace.kernelFor(id).title : ''
})

function switchSession(id: string): void {
  if (id !== activeSession.value.id) {
    const snapshot = viewportRef.value?.captureSnapshot()
    workspace.activate(id, snapshot)
    mountedRows.value = 0
  }
  mobileSessionsOpen.value = false
}

function newSession(): void {
  const snapshot = viewportRef.value?.captureSnapshot()
  if (snapshot) workspace.saveSnapshot(activeSession.value.id, snapshot)
  const id = workspace.createSession()
  workspace.activate(id)
  mountedRows.value = 0
  mobileSessionsOpen.value = false
}

function jump(target: number): void { void viewportRef.value?.jumpToMessage(target) }
function indicator(descriptor: DemoSessionDescriptor): SessionIndicator { return deriveSessionIndicator(descriptor) }
function indicatorDetail(descriptor: DemoSessionDescriptor): string {
  const state = indicator(descriptor)
  if (state === 'blocked') return descriptor.pendingInteraction?.kind === 'question' ? 'Needs answer' : 'Needs approval'
  if (state === 'failed') return descriptor.lastFailure?.code ?? 'Failed'
  if (descriptor.queuedPrompts) return `${descriptor.queuedPrompts} queued`
  return `${descriptor.logicalCount.toLocaleString()} messages`
}

async function openChildSession(childSessionId: string): Promise<void> {
  if (!workspace.hasSession(childSessionId)) return
  switchSession(childSessionId)
  await nextTick()
  await viewportRef.value?.jumpToLatest()
}

function onConversationClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-child-session-id]') : null
  const childSessionId = target?.dataset.childSessionId
  if (!childSessionId || childSessionId === activeSession.value.id) return
  void openChildSession(childSessionId)
}

async function returnToParent(): Promise<void> {
  const parent = activeParentSessionId.value
  if (!parent) return
  // switchSession captures the child snapshot and DemoWorkspaceRuntime restores the
  // parent's previously committed viewport snapshot. Do not override that restoration
  // with a jump-to-latest: returning from a child should land back on the delegation
  // context that opened it.
  switchSession(parent)
  await nextTick()
}

async function navigateDemo(target: DemoNavigationTarget): Promise<void> {
  if (target === 'restart-agent') {
    // Full reload is intentionally Demo-only: it recreates the synthetic producer and
    // all seeded sessions without pretending the Engine owns replay/reset policy.
    window.location.reload()
    return
  }

  const directSession = {
    'office-briefing': 'office-briefing',
    'office-followup': 'office-followup',
    'lifecycle-clarify': 'android-protocol',
    'lifecycle-fallback': 'resilience-fallback',
    'lifecycle-steer': 'steered-migration',
  }[target]
  if (directSession) {
    switchSession(directSession)
    await nextTick()
    await viewportRef.value?.jumpToLatest()
    return
  }

  switchSession('agent-loop')
  await nextTick()
  const messageIndex = AGENT_DEMO_MESSAGE[target]
  if (activeSession.value.logicalCount > messageIndex) await viewportRef.value?.jumpToMessage(messageIndex)
  else await viewportRef.value?.jumpToLatest()
}

// Verification fixtures stay in Demo ownership. They exercise the normal canonical
// model/projector/renderer path and are exposed only inside Session diagnostics.
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
    <button class="mobile-session-toggle" data-testid="mobile-session-toggle" type="button" aria-label="Open conversations" @click="mobileSessionsOpen = true">☰</button>
    <button v-if="mobileSessionsOpen" class="mobile-session-backdrop" type="button" aria-label="Close conversations" @click="mobileSessionsOpen = false" />

    <aside class="session-sidebar" data-testid="session-sidebar">
      <div class="sidebar-head">
        <div>
          <div class="product-name">Agent Workspace</div>
          <small class="product-kicker">Conversation engine demo</small>
        </div>
        <div class="sidebar-head-actions">
          <a class="architecture-link" href="#architecture" data-testid="architecture-link" title="Engine architecture">⌘</a>
          <button class="mobile-session-close" type="button" aria-label="Close conversations" @click="mobileSessionsOpen = false">×</button>
        </div>
      </div>

      <div class="primary-actions">
        <button class="new-session" data-testid="new-session" @click="newSession">＋ New session</button>
      </div>

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
          <span class="session-copy">
            <strong>{{ descriptor.title }}</strong>
            <small><span>{{ sessionIndicatorLabel(indicator(descriptor)) }}</span><span> · {{ indicatorDetail(descriptor) }}</span></small>
          </span>
          <span class="session-row-meta"><i v-if="descriptor.unread" class="unread-dot" /><time>{{ descriptor.age }}</time></span>
        </button>
      </div>

      <div class="sidebar-footer">
        <span class="status-led" />
        <span>{{ runningSessionCount }} working</span>
        <span v-if="blockedSessionCount">· {{ blockedSessionCount }} waiting</span>
        <span v-if="failedSessionCount">· {{ failedSessionCount }} failed</span>
      </div>
    </aside>

    <ConversationViewport
      :key="activeSession.id"
      ref="viewportRef"
      :runtime="activeSession"
      :execution="activeExecution"
      :ui-state="activeUiState"
      @click.capture="onConversationClick"
      @viewport-metrics="mountedRows = $event.mountedRows"
    >
      <template #header-context>
        <button
          v-if="activeParentSessionId"
          class="demo-parent-session"
          data-testid="parent-session-link"
          type="button"
          :title="`Return to ${activeParentTitle}`"
          @click.stop="returnToParent"
        >← Parent · {{ activeParentTitle }}</button>
      </template>
      <template #header-actions>
        <button class="demo-header-action" data-testid="diagnostics-open" type="button" :aria-pressed="diagnosticsOpen" title="Session diagnostics" aria-label="Session diagnostics" @click="diagnosticsOpen = !diagnosticsOpen">◫</button>
      </template>
      <template #viewport-overlay="{ mountedRows: visibleRows, followLabel, uiState }">
        <div v-show="diagnosticsOpen" class="conversation-meta-strip">
          <span>Loaded <strong data-testid="segment-range">{{ uiState.rangeStart.toLocaleString() }} – {{ Math.max(uiState.rangeStart, uiState.rangeEnd - 1).toLocaleString() }}</strong></span>
          <span>Reader <strong data-testid="reader-position">#{{ uiState.reader.toLocaleString() }}</strong></span>
          <span data-testid="mounted-label">{{ visibleRows }} DOM rows</span><span v-if="uiState.activeMessageId" data-testid="follow-state">{{ followLabel }}</span>
        </div>
      </template>
      <template #composer-tools>
        <ActivePlanStrip :plan="activePlan" />
      </template>
    </ConversationViewport>

    <DemoDiagnosticsPanel
      v-show="diagnosticsOpen"
      :runtime="activeSession"
      :ui-state="activeUiState"
      :stream="activeExecution"
      :mounted-rows="mountedRows"
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
      @demo-navigate="navigateDemo"
    />
  </section>
</template>