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

export interface LogicalMessage {
  id: string
  index: number
  turnId: string
  role: LogicalRole
  kind: RenderKind
  seed: number
  intensity: number
  revision?: number
  content?: string
  live?: boolean
  variant?: string
}

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
