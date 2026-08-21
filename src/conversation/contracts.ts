import type { LogicalMessage, RenderUnit } from '../core/types'
import type { Unsubscribe } from './notifier'

/** Live session execution state. Historical turn outcome is deliberately separate. */
export type SessionStatus = 'idle' | 'working' | 'waiting' | 'interrupted'

/** DSH-aligned portable reasons for the most recently settled turn. */
export type TurnEndReasonKind =
  | 'completed'
  | 'aborted'
  | 'blocked'
  | 'error'
  | 'max-tokens'
  | 'interrupted'

export interface LlmFailure {
  message: string
  code: string
  status?: number
  providerRetryAfterMs?: number
  requestId?: string
}

/**
 * Provider-neutral token accounting. The prompt buckets are disjoint:
 * inputTokens is uncached input; cacheReadTokens/cacheWriteTokens are separate.
 */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
}

export interface SessionContextStats {
  projectedTokens: number
  contextWindow: number
}

export interface PendingInteraction {
  id: string
  kind: 'approval' | 'question'
  title: string
  detail: string
  toolName?: string
}

export interface ConversationDescriptor {
  id: string
  title: string
  age: string
  status: SessionStatus
  logicalCount: number
  unread?: boolean
  queuedPrompts?: number
  pendingInteraction?: PendingInteraction | null
  lastTurnReason?: TurnEndReasonKind | null
  lastFailure?: LlmFailure | null
  usage?: Partial<TokenUsage>
  context?: SessionContextStats
  turnCount?: number
  stepCount?: number
}

export interface ConversationBackend {
  readonly sessionId: string
  readonly count: number
  loadRange(start: number, count: number): readonly LogicalMessage[]
}

export interface ConversationHistoryAdapter extends ConversationBackend {}

export type SubmitDisposition = 'started' | 'queued' | 'blocked'

export interface ConversationExecutionController {
  readonly running: boolean
  start(reset?: boolean): void
  stop(clear?: boolean): void
  abort(): void
  submit(prompt: string): SubmitDisposition
  resolveInteraction(approved: boolean): void
  setRate(rate: number): void
}

export interface ConversationProjectionStore {
  readonly order: readonly string[]
  readonly size: number
  getNode(id: string): RenderUnit | undefined
  subscribeOrder(listener: () => void): Unsubscribe
  subscribeNode(id: string, listener: () => void): Unsubscribe
}

export interface ViewportSnapshot {
  logicalPosition: number
  anchorUnitId: string | null
  anchorOffsetPx: number
  followTail: boolean
  atVisualBottom: boolean
  draftText: string
}

export interface StreamDelta {
  sessionId: string
  nodeId: string
  textDelta: string
}
