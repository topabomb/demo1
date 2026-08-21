import type { LogicalMessage } from '../model/conversation'

/**
 * Compatibility barrel for the original demo layout.
 * New framework code should import canonical model types from `model/` and
 * presentation node types from `presentation/` so dependency direction stays explicit.
 */
export type { ContentBlock, ContentBlockMap, ContentBlockType, LogicalMessage, LogicalRole } from '../model/conversation'
export type { BuiltinRenderKind, RenderKind, RenderUnit } from '../presentation/render-unit'

export interface ConversationSource {
  readonly count: number
  getMessage(index: number): LogicalMessage
  getRange(start: number, count: number): LogicalMessage[]
}

export interface SegmentRange {
  start: number
  end: number
}
