import { hash32 } from '../core/prng'
import { block, type AppendCanonicalMessage, type ContentBlock, type LogicalMessage } from '../model/conversation'
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
import { BatchedNotifier, type Unsubscribe } from './notifier'

export type SessionKernelEventKind = 'content' | 'append' | 'status' | 'queue' | 'interaction' | 'foreground' | 'usage'
export interface SessionKernelContentPatch { kind: 'append-markdown'; blockId: string; delta: string }
export interface SessionKernelEvent {
  kind: SessionKernelEventKind
  messageIndex?: number
  contentPatch?: SessionKernelContentPatch
}

/**
 * Lightweight durable session state. It owns canonical appended turns, execution
 * semantics and whole-session projections, but never owns Vue, DOM, RenderUnits or
 * a virtualizer. Production implementations can persist/replace its history port.
 */
export class ConversationSessionKernel {
  readonly id: string
  readonly title: string
  readonly age: string
  readonly backend: ConversationHistoryAdapter
  readonly seedOffset: number

  #appended: LogicalMessage[] = []
  #overrides = new Map<number, LogicalMessage>()
  #status: SessionStatus
  #pendingInteraction: PendingInteraction | null
  #queuedPrompts: string[] = []
  #foreground = false
  #unread = false
  #notifier = new BatchedNotifier()
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

  streamRate = 20
  streamIngressTicks = 0
  streamRenderTicks = 0

  constructor(descriptor: ConversationDescriptor, backend: ConversationHistoryAdapter, seedOffset = 0) {
    this.id = descriptor.id
    this.title = descriptor.title
    this.age = descriptor.age
    this.backend = backend
    this.seedOffset = seedOffset
    this.#status = descriptor.status
    this.#pendingInteraction = descriptor.pendingInteraction ?? null
    this.#lastTurnReason = descriptor.lastTurnReason ?? defaultTurnReason(descriptor.status)
    this.#lastFailure = descriptor.lastFailure ?? null
    this.#usage = normalizeTokenUsage(descriptor.usage)
    this.#context = descriptor.context
      ? { ...descriptor.context }
      : { projectedTokens: Math.min(96_000, Math.max(0, Math.round(backend.count / 20))), contextWindow: 128_000 }
    this.#turnCount = Math.max(0, Math.floor(descriptor.turnCount ?? Math.max(1, Math.round(backend.count / 12))))
    this.#stepCount = Math.max(this.#turnCount, Math.floor(descriptor.stepCount ?? this.#turnCount * 2))

    if (descriptor.status === 'working' && backend.count > 0) {
      this.#currentAssistantIndex = backend.count - 1
      this.#lastTurnReason = null
      this.#runStartedAt = now()
      const tail = backend.loadRange(backend.count - 1, 1)[0]
      if (tail) this.#overrides.set(tail.index, replaceMarkdownContent(
        tail,
        '### Background run\n\nThe agent is continuing work while this session may be off-screen. ',
        true,
      ))
    }
  }

  subscribe(listener: () => void): Unsubscribe { return this.#notifier.subscribe(listener) }
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
      age: this.age,
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

  /** Canonical ingestion seam. Fixtures and real adapters use the same path. */
  appendCanonicalMessages(entries: readonly AppendCanonicalMessage[]): readonly number[] {
    if (entries.length === 0) return []
    const indexes: number[] = []
    const turns = new Set<string>()
    for (const entry of entries) {
      const index = this.count
      indexes.push(index)
      turns.add(entry.turnId)
      this.#appended.push({
        id: `${this.id}:m-${index}`,
        index,
        turnId: entry.turnId,
        role: entry.role,
        blocks: cloneBlocks(entry.blocks),
        seed: hash32(index + this.seedOffset),
        intensity: 5,
        revision: 0,
        live: entry.live,
        variant: entry.variant,
      })
    }
    this.#turnCount += turns.size
    this.#stepCount += entries.length
    this.#touchUnread()
    this.#emit({ kind: 'append', messageIndex: indexes[indexes.length - 1] })
    return indexes
  }

  beginTurn(prompt: string): number | null {
    const text = prompt.trim()
    if (!text || this.#pendingInteraction) return null
    const userIndex = this.count
    const turnId = `${this.id}:runtime-turn-${userIndex}`
    this.#appended.push({
      id: `${this.id}:m-${userIndex}`,
      index: userIndex,
      turnId,
      role: 'user',
      blocks: [block('prompt', 'markdown', { markdown: text })],
      seed: hash32(userIndex + this.seedOffset),
      intensity: 3,
      revision: 0,
      variant: 'runtime-user',
    })
    const assistantIndex = this.count
    this.#appended.push({
      id: `${this.id}:m-${assistantIndex}`,
      index: assistantIndex,
      turnId,
      role: 'assistant',
      blocks: [block('answer', 'markdown', { markdown: '' })],
      seed: hash32(assistantIndex + this.seedOffset),
      intensity: 5,
      revision: 0,
      live: true,
      variant: 'runtime-assistant',
    })
    this.#currentAssistantIndex = assistantIndex
    this.#status = 'working'
    this.#lastTurnReason = null
    this.#lastFailure = null
    this.#turnCount += 1
    this.#stepCount += 1
    this.#accountPrompt(text)
    this.#runStartedAt = now()
    this.#firstOutputAt = 0
    this.streamIngressTicks = 0
    this.streamRenderTicks = 0
    this.#touchUnread()
    this.#emit({ kind: 'append', messageIndex: assistantIndex })
    return assistantIndex
  }

  enqueue(prompt: string): boolean {
    const text = prompt.trim()
    if (!text || this.#pendingInteraction) return false
    this.#queuedPrompts.push(text)
    this.#touchUnread()
    this.#emit({ kind: 'queue' })
    return true
  }

  dequeue(): string | null {
    const next = this.#queuedPrompts.shift() ?? null
    if (next !== null) this.#emit({ kind: 'queue' })
    return next
  }

  appendAssistantDelta(delta: string): void {
    const index = this.#currentAssistantIndex
    if (index === null || !delta) return
    const current = this.getMessage(index)
    const patched = appendMarkdownContent(current, delta)
    this.#writeMessage(index, patched.message)

    const output = estimateTokens(delta)
    this.#usage.outputTokens += output
    if (this.streamIngressTicks % 5 === 0) this.#usage.reasoningTokens += Math.max(1, Math.round(output * 0.18))
    this.#context.projectedTokens = Math.min(this.#context.contextWindow, this.#context.projectedTokens + output)
    if (this.#firstOutputAt === 0) { this.#firstOutputAt = now(); this.#lastTtftMs = Math.max(0, this.#firstOutputAt - this.#runStartedAt) }
    this.streamRenderTicks += 1
    this.#touchUnread()
    this.#emit({
      kind: 'content',
      messageIndex: index,
      contentPatch: { kind: 'append-markdown', blockId: patched.blockId, delta },
    })
  }

  completeCurrent(): void {
    const index = this.#currentAssistantIndex
    if (index !== null) {
      const current = this.getMessage(index)
      const text = markdownText(current).trim()
      const next = text ? { ...current, revision: (current.revision ?? 0) + 1, live: false } : replaceMarkdownContent(current, 'Completed.', false)
      this.#writeMessage(index, next)
    }
    this.#finishRun('completed', null)
    this.#emit({ kind: 'status', messageIndex: index ?? undefined })
  }

  abortCurrent(): void {
    const index = this.#currentAssistantIndex
    if (index !== null) {
      const current = this.getMessage(index)
      const patched = appendMarkdownContent(current, '\n\n_Stopped by user._')
      this.#writeMessage(index, { ...patched.message, live: false })
    }
    this.#status = 'interrupted'
    this.#queuedPrompts = []
    this.#finishRun('aborted', null, false)
    this.#emit({ kind: 'status', messageIndex: index ?? undefined })
  }

  failCurrent(failure: LlmFailure): void {
    const index = this.#currentAssistantIndex
    if (index !== null) {
      const current = this.getMessage(index)
      this.#writeMessage(index, { ...current, revision: (current.revision ?? 0) + 1, live: false })
    }
    this.#finishRun('error', failure)
    this.#emit({ kind: 'status', messageIndex: index ?? undefined })
  }

  resolveInteraction(approved: boolean): void {
    if (!this.#pendingInteraction) return
    this.#pendingInteraction = null
    this.#status = approved ? 'idle' : 'interrupted'
    this.#lastTurnReason = approved ? 'completed' : 'aborted'
    this.#lastFailure = null
    this.#touchUnread()
    this.#emit({ kind: 'interaction' })
  }

  setStreamRate(rate: number): void { this.streamRate = Math.max(1, Math.floor(rate)); this.#emit({ kind: 'status' }, false) }
  incrementIngress(): void { this.streamIngressTicks += 1 }

  #writeMessage(index: number, message: LogicalMessage): void {
    if (index < this.backend.count) this.#overrides.set(index, message)
    else this.#appended[index - this.backend.count] = message
  }

  #accountPrompt(text: string): void {
    const promptTokens = Math.max(1, estimateTokens(text))
    const reusable = Math.min(this.#context.projectedTokens, Math.round(this.#context.projectedTokens * 0.82))
    const uncached = Math.max(promptTokens + 64, Math.round(this.#context.projectedTokens * 0.03))
    const cacheWrite = Math.max(0, Math.round(uncached * 0.12))
    this.#usage.inputTokens += uncached
    this.#usage.cacheReadTokens += reusable
    this.#usage.cacheWriteTokens += cacheWrite
    this.#context.projectedTokens = Math.min(this.#context.contextWindow, this.#context.projectedTokens + promptTokens + 32)
  }

  #finishRun(reason: TurnEndReasonKind, failure: LlmFailure | null, setIdle = true): void {
    if (setIdle) this.#status = 'idle'
    this.#lastTurnReason = reason
    this.#lastFailure = failure ? { ...failure } : null
    this.#currentAssistantIndex = null
    if (this.#runStartedAt > 0) this.#lastTurnDurationMs = Math.max(0, now() - this.#runStartedAt)
    this.#runStartedAt = 0
    this.#firstOutputAt = 0
    this.#touchUnread()
  }

  #touchUnread(): void { if (!this.#foreground) this.#unread = true }
  #emit(event: SessionKernelEvent, markUnread = true): void { this.#lastEvent = event; if (markUnread) this.#touchUnread(); this.#notifier.markDirty() }
}

function cloneBlocks(blocks: readonly ContentBlock[]): ContentBlock[] {
  return blocks.map(contentBlock => ({ ...contentBlock, data: { ...contentBlock.data } })) as ContentBlock[]
}

function appendMarkdownContent(message: LogicalMessage, delta: string): { message: LogicalMessage; blockId: string } {
  const blocks = canonicalBlocks(message)
  let targetIndex = -1
  for (let i = blocks.length - 1; i >= 0; i -= 1) if (blocks[i]?.type === 'markdown') { targetIndex = i; break }
  if (targetIndex < 0) {
    const created = block(message.role === 'user' ? 'prompt' : 'answer', 'markdown', { markdown: delta }, 1)
    return {
      blockId: created.id,
      message: { ...message, blocks: [...blocks, created], content: undefined, revision: (message.revision ?? 0) + 1, live: true },
    }
  }

  const current = blocks[targetIndex] as ContentBlock<'markdown'>
  const nextBlock = block(current.id, 'markdown', { ...current.data, markdown: `${current.data.markdown}${delta}` }, (current.revision ?? 0) + 1)
  blocks[targetIndex] = nextBlock
  return {
    blockId: current.id,
    message: { ...message, blocks, content: undefined, revision: (message.revision ?? 0) + 1, live: true },
  }
}

function replaceMarkdownContent(message: LogicalMessage, markdown: string, live: boolean): LogicalMessage {
  const blocks = canonicalBlocks(message)
  let targetIndex = -1
  for (let i = blocks.length - 1; i >= 0; i -= 1) if (blocks[i]?.type === 'markdown') { targetIndex = i; break }
  const id = targetIndex >= 0 ? blocks[targetIndex]!.id : (message.role === 'user' ? 'prompt' : 'answer')
  const previousRevision = targetIndex >= 0 ? blocks[targetIndex]!.revision ?? 0 : 0
  const nextBlock = block(id, 'markdown', { markdown }, previousRevision + 1)
  if (targetIndex >= 0) blocks[targetIndex] = nextBlock
  else blocks.push(nextBlock)
  return { ...message, blocks, content: undefined, revision: (message.revision ?? 0) + 1, live }
}

function canonicalBlocks(message: LogicalMessage): ContentBlock[] {
  if (message.blocks?.length) return cloneBlocks(message.blocks)
  if (message.content !== undefined) return [block(message.role === 'user' ? 'prompt' : 'answer', 'markdown', { markdown: message.content }, message.revision ?? 0)]
  return []
}

function markdownText(message: LogicalMessage): string {
  if (message.blocks?.length) {
    for (let i = message.blocks.length - 1; i >= 0; i -= 1) {
      const contentBlock = message.blocks[i]
      if (contentBlock?.type === 'markdown') return contentBlock.data.markdown
    }
  }
  return message.content ?? ''
}

function estimateTokens(text: string): number { return Math.max(1, Math.ceil(text.length / 4)) }
function now(): number { return typeof performance !== 'undefined' ? performance.now() : Date.now() }
