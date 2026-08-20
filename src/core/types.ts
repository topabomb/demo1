export type RenderKind = 'text' | 'markdown' | 'code' | 'image' | 'html' | 'tool' | 'diff'

export interface LogicalMessage {
  id: string
  index: number
  role: 'user' | 'assistant' | 'tool'
  kind: RenderKind
  seed: number
  intensity: number
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
