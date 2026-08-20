import type { LogicalMessage, RenderUnit } from '../core/types'
import type { Unsubscribe } from './notifier'

export interface ConversationDescriptor {
  id: string
  title: string
  age: string
  status: 'running' | 'completed'
  logicalCount: number
}

/**
 * Layer 1 — backend/protocol boundary.
 * OpenCode, DSH, a remote service, IndexedDB or the synthetic lab implement this
 * contract. Everything above it sees only canonical LogicalMessage values.
 */
export interface ConversationBackend {
  readonly sessionId: string
  readonly count: number
  loadRange(start: number, count: number): readonly LogicalMessage[]
}

/** Backward-compatible name used by the current reference implementation. */
export interface ConversationHistoryAdapter extends ConversationBackend {}

/**
 * Layer 2 — asynchronous execution lifetime.
 * Execution belongs to a session, not a mounted Vue component or viewport. It may
 * keep receiving model/tool events while the reader browses history or another
 * Recent conversation is active.
 */
export interface ConversationExecutionController {
  readonly running: boolean
  start(reset?: boolean): void
  stop(clear?: boolean): void
  setRate(rate: number): void
}

/**
 * Layer 3 — framework-free keyed presentation projection.
 * Membership/order and node revisions are intentionally separate subscriptions:
 * streaming can patch one node without invalidating the list or sibling seats.
 */
export interface ConversationProjectionStore {
  readonly order: readonly string[]
  readonly size: number
  getNode(id: string): RenderUnit | undefined
  subscribeOrder(listener: () => void): Unsubscribe
  subscribeNode(id: string, listener: () => void): Unsubscribe
}

/**
 * Lightweight semantic state that survives viewport unmount and heavyweight
 * runtime eviction. No DOM node, framework object, virtualizer handle or backend
 * protocol object is allowed here.
 */
export interface ViewportSnapshot {
  logicalPosition: number
  anchorUnitId: string | null
  anchorOffsetPx: number
  followTail: boolean
  atVisualBottom: boolean
  draftText: string
}

/** Canonical live event shape after a provider/backend adapter has normalized it. */
export interface StreamDelta {
  sessionId: string
  nodeId: string
  textDelta: string
}
