/** Vue adapter surface. Framework-neutral engine APIs live in `engine/`. */
export { default as ConversationViewport } from '../components/ConversationViewport.vue'
export { default as ConversationNodeSeat } from '../components/ConversationNodeSeat.vue'
export { default as RenderUnitView } from '../components/RenderUnitView.vue'
export { registerRenderer, registeredRendererIds, resolveRenderer } from '../components/renderers/registry'
