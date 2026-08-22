import { BatchedNotifier, type Unsubscribe } from '../core/notifier'
import type { AppendCanonicalMessage, LogicalMessage } from '../model/conversation'
import { cloneBlocks } from '../model/message-mutations'
import type {
  ConversationDescriptor,
  ConversationHistoryAdapter,
  LlmFailure,
  PendingInteraction,
  SessionContextStats,
  SessionStatus,
  TokenUsage,
  TurnEndReasonKind,
} from './contracts'
import { defaultTurnReason, normalizeTokenUsage } from './session-semantics'

export type SessionKernelEventKind = 'content' | 'append' | 'status' | 'queue' | 'interaction' | 'foreground' | 'usage'
export type SessionKernelContentPatch =
  | { kind: 'append-markdown'; blockId: string; delta: string }
  | { kind: 'append-reasoning'; blockId: string; delta: string }
export interface SessionKernelEvent {
  kind: SessionKernelEventKind
  messageIndex?: number
  contentPatch?: SessionKernelContentPatch
}

/**
 * Canonical session truth.
 *
 * This kernel stores normalized messages and lifecycle/accounting facts but never
 * invents provider output, default assistant blocks, token estimates or product copy.
 * Execution adapters own those decisions and publish them through these semantic APIs.
 */
export class ConversationSessionKernel {
  readonly id: string
  readonly title: string
  readonly backend: ConversationHistoryAdapter

  #appended: LogicalMessage[] = []
  #overrides = new Map<number, LogicalMessage>()
  #status: SessionStatus
  #pendingInteraction: PendingInteraction | null
  #queuedPrompts: string[] = []
  #foreground = false
  #unread = false
  #notifier = new BatchedNotifier()
  #eventListeners = new Set<(event: SessionKernelEvent) => void>()
  #lastEvent: SessionKernelEvent = { kind: 'status' }
  #currentAssistantIndex: number | null = null
  #lastTurnReason: TurnEndReasonKind | null
  #lastFailure: LlmFailure | null
  #usage: TokenUsage
  #context: SessionContextStats
  #turnCount: number
  #stepCount: number
  #runStartedAt = 0
  #firstOutputAt = 0
  #lastTurnDurationMs = 0
  #lastTtftMs = 0

  constructor(descriptor: ConversationDescriptor, backend: ConversationHistoryAdapter) {
    this.id = descriptor.id
    this.title = descriptor.title
    this.backend = backend
    this.#status = descriptor.status
    this.#pendingInteraction = descriptor.pendingInteraction ?? null
    this.#lastTurnReason = descriptor.lastTurnReason ?? defaultTurnReason(descriptor.status)
    this.#lastFailure = descriptor.lastFailure ?? null
    this.#usage = normalizeTokenUsage(descriptor.usage)
    this.#context = descriptor.context
      ? { ...descriptor.context }
      : { projectedTokens: 0, contextWindow: 128_000 }
    this.#turnCount = Math.max(0, Math.floor(descriptor.turnCount ?? 0))
    this.#stepCount = Math.max(this.#turnCount, Math.floor(descriptor.stepCount ?? this.#turnCount))

    if (descriptor.status === 'working' && backend.count > 0) {
      this.#currentAssistantIndex = backend.count - 1
      this.#lastTurnReason = null
      this.#runStartedAt = now()
    }
  }

  subscribe(listener: () => void): Unsubscribe { return this.#notifier.subscribe(listener) }
  subscribeEvents(listener: (event: SessionKernelEvent) => void): Unsubscribe {
    this.#eventListeners.add(listener)
    return () => this.#eventListeners.delete(listener)
  }

  get lastEvent(): SessionKernelEvent { return this.#lastEvent }
  get status(): SessionStatus { return this.#status }
  get pendingInteraction(): PendingInteraction | null { return this.#pendingInteraction }
  get queuedPrompts(): number { return this.#queuedPrompts.length }
  get currentAssistantIndex(): number | null { return this.#currentAssistantIndex }
  get count(): number { return this.backend.count + this.#appended.length }
  get unread(): boolean { return this.#unread }
  get foreground(): boolean { return this.#foreground }
  get lastTurnReason(): TurnEndReasonKind | null { return this.#lastTurnReason }
  get lastFailure(): LlmFailure | null { return this.#lastFailure ? { ...this.#lastFailure } : null }
  get usage(): TokenUsage { return { ...this.#usage } }
  get context(): SessionContextStats { return { ...this.#context } }
  get turnCount(): number { return this.#turnCount }
  get stepCount(): number { return this.#stepCount }
  get lastTurnDurationMs(): number { return this.#lastTurnDurationMs }
  get lastTtftMs(): number { return this.#lastTtftMs }

  get summary(): ConversationDescriptor {
    return {
      id: this.id,
      title: this.title,
      status: this.#status,
      logicalCount: this.count,
      unread: this.#unread,
      queuedPrompts: this.queuedPrompts,
      pendingInteraction: this.#pendingInteraction,
      lastTurnReason: this.#lastTurnReason,
      lastFailure: this.#lastFailure,
      usage: this.usage,
      context: this.context,
      turnCount: this.#turnCount,
      stepCount: this.#stepCount,
    }
  }

  setForeground(value: boolean): void {
    const changed = this.#foreground !== value || (value && this.#unread)
    this.#foreground = value
    if (value) this.#unread = false
    if (changed) this.#emit({ kind: 'foreground' }, false)
  }

  getMessage(index: number): LogicalMessage {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) throw new RangeError(`message index ${index} outside 0..${this.count - 1}`)
    const override = this.#overrides.get(index)
    if (override) return override
    if (index < this.backend.count) {
      const found = this.backend.loadRange(index, 1)[0]
      if (!found) throw new RangeError(`backend message ${index} missing`)
      return found
    }
    const message = this.#appended[index - this.backend.count]
    if (!message) throw new RangeError(`appended message ${index} missing`)
    return message
  }

  loadRange(start: number, count: number): readonly LogicalMessage[] {
    const safeStart = Math.max(0, Math.min(this.count, Math.floor(start)))
    const safeEnd = Math.max(safeStart, Math.min(this.count, safeStart + Math.max(0, Math.floor(count))))
    const out = new Array<LogicalMessage>(safeEnd - safeStart)
    for (let index = safeStart; index < safeEnd; index += 1) out[index - safeStart] = this.getMessage(index)
    return out
  }

  appendCanonicalMessages(entries: readonly AppendCanonicalMessage[]): readonly number[] {
    if (entries.length === 0) return []
    const indexes: number[] = []
    const turns = new Set<string>()
    const steps = new Set<string>()
    for (const entry of entries) {
      const index = this.count
      indexes.push(index)
      turns.add(entry.turnId)
      if (entry.stepId) steps.add(entry.stepId)
      this.#appended.push({
        id: `${this.id}:m-${index}`,
        index,
        turnId: entry.turnId,
        stepId: entry.stepId,
        role: entry.role,
        blocks: cloneBlocks(entry.blocks),
        revision: 0,
        live: entry.live,
      })
    }
    this.#turnCount += turns.size
    this.#stepCount += steps.size > 0 ? steps.size : entries.length
    this.#emit({ kind: 'append', messageIndex: indexes[indexes.length - 1] })
    return indexes
  }

  /** Replace normalized content while preserving producer-owned message identity. */
  replaceCanonicalMessage(index: number, message: LogicalMessage, contentPatch?: SessionKernelContentPatch): void {
    const current = this.getMessage(index)
    if (
      message.index !== index ||
      message.id !== current.id ||
      message.turnId !== current.turnId ||
      message.stepId !== current.stepId ||
      message.role !== current.role
    ) throw new Error(`canonical identity changed for message ${index}`)

    // Message revision is Kernel-owned mutation identity. Providers may supply a
    // newer revision, but a replacement can never reuse the currently committed
    // revision because presentation caches key their rebuildable work by it.
    const revision = Math.max((current.revision ?? 0) + 1, message.revision ?? 0)
    this.#writeMessage(index, { ...message, revision, blocks: cloneBlocks(message.blocks) })
    if (contentPatch) this.#recordFirstOutput()
    this.#emit({ kind: 'content', messageIndex: index, contentPatch })
  }

  /** Begin provider/runtime execution after the adapter has appended any new canonical records. */
  startExecution(currentAssistantIndex: number | null = null): boolean {
    if (this.#pendingInteraction) return false
    if (currentAssistantIndex !== null) this.getMessage(currentAssistantIndex)
    this.#currentAssistantIndex = currentAssistantIndex
    this.#status = 'working'
    this.#lastTurnReason = null
    this.#lastFailure = null
    this.#runStartedAt = now()
    this.#firstOutputAt = 0
    this.#emit({ kind: 'status', messageIndex: currentAssistantIndex ?? undefined })
    return true
  }

  /** Finish execution without inventing any content. */
  finishExecution(reason: TurnEndReasonKind, failure: LlmFailure | null = null): void {
    const index = this.#currentAssistantIndex
    this.#status = reason === 'blocked' ? 'waiting' : reason === 'aborted' || reason === 'interrupted' ? 'interrupted' : 'idle'
    this.#lastTurnReason = reason
    this.#lastFailure = failure ? { ...failure } : null
    this.#currentAssistantIndex = null
    if (this.#runStartedAt > 0) this.#lastTurnDurationMs = Math.max(0, now() - this.#runStartedAt)
    this.#runStartedAt = 0
    this.#firstOutputAt = 0
    this.#emit({ kind: 'status', messageIndex: index ?? undefined })
  }

  /** Store provider-normalized accounting; the Engine never estimates billing/cache semantics. */
  setAccounting(usage: Partial<TokenUsage>, context: SessionContextStats = this.#context): void {
    this.#usage = normalizeTokenUsage(usage)
    this.#context = {
      projectedTokens: Math.max(0, Math.floor(context.projectedTokens)),
      contextWindow: Math.max(1, Math.floor(context.contextWindow)),
    }
    this.#emit({ kind: 'usage' })
  }

  enqueue(prompt: string): boolean {
    const text = prompt.trim()
    if (!text || this.#pendingInteraction) return false
    this.#queuedPrompts.push(text)
    this.#emit({ kind: 'queue' })
    return true
  }

  dequeue(): string | null {
    const next = this.#queuedPrompts.shift() ?? null
    if (next !== null) this.#emit({ kind: 'queue' })
    return next
  }

  clearQueue(): void {
    if (this.#queuedPrompts.length === 0) return
    this.#queuedPrompts = []
    this.#emit({ kind: 'queue' })
  }

  resolveInteraction(approved: boolean): void {
    if (!this.#pendingInteraction) return
    this.#pendingInteraction = null
    this.#status = approved ? 'idle' : 'interrupted'
    this.#lastTurnReason = approved ? 'completed' : 'aborted'
    this.#lastFailure = null
    this.#emit({ kind: 'interaction' })
  }

  #writeMessage(index: number, message: LogicalMessage): void {
    if (index < this.backend.count) this.#overrides.set(index, message)
    else this.#appended[index - this.backend.count] = message
  }

  #recordFirstOutput(): void {
    if (this.#firstOutputAt !== 0 || this.#runStartedAt === 0) return
    this.#firstOutputAt = now()
    this.#lastTtftMs = Math.max(0, this.#firstOutputAt - this.#runStartedAt)
  }

  #touchUnread(): void { if (!this.#foreground) this.#unread = true }
  #emit(event: SessionKernelEvent, markUnread = true): void {
    this.#lastEvent = event
    if (markUnread) this.#touchUnread()
    for (const listener of this.#eventListeners) listener(event)
    this.#notifier.markDirty()
  }
}

function now(): number { return typeof performance !== 'undefined' ? performance.now() : Date.now() }
