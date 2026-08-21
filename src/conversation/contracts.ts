import type { LogicalMessage, RenderUnit } from '../core/types'
import type { Unsubscribe } from './notifier'

export type SessionStatus = 'idle' | 'working' | 'waiting' | 'interrupted'

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
