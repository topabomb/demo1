<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import type { ConversationSessionRuntime } from '../conversation/session-runtime'
import RenderUnitView from './RenderUnitView.vue'

const props = defineProps<{ runtime: ConversationSessionRuntime; nodeId: string }>()
const unit = shallowRef(props.runtime.projection.getNode(props.nodeId))
let unsubscribe: (() => void) | null = null

function bind(runtime: ConversationSessionRuntime, nodeId: string): void {
  unsubscribe?.()
  unit.value = runtime.projection.getNode(nodeId)
  unsubscribe = runtime.projection.subscribeNode(nodeId, () => {
    unit.value = runtime.projection.getNode(nodeId)
  })
}

watch(() => [props.runtime, props.nodeId] as const, ([runtime, nodeId]) => bind(runtime, nodeId), { immediate: true })
onBeforeUnmount(() => unsubscribe?.())
</script>

<template>
  <div v-if="unit" class="node-seat">
    <RenderUnitView :unit="unit" />
  </div>
</template>
