/** Vue adapter surface. Framework-neutral engine APIs live in `../index.ts`. */
export { default as ConversationViewport } from './ConversationViewport.vue'
export { default as ConversationNodeSeat } from './ConversationNodeSeat.vue'
export { default as RenderUnitView } from './RenderUnitView.vue'
export { registerRenderer, registeredRendererIds, resolveRenderer } from './renderers/registry'
