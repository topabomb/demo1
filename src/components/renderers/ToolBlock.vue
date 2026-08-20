<script setup lang="ts">
import { ref } from 'vue'
import type { RenderUnit } from '../../core/types'
const props = defineProps<{ unit: RenderUnit }>()
const expanded = ref(Number(props.unit.payload.rows ?? 0) < 8)
</script>
<template>
  <article class="message-card tool-card">
    <header>
      <span><span class="kind-dot tool-dot" />Tool · {{ unit.payload.name }}</span>
      <button class="mini" @click="expanded = !expanded">{{ expanded ? 'collapse' : 'expand' }}</button>
    </header>
    <div class="tool-meta"><span :class="['status', unit.payload.status]">{{ unit.payload.status }}</span><span>{{ unit.payload.durationMs }} ms</span></div>
    <div v-if="expanded" class="tool-grid">
      <div v-for="row in Number(unit.payload.rows)" :key="row"><code>field_{{ row }}</code><span>value {{ (unit.messageIndex * row) % 9973 }}</span></div>
    </div>
  </article>
</template>
