export type RenderKind =
  | 'text'
  | 'markdown'
  | 'thinking'
  | 'code'
  | 'image'
  | 'html'
  | 'tool'
  | 'diff'

export type LogicalRole = 'user' | 'assistant' | 'tool' | 'system'

/**
 * Backend-neutral canonical timeline item. Adapters for DSH/OpenCode/other runtimes
 * should normalize their native events into this shape before presentation logic.
 */
export interface LogicalMessage {
  id: string
  index: number
  turnId: string
  role: LogicalRole
  kind: RenderKind
  seed: number
  intensity: number
  live?: boolean
  variant?: string
}

/**
 * Presentation-level unit. One backend message may project to many bounded-height
 * RenderUnits. The virtualizer and Vue components never depend on backend messages.
 */
export interface RenderUnit {
  id: string
  messageId: string
  messageIndex: number
  kind: RenderKind
  revision: number
  estimatePx: number
  payload: Record<string, unknown>
}

export interface ConversationSource {
  readonly count: number
  getMessage(index: number): LogicalMessage
  getRange(start: number, count: number): LogicalMessage[]
}

export interface SegmentRange {
  start: number
  end: number
}
