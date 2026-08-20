import type { ConversationDescriptor, ViewportSnapshot } from './contracts'
import { BatchedNotifier, type Unsubscribe } from './notifier'
import { ConversationSessionRuntime } from './session-runtime'
import { SyntheticHistoryAdapter } from './synthetic-adapter'

export const HOT_SESSION_LIMIT = 3

export const RECENT_SESSIONS: readonly (ConversationDescriptor & { seedOffset: number })[] = [
  { id: 'million', title: 'Million-message stress session', age: 'now', status: 'running', logicalCount: 1_000_000, seedOffset: 0 },
  { id: 'dsh-transport', title: 'DSH transport architecture', age: '14m', status: 'completed', logicalCount: 180_000, seedOffset: 101 },
  { id: 'tool-rendering', title: 'Virtualized tool-call rendering', age: '1h', status: 'completed', logicalCount: 420_000, seedOffset: 211 },
  { id: 'event-normalization', title: 'Agent event normalization', age: '2h', status: 'completed', logicalCount: 95_000, seedOffset: 307 },
  { id: 'dynamic-heights', title: 'Dynamic height edge cases', age: '4h', status: 'completed', logicalCount: 260_000, seedOffset: 401 },
  { id: 'workspace-files', title: 'Workspace filesystem design', age: '1d', status: 'completed', logicalCount: 48_000, seedOffset: 503 },
  { id: 'android-protocol', title: 'Android client protocol notes', age: '2d', status: 'completed', logicalCount: 24_000, seedOffset: 601 },
  { id: 'context-cache', title: 'Long context cache analysis', age: '3d', status: 'completed', logicalCount: 700_000, seedOffset: 701 },
]

/**
 * Framework-free workspace controller. It keeps session metadata/snapshots cheap,
 * lazily hydrates heavyweight session runtimes, and evicts cold runtimes with LRU.
 */
export class ConversationWorkspaceRuntime {
  readonly descriptors = RECENT_SESSIONS
  #descriptorById = new Map(RECENT_SESSIONS.map(entry => [entry.id, entry]))
  #snapshots = new Map<string, ViewportSnapshot>()
  #runtimes = new Map<string, ConversationSessionRuntime>()
  #lastAccess = new Map<string, number>()
  #notifier = new BatchedNotifier()
  #clock = 0
  #activeSessionId = RECENT_SESSIONS[0]!.id

  constructor() {
    for (const descriptor of this.descriptors) this.#snapshots.set(descriptor.id, defaultSnapshot(descriptor))
    this.ensureRuntime(this.#activeSessionId)
  }

  subscribe(listener: () => void): Unsubscribe {
    return this.#notifier.subscribe(listener)
  }

  get activeSessionId(): string { return this.#activeSessionId }
  get activeSession(): ConversationSessionRuntime { return this.ensureRuntime(this.#activeSessionId) }
  get hotSessionCount(): number { return this.#runtimes.size }
  get hotSessionIds(): readonly string[] { return [...this.#runtimes.keys()] }

  ensureRuntime(id: string): ConversationSessionRuntime {
    const existing = this.#runtimes.get(id)
    if (existing) {
      this.#touch(id)
      return existing
    }

    const descriptor = this.#descriptorById.get(id)
    if (!descriptor) throw new Error(`Unknown conversation session: ${id}`)
    const snapshot = this.#snapshots.get(id) ?? defaultSnapshot(descriptor)
    const adapter = new SyntheticHistoryAdapter(id, descriptor.logicalCount, descriptor.seedOffset)
    const runtime = new ConversationSessionRuntime(descriptor, adapter, snapshot)
    this.#runtimes.set(id, runtime)
    this.#touch(id)
    this.#prune()
    this.#notifier.markDirty()
    return runtime
  }

  /**
   * Persist the old runtime's semantic viewport before changing active scope.
   * No DOM/virtualizer object is shared between sessions.
   */
  activate(id: string, outgoingSnapshot?: ViewportSnapshot): ConversationSessionRuntime {
    if (outgoingSnapshot) this.saveSnapshot(this.#activeSessionId, outgoingSnapshot)
    else this.saveSnapshot(this.#activeSessionId, this.activeSession.snapshot())

    const runtime = this.ensureRuntime(id)
    this.#activeSessionId = id
    this.#touch(id)
    this.#prune()
    this.#notifier.notifyNow()
    return runtime
  }

  saveSnapshot(id: string, snapshot: ViewportSnapshot): void {
    const descriptor = this.#descriptorById.get(id)
    if (!descriptor) return
    const runtime = this.#runtimes.get(id)
    const count = runtime?.logicalCount ?? descriptor.logicalCount
    const normalized: ViewportSnapshot = {
      logicalPosition: Math.max(0, Math.min(count - 1, Math.floor(snapshot.logicalPosition))),
      anchorUnitId: snapshot.anchorUnitId,
      anchorOffsetPx: snapshot.anchorOffsetPx,
      followTail: snapshot.followTail,
      atVisualBottom: snapshot.atVisualBottom,
    }
    this.#snapshots.set(id, normalized)
    runtime?.rememberSnapshot(normalized)
  }

  snapshotFor(id: string): ViewportSnapshot {
    const descriptor = this.#descriptorById.get(id)
    if (!descriptor) throw new Error(`Unknown conversation session: ${id}`)
    return { ...(this.#snapshots.get(id) ?? defaultSnapshot(descriptor)) }
  }

  hasHotRuntime(id: string): boolean {
    return this.#runtimes.has(id)
  }

  #touch(id: string): void {
    this.#clock += 1
    this.#lastAccess.set(id, this.#clock)
  }

  #prune(): void {
    while (this.#runtimes.size > HOT_SESSION_LIMIT) {
      const candidates = [...this.#runtimes.values()]
        .filter(runtime => runtime.id !== this.#activeSessionId && runtime.streamTarget === null)
        .sort((a, b) => (this.#lastAccess.get(a.id) ?? 0) - (this.#lastAccess.get(b.id) ?? 0))
      const victim = candidates[0]
      if (!victim) break
      this.#snapshots.set(victim.id, victim.snapshot())
      this.#runtimes.delete(victim.id)
      this.#lastAccess.delete(victim.id)
    }
  }
}

function defaultSnapshot(descriptor: ConversationDescriptor): ViewportSnapshot {
  return {
    logicalPosition: descriptor.logicalCount - 1,
    anchorUnitId: null,
    anchorOffsetPx: 0,
    followTail: descriptor.status === 'running',
    atVisualBottom: true,
  }
}
