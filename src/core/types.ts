export type BuiltinRenderKind =
  | 'text'
  | 'markdown'
  | 'thinking'
  | 'code'
  | 'image'
  | 'html'
  | 'tool'
  | 'diff'
  | 'unknown'

/** Renderer IDs are intentionally open; product packages may register more. */
export type RenderKind = BuiltinRenderKind | (string & {})

export type LogicalRole = 'user' | 'assistant' | 'tool' | 'system'

export interface LogicalMessage {
  id: string
  index: number
  turnId: string
  role: LogicalRole
  /** Legacy synthetic hint. New adapters should prefer `blocks`. */
  kind?: RenderKind
  blocks?: readonly import('../presentation/content-model').ContentBlock[]
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
