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

export interface ViewportSnapshot {
  logicalPosition: number
  anchorUnitId: string | null
  anchorOffsetPx: number
  followTail: boolean
  atVisualBottom: boolean
}

export interface StreamDelta {
  sessionId: string
  nodeId: string
  textDelta: string
}
