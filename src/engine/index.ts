/**
 * Stable framework-neutral public surface.
 * Demo fixtures, Vue components and synthetic execution are intentionally excluded.
 */
export {
  block,
  type AppendCanonicalMessage,
  type ArtifactProvenance,
  type AttachmentItem,
  type AttachmentKind,
  type BuiltinToolCategory,
  type ContentBlock,
  type ContentBlockMap,
  type ContentBlockType,
  type LogicalMessage,
  type LogicalRole,
  type ToolCategory,
} from './model/conversation'

export {
  type ConversationBackend,
  type ConversationDescriptor,
  type ConversationExecutionController,
  type ConversationHistoryAdapter,
  type LlmFailure,
  type PendingInteraction,
  type SessionContextStats,
  type SessionStatus,
  type SubmitDisposition,
  type TokenUsage,
  type TurnEndReasonKind,
} from './conversation/contracts'
export {
  ConversationSessionKernel,
  type SessionKernelContentPatch,
  type SessionKernelEvent,
  type SessionKernelEventKind,
} from './conversation/session-kernel'

export {
  ContentProjectorRegistry,
  createDefaultContentProjectors,
  projectMessage,
  projectMessages,
  type ContentProjectionContext,
  type ContentProjector,
} from './presentation/projector-registry'
export { ProjectionEngine, type ProjectionEngineStats } from './presentation/projection-engine'
export { KeyedConversationProjection } from './presentation/keyed-node-store'
export { type ConversationProjectionStore } from './presentation/contracts'
export { type BuiltinRenderKind, type RenderKind, type RenderUnit } from './presentation/render-unit'

export {
  VIEWPORT_POLICY,
  clampLogicalIndex,
  isMessageCommittedVisible,
  messagesAfter,
  remainingToBottom,
  selectCommittedAnchor,
  type CommittedViewportAnchor,
  type PhysicalListPort,
  type ViewportRowSample,
} from './viewport/contracts'
export { type SemanticViewportSnapshot, type SessionViewMemory } from './viewport/state'

export {
  ConversationSessionRuntime,
  SHIFT_MESSAGES,
  WINDOW_MESSAGES,
  type SessionUiSnapshot,
  type ShiftPlan,
} from './runtime/session-runtime'
