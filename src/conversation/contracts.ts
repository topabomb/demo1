import type { LogicalMessage } from '../model/conversation'
import type { RenderUnit } from '../presentation/render-unit'
import type { Unsubscribe } from './notifier'

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

/** Execution port; the synthetic controller is only the demo implementation. */
export interface ConversationExecutionController {
  readonly running: boolean
  start(reset?: boolean): void
  stop(clear?: boolean): void
  abort(): void
  submit(prompt: string): SubmitDisposition
  resolveInteraction(approved: boolean): void
  setRate(rate: number): void
}

/** Rebuildable keyed presentation store. */
export interface ConversationProjectionStore {
  readonly order: readonly string[]
  readonly size: number
  getNode(id: string): RenderUnit | undefined
  subscribeOrder(listener: () => void): Unsubscribe
  subscribeNode(id: string, listener: () => void): Unsubscribe
}

/** Framework-neutral semantic viewport checkpoint. No draft/product state belongs here. */
export interface SemanticViewportSnapshot {
  logicalPosition: number
  anchorUnitId: string | null
  anchorOffsetPx: number
  followTail: boolean
  atVisualBottom: boolean
}

/**
 * Small session-local interaction memory persisted across Recent switching/hot-runtime
 * eviction. It is not canonical history and may use a different persistence policy.
 */
export interface SessionViewMemory extends SemanticViewportSnapshot {
  draftText: string
}

/** @deprecated compatibility name; use SemanticViewportSnapshot or SessionViewMemory explicitly. */
export type ViewportSnapshot = SessionViewMemory

export interface StreamDelta {
  sessionId: string
  nodeId: string
  textDelta: string
}
