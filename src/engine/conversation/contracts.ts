import type { LogicalMessage } from '../model/conversation'

/** Live execution state. Historical Turn outcome is deliberately separate. */
export type SessionStatus = 'idle' | 'working' | 'waiting' | 'interrupted'

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

/** Provider-neutral token accounting. Prompt buckets are disjoint. */
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

/** Cold-history read port. A production adapter may page from DB/network. */
export interface ConversationBackend {
  readonly sessionId: string
  readonly count: number
  loadRange(start: number, count: number): readonly LogicalMessage[]
}
export interface ConversationHistoryAdapter extends ConversationBackend {}

export type SubmitDisposition = 'started' | 'queued' | 'blocked'

/** Execution port. Provider/runtime-specific drivers implement this interface outside the session kernel. */
export interface ConversationExecutionController {
  readonly running: boolean
  start(reset?: boolean): void
  stop(clear?: boolean): void
  abort(): void
  submit(prompt: string): SubmitDisposition
  resolveInteraction(approved: boolean): void
  setRate(rate: number): void
  dispose?(): void
}

export interface StreamDelta {
  sessionId: string
  nodeId: string
  textDelta: string
}
