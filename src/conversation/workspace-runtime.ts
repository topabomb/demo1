import type { ConversationDescriptor, PendingInteraction, ViewportSnapshot } from './contracts'
import { BatchedNotifier, type Unsubscribe } from './notifier'
import { ConversationSessionRuntime } from './session-runtime'
import { ConversationSessionKernel } from './session-kernel'
import { SyntheticHistoryAdapter } from './synthetic-adapter'
import { SyntheticStreamController } from './stream-controller'

export const HOT_SESSION_LIMIT = 3

interface SeedDescriptor extends ConversationDescriptor {
  seedOffset: number
  liveTail?: boolean
}

const approval: PendingInteraction = {
  id: 'approval-edit-config',
  kind: 'approval',
  title: 'Approve workspace edit',
  detail: 'The agent wants to edit src/runtime/config.ts. This request belongs to the session and must survive navigation or viewport eviction.',
  toolName: 'edit_file',
}

export const RECENT_SESSIONS: readonly SeedDescriptor[] = [
  { id: 'million', title: 'Million-message stress session', age: 'now', status: 'working', logicalCount: 1_000_000, seedOffset: 0, liveTail: true },
  { id: 'dsh-transport', title: 'DSH transport architecture', age: '14m', status: 'idle', logicalCount: 180_000, seedOffset: 101 },
  { id: 'tool-rendering', title: 'Virtualized tool-call rendering', age: '1h', status: 'waiting', logicalCount: 420_000, seedOffset: 211, pendingInteraction: approval },
  { id: 'event-normalization', title: 'Agent event normalization', age: '2h', status: 'idle', logicalCount: 95_000, seedOffset: 307 },
  { id: 'dynamic-heights', title: 'Dynamic height edge cases', age: '4h', status: 'interrupted', logicalCount: 260_000, seedOffset: 401 },
  { id: 'workspace-files', title: 'Workspace filesystem design', age: '1d', status: 'idle', logicalCount: 48_000, seedOffset: 503 },
  { id: 'android-protocol', title: 'Android client protocol notes', age: '2d', status: 'idle', logicalCount: 24_000, seedOffset: 601 },
  { id: 'context-cache', title: 'Long context cache analysis', age: '3d', status: 'idle', logicalCount: 700_000, seedOffset: 701 },
]

/**
 * Workspace owns lightweight session kernels and a separately bounded hot runtime
 * cache. A working kernel is allowed to lose its heavy projection/viewport runtime.
 */
export class ConversationWorkspaceRuntime {
  #kernels = new Map<string, ConversationSessionKernel>()
  #executions = new Map<string, SyntheticStreamController>()
  #snapshots = new Map<string, ViewportSnapshot>()
  #runtimes = new Map<string, ConversationSessionRuntime>()
  #lastAccess = new Map<string, number>()
  #kernelUnsubs = new Map<string, Unsubscribe>()
  #summarySignatures = new Map<string, string>()
  #order: string[] = []
  #notifier = new BatchedNotifier()
  #clock = 0
  #newCounter = 0
  #activeSessionId = 'million'

  constructor() {
    for (const descriptor of RECENT_SESSIONS) this.#register(descriptor)
    this.#activeSessionId = RECENT_SESSIONS[0]!.id
    this.kernelFor(this.#activeSessionId).setForeground(true)
    this.ensureRuntime(this.#activeSessionId)
    for (const kernel of this.#kernels.values()) {
      if (kernel.status === 'working') this.executionFor(kernel.id).start(false)
    }
  }

  subscribe(listener: () => void): Unsubscribe { return this.#notifier.subscribe(listener) }
  get descriptors(): readonly ConversationDescriptor[] { return this.#order.map(id => this.kernelFor(id).summary) }
  get activeSessionId(): string { return this.#activeSessionId }
  get activeSession(): ConversationSessionRuntime { return this.ensureRuntime(this.#activeSessionId) }
  get activeKernel(): ConversationSessionKernel { return this.kernelFor(this.#activeSessionId) }
  get hotSessionCount(): number { return this.#runtimes.size }
  get hotSessionIds(): readonly string[] { return [...this.#runtimes.keys()] }
  get runningSessionCount(): number {
    let count = 0
    for (const kernel of this.#kernels.values()) if (kernel.status === 'working') count += 1
    return count
  }

  kernelFor(id: string): ConversationSessionKernel {
    const kernel = this.#kernels.get(id)
    if (!kernel) throw new Error(`Unknown conversation session: ${id}`)
    return kernel
  }

  executionFor(id: string): SyntheticStreamController {
    const execution = this.#executions.get(id)
    if (!execution) throw new Error(`Execution missing for session: ${id}`)
    return execution
  }

  ensureRuntime(id: string): ConversationSessionRuntime {
    const existing = this.#runtimes.get(id)
    if (existing) {
      this.#touch(id)
      return existing
    }
    const kernel = this.kernelFor(id)
    const snapshot = this.#snapshots.get(id) ?? defaultSnapshot(kernel.summary)
    const runtime = new ConversationSessionRuntime(kernel, snapshot)
    this.#runtimes.set(id, runtime)
    this.#touch(id)
    this.#prune()
    return runtime
  }

  activate(id: string, outgoingSnapshot?: ViewportSnapshot): ConversationSessionRuntime {
    if (id === this.#activeSessionId) return this.ensureRuntime(id)
    const outgoing = this.#activeSessionId
    if (outgoingSnapshot) this.saveSnapshot(outgoing, outgoingSnapshot)
    else {
      const runtime = this.#runtimes.get(outgoing)
      if (runtime) this.saveSnapshot(outgoing, runtime.snapshot())
    }

    this.kernelFor(outgoing).setForeground(false)
    this.#activeSessionId = id
    this.kernelFor(id).setForeground(true)
    const runtime = this.ensureRuntime(id)
    this.#touch(id)
    this.#prune()
    this.#notifier.notifyNow()
    return runtime
  }

  saveSnapshot(id: string, snapshot: ViewportSnapshot): void {
    const kernel = this.kernelFor(id)
    const normalized: ViewportSnapshot = {
      logicalPosition: clamp(snapshot.logicalPosition, kernel.count),
      anchorUnitId: snapshot.anchorUnitId,
      anchorOffsetPx: snapshot.anchorOffsetPx,
      followTail: snapshot.followTail,
      atVisualBottom: snapshot.atVisualBottom,
      draftText: snapshot.draftText,
    }
    this.#snapshots.set(id, normalized)
    this.#runtimes.get(id)?.rememberSnapshot(normalized)
  }

  snapshotFor(id: string): ViewportSnapshot {
    const kernel = this.kernelFor(id)
    return { ...(this.#snapshots.get(id) ?? defaultSnapshot(kernel.summary)) }
  }

  hasHotRuntime(id: string): boolean { return this.#runtimes.has(id) }

  createSession(): string {
    this.#newCounter += 1
    const id = `new-${this.#newCounter}`
    const descriptor: SeedDescriptor = {
      id,
      title: `New agent session ${this.#newCounter}`,
      age: 'now',
      status: 'idle',
      logicalCount: 0,
      seedOffset: 900 + this.#newCounter,
    }
    this.#register(descriptor, true)
    this.#notifier.notifyNow()
    return id
  }

  dispose(): void {
    for (const execution of this.#executions.values()) execution.dispose()
    for (const runtime of this.#runtimes.values()) runtime.dispose()
    for (const unsub of this.#kernelUnsubs.values()) unsub()
    this.#executions.clear()
    this.#runtimes.clear()
    this.#kernels.clear()
    this.#kernelUnsubs.clear()
  }

  #register(descriptor: SeedDescriptor, prepend = false): void {
    const adapter = new SyntheticHistoryAdapter(descriptor.id, descriptor.logicalCount, descriptor.seedOffset, descriptor.liveTail === true)
    const kernel = new ConversationSessionKernel(descriptor, adapter, descriptor.seedOffset)
    this.#kernels.set(descriptor.id, kernel)
    this.#executions.set(descriptor.id, new SyntheticStreamController(kernel))
    this.#snapshots.set(descriptor.id, defaultSnapshot(descriptor))
    if (prepend) this.#order.unshift(descriptor.id)
    else this.#order.push(descriptor.id)
    this.#summarySignatures.set(descriptor.id, summarySignature(kernel.summary))
    const unsub = kernel.subscribe(() => {
      const next = summarySignature(kernel.summary)
      const previous = this.#summarySignatures.get(kernel.id)
      if (next !== previous) {
        this.#summarySignatures.set(kernel.id, next)
        this.#notifier.markDirty()
      }
    })
    this.#kernelUnsubs.set(descriptor.id, unsub)
  }

  #touch(id: string): void {
    this.#clock += 1
    this.#lastAccess.set(id, this.#clock)
  }

  #prune(): void {
    while (this.#runtimes.size > HOT_SESSION_LIMIT) {
      const candidates = [...this.#runtimes.values()]
        .filter(runtime => runtime.id !== this.#activeSessionId)
        .sort((a, b) => (this.#lastAccess.get(a.id) ?? 0) - (this.#lastAccess.get(b.id) ?? 0))
      const victim = candidates[0]
      if (!victim) break
      this.#snapshots.set(victim.id, victim.snapshot())
      victim.dispose()
      this.#runtimes.delete(victim.id)
      this.#lastAccess.delete(victim.id)
    }
  }
}

function defaultSnapshot(descriptor: ConversationDescriptor): ViewportSnapshot {
  const last = Math.max(0, descriptor.logicalCount - 1)
  return {
    logicalPosition: last,
    anchorUnitId: null,
    anchorOffsetPx: 0,
    followTail: descriptor.status === 'working',
    atVisualBottom: true,
    draftText: '',
  }
}

function clamp(index: number, count: number): number {
  if (count <= 0) return 0
  return Math.max(0, Math.min(count - 1, Math.floor(Number(index) || 0)))
}

function summarySignature(summary: ConversationDescriptor): string {
  return [summary.status, summary.logicalCount, summary.unread ? '1' : '0', summary.queuedPrompts ?? 0, summary.pendingInteraction?.id ?? ''].join(':')
}
