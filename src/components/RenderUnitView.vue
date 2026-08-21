<script setup lang="ts">
import { computed } from 'vue'
import type { RenderUnit } from '../presentation/render-unit'
import { resolveRenderer } from './renderers/registry'

const props = defineProps<{ unit: RenderUnit }>()
const component = computed(() => resolveRenderer(props.unit.kind))
</script>

<template>
  <component :is="component" :unit="unit" />
</template>
