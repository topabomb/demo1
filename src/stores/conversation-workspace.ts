import { computed, ref, shallowReactive, type ComputedRef, type Ref } from 'vue'
import { SyntheticConversationSource } from '../core/synthetic'
import { WindowMaterializer } from '../core/window-materializer'
import { PageHeightIndex } from '../core/page-index'
import type { RenderUnit } from '../core/types'

export const WINDOW_MESSAGES = 2048
export const SHIFT_MESSAGES = 512
export const HOT_SESSION_LIMIT = 3

export type SessionStatus = 'running' | 'completed'

export interface SessionDescriptor {
  id: string
  title: string
  age: string
  status: SessionStatus
  logicalCount: number
  seedOffset: number
}

/**
 * Lightweight state that survives heavy-runtime eviction. It is intentionally
 * semantic: no DOM node, virtualizer instance or backend object is retained.
 */
export interface SessionViewportSnapshot {
  logicalPosition: number
  anchorUnitId: string | null
  anchorOffsetPx: number
  followTail: boolean
  atVisualBottom: boolean
}

/**
 * Heavy per-session hot state. Only a small LRU set is kept resident.
 * Large history remains addressable by ConversationSource instead of being
 * materialized or made deeply reactive.
 */
export interface ConversationSessionRuntime {
  id: string
  title: string
  age: string
  status: SessionStatus
  logicalCount: number
  source: SyntheticConversationSource
  windowModel: WindowMaterializer
  pageHeights: PageHeightIndex
  activeUnits: RenderUnit[]
  liveTailUnits: RenderUnit[]
  overrides: Map<string, RenderUnit>
  segmentStart: number
  segmentEnd: number
  jumpInput: number
  shiftMode: boolean
  virtualEpoch: number
  mountedRows: number
  currentLogicalPosition: number
  followTail: boolean
  atVisualBottom: boolean
  streamRate: number
  streamIngressTicks: number
  streamRenderTicks: number
  streamTarget: string | null
  streamChunkText: string
  pendingDelta: string
  streamBaseUnit: RenderUnit | null
  tailIntentGeneration: number
}

const RECENT_SESSIONS: readonly SessionDescriptor[] = [
  { id: 'million', title: 'Million-message stress session', age: 'now', status: 'running', logicalCount: 1_000_000, seedOffset: 0 },
  { id: 'dsh-transport', title: 'DSH transport architecture', age: '14m', status: 'completed', logicalCount: 180_000, seedOffset: 101 },
  { id: 'tool-rendering', title: 'Virtualized tool-call rendering', age: '1h', status: 'completed', logicalCount: 420_000, seedOffset: 211 },
  { id: 'event-normalization', title: 'Agent event normalization', age: '2h', status: 'completed', logicalCount: 95_000, seedOffset: 307 },
  { id: 'dynamic-heights', title: 'Dynamic height edge cases', age: '4h', status: 'completed', logicalCount: 260_000, seedOffset: 401 },
  { id: 'workspace-files', title: 'Workspace filesystem design', age: '1d', status: 'completed', logicalCount: 48_000, seedOffset: 503 },
  { id: 'android-protocol', title: 'Android client protocol notes', age: '2d', status: 'completed', logicalCount: 24_000, seedOffset: 601 },
  { id: 'context-cache', title: 'Long context cache analysis', age: '3d', status: 'completed', logicalCount: 700_000, seedOffset: 701 },
]

function defaultSnapshot(descriptor: SessionDescriptor): SessionViewportSnapshot {
  return {
    logicalPosition: descriptor.logicalCount - 1,
    anchorUnitId: null,
    anchorOffsetPx: 0,
    followTail: true,
    atVisualBottom: true,
  }
}

function createRuntime(
  descriptor: SessionDescriptor,
  snapshot: SessionViewportSnapshot,
  logicalCount = descriptor.logicalCount,
): ConversationSessionRuntime {
  const safePosition = Math.max(0, Math.min(logicalCount - 1, snapshot.logicalPosition))
  const source = new SyntheticConversationSource(logicalCount, descriptor.id, descriptor.seedOffset)
  const windowModel = new WindowMaterializer(source, WINDOW_MESSAGES, SHIFT_MESSAGES, safePosition)
  const range = windowModel.range

  return shallowReactive<ConversationSessionRuntime>({
    id: descriptor.id,
    title: descriptor.title,
    age: descriptor.age,
    status: descriptor.status,
    logicalCount,
    source,
    windowModel,
    pageHeights: new PageHeightIndex(logicalCount),
    activeUnits: [...windowModel.units],
    liveTailUnits: [],
    overrides: shallowReactive(new Map<string, RenderUnit>()),
    segmentStart: range.start,
    segmentEnd: range.end,
    jumpInput: safePosition,
    shiftMode: false,
    virtualEpoch: 0,
    mountedRows: 0,
    currentLogicalPosition: safePosition,
    followTail: snapshot.followTail,
    atVisualBottom: snapshot.atVisualBottom && range.end === logicalCount,
    streamRate: 20,
    streamIngressTicks: 0,
    streamRenderTicks: 0,
    streamTarget: null,
    streamChunkText: '',
    pendingDelta: '',
    streamBaseUnit: null,
    tailIntentGeneration: 0,
  })
}

export interface ConversationWorkspaceStore {
  descriptors: readonly SessionDescriptor[]
  activeSessionId: Ref<string>
  activeSession: ComputedRef<ConversationSessionRuntime>
  hotSessionCount: ComputedRef<number>
  ensureRuntime(id: string): ConversationSessionRuntime
  activate(id: string): ConversationSessionRuntime
  saveViewport(id: string, snapshot: SessionViewportSnapshot): void
  viewportFor(id: string): SessionViewportSnapshot
  resetRuntime(id: string, logicalCount: number): ConversationSessionRuntime
  pruneHotSessions(): void
}

/**
 * The UI-facing workspace store keeps only a bounded set of heavy conversation
 * runtimes. Session metadata and semantic viewport snapshots are cheap and may
 * remain for every Recent entry. This mirrors a production Agent client where a
 * session list can be large while only a few conversations are hot in memory.
 */
export function useConversationWorkspaceStore(): ConversationWorkspaceStore {
  const descriptors = RECENT_SESSIONS
  const descriptorById = new Map(descriptors.map(entry => [entry.id, entry]))
  const viewportSnapshots = new Map<string, SessionViewportSnapshot>(
    descriptors.map(entry => [entry.id, defaultSnapshot(entry)]),
  )
  const runtimes = shallowReactive(new Map<string, ConversationSessionRuntime>())
  const lastAccess = new Map<string, number>()
  let accessClock = 0

  const first = descriptors[0]!
  const activeSessionId = ref(first.id)

  function touch(id: string): void {
    accessClock += 1
    lastAccess.set(id, accessClock)
  }

  function ensureRuntime(id: string): ConversationSessionRuntime {
    const existing = runtimes.get(id)
    if (existing) {
      touch(id)
      return existing
    }

    const descriptor = descriptorById.get(id)
    if (!descriptor) throw new Error(`Unknown conversation session: ${id}`)
    const snapshot = viewportSnapshots.get(id) ?? defaultSnapshot(descriptor)
    const runtime = createRuntime(descriptor, snapshot)
    runtimes.set(id, runtime)
    touch(id)
    return runtime
  }

  ensureRuntime(first.id)

  const activeSession = computed(() => {
    const runtime = runtimes.get(activeSessionId.value)
    if (!runtime) throw new Error(`Active conversation runtime missing: ${activeSessionId.value}`)
    return runtime
  })
  const hotSessionCount = computed(() => runtimes.size)

  function saveViewport(id: string, snapshot: SessionViewportSnapshot): void {
    const descriptor = descriptorById.get(id)
    if (!descriptor) return
    viewportSnapshots.set(id, {
      logicalPosition: Math.max(0, Math.min((runtimes.get(id)?.logicalCount ?? descriptor.logicalCount) - 1, snapshot.logicalPosition)),
      anchorUnitId: snapshot.anchorUnitId,
      anchorOffsetPx: snapshot.anchorOffsetPx,
      followTail: snapshot.followTail,
      atVisualBottom: snapshot.atVisualBottom,
    })
  }

  function viewportFor(id: string): SessionViewportSnapshot {
    const descriptor = descriptorById.get(id)
    if (!descriptor) throw new Error(`Unknown conversation session: ${id}`)
    return viewportSnapshots.get(id) ?? defaultSnapshot(descriptor)
  }

  function pruneHotSessions(): void {
    while (runtimes.size > HOT_SESSION_LIMIT) {
      const candidates = [...runtimes.values()]
        .filter(runtime => runtime.id !== activeSessionId.value && runtime.streamTarget === null)
        .sort((a, b) => (lastAccess.get(a.id) ?? 0) - (lastAccess.get(b.id) ?? 0))
      const victim = candidates[0]
      if (!victim) break
      runtimes.delete(victim.id)
      lastAccess.delete(victim.id)
    }
  }

  function activate(id: string): ConversationSessionRuntime {
    const runtime = ensureRuntime(id)
    activeSessionId.value = id
    touch(id)
    pruneHotSessions()
    return runtime
  }

  function resetRuntime(id: string, logicalCount: number): ConversationSessionRuntime {
    const descriptor = descriptorById.get(id)
    if (!descriptor) throw new Error(`Unknown conversation session: ${id}`)
    const safeCount = Math.max(1, Math.floor(logicalCount))
    const snapshot: SessionViewportSnapshot = {
      logicalPosition: safeCount - 1,
      anchorUnitId: null,
      anchorOffsetPx: 0,
      followTail: true,
      atVisualBottom: true,
    }
    viewportSnapshots.set(id, snapshot)
    const runtime = createRuntime(descriptor, snapshot, safeCount)
    runtimes.set(id, runtime)
    touch(id)
    pruneHotSessions()
    return runtime
  }

  return {
    descriptors,
    activeSessionId,
    activeSession,
    hotSessionCount,
    ensureRuntime,
    activate,
    saveViewport,
    viewportFor,
    resetRuntime,
    pruneHotSessions,
  }
}
