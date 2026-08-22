<script setup lang="ts">
import { computed } from 'vue'
import type { RenderUnit } from '../presentation/render-unit'
import { resolveRenderer, type RendererResolver } from './renderers/registry'

const props = defineProps<{ unit: RenderUnit; renderers?: RendererResolver }>()
const component = computed(() => props.renderers?.resolve(props.unit.kind) ?? resolveRenderer(props.unit.kind))
</script>

<template>
  <component :is="component" :unit="unit" />
</template>
