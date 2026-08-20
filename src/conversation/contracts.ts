import type { LogicalMessage } from '../core/types'

export interface ConversationDescriptor {
  id: string
  title: string
  age: string
  status: 'running' | 'completed'
  logicalCount: number
}

/**
 * Backend boundary. OpenCode, DSH, a remote server or the synthetic lab may all
 * implement this contract. Everything above it sees canonical LogicalMessage.
 */
export interface ConversationHistoryAdapter {
  readonly sessionId: string
  readonly count: number
  loadRange(start: number, count: number): readonly LogicalMessage[]
}

/**
 * Lightweight state that survives viewport unmount and heavyweight-runtime LRU
 * eviction. It intentionally stores semantic UI state only, never DOM/virtualizer
 * objects or backend protocol objects.
 */
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
