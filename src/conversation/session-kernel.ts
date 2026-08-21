import { hash32 } from '../core/prng'
import type { LogicalMessage } from '../core/types'
import type { ConversationDescriptor, ConversationHistoryAdapter, PendingInteraction, SessionStatus } from './contracts'
import { BatchedNotifier, type Unsubscribe } from './notifier'

export type SessionKernelEventKind = 'content' | 'append' | 'status' | 'queue' | 'interaction' | 'foreground'
export interface SessionKernelEvent { kind: SessionKernelEventKind; messageIndex?: number }

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

    if (descriptor.status === 'working' && backend.count > 0) {
      this.#currentAssistantIndex = backend.count - 1
      const tail = backend.loadRange(backend.count - 1, 1)[0]
      if (tail) {
        this.#overrides.set(tail.index, {
          ...tail,
          revision: (tail.revision ?? 0) + 1,
          live: true,
          content: '### Background run\n\nThe agent is continuing work while this session may be off-screen. ',
        })
      }
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
    }
  }

  setForeground(value: boolean): void {
    const changed = this.#foreground !== value || (value && this.#unread)
    this.#foreground = value
    if (value) this.#unread = false
    if (changed) this.#emit({ kind: 'foreground' }, false)
  }

  getMessage(index: number): LogicalMessage {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) {
      throw new RangeError(`message index ${index} outside 0..${this.count - 1}`)
    }
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
      kind: 'markdown',
      seed: hash32(userIndex + this.seedOffset),
      intensity: 3,
      revision: 0,
      content: text,
      variant: 'runtime-user',
    })
    const assistantIndex = this.count
    this.#appended.push({
      id: `${this.id}:m-${assistantIndex}`,
      index: assistantIndex,
      turnId,
      role: 'assistant',
      kind: 'markdown',
      seed: hash32(assistantIndex + this.seedOffset),
      intensity: 5,
      revision: 0,
      content: '',
      live: true,
      variant: 'runtime-assistant',
    })
    this.#currentAssistantIndex = assistantIndex
    this.#status = 'working'
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
    const next = {
      ...current,
      revision: (current.revision ?? 0) + 1,
      content: `${current.content ?? ''}${delta}`,
      live: true,
    }
    if (index < this.backend.count) this.#overrides.set(index, next)
    else this.#appended[index - this.backend.count] = next
    this.streamRenderTicks += 1
    this.#touchUnread()
    this.#emit({ kind: 'content', messageIndex: index })
  }

  completeCurrent(): void {
    const index = this.#currentAssistantIndex
    if (index !== null) {
      const current = this.getMessage(index)
      const next = {
        ...current,
        revision: (current.revision ?? 0) + 1,
        live: false,
        content: (current.content ?? '').trim() || 'Completed.',
      }
      if (index < this.backend.count) this.#overrides.set(index, next)
      else this.#appended[index - this.backend.count] = next
    }
    this.#currentAssistantIndex = null
    this.#status = 'idle'
    this.#touchUnread()
    this.#emit({ kind: 'status', messageIndex: index ?? undefined })
  }

  abortCurrent(): void {
    const index = this.#currentAssistantIndex
    if (index !== null) {
      const current = this.getMessage(index)
      const next = {
        ...current,
        revision: (current.revision ?? 0) + 1,
        live: false,
        content: `${current.content ?? ''}\n\n_Stopped by user._`,
      }
      if (index < this.backend.count) this.#overrides.set(index, next)
      else this.#appended[index - this.backend.count] = next
    }
    this.#currentAssistantIndex = null
    this.#status = 'interrupted'
    this.#queuedPrompts = []
    this.#touchUnread()
    this.#emit({ kind: 'status', messageIndex: index ?? undefined })
  }

  resolveInteraction(approved: boolean): void {
    if (!this.#pendingInteraction) return
    this.#pendingInteraction = null
    this.#status = approved ? 'idle' : 'interrupted'
    this.#touchUnread()
    this.#emit({ kind: 'interaction' })
  }

  setStreamRate(rate: number): void {
    this.streamRate = Math.max(1, Math.floor(rate))
    this.#emit({ kind: 'status' }, false)
  }

  incrementIngress(): void { this.streamIngressTicks += 1 }

  #touchUnread(): void {
    if (!this.#foreground) this.#unread = true
  }

  #emit(event: SessionKernelEvent, markUnread = true): void {
    this.#lastEvent = event
    if (markUnread) this.#touchUnread()
    this.#notifier.markDirty()
  }
}
