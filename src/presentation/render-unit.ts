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

/** Renderer IDs stay open so product packages can register additional presentation kinds. */
export type RenderKind = BuiltinRenderKind | (string & {})

/** Rebuildable presentation node. It is not canonical conversation state. */
export interface RenderUnit {
  id: string
  messageId: string
  messageIndex: number
  kind: RenderKind
  revision: number
  estimatePx: number
  payload: Record<string, unknown>
}
