<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RenderUnit } from '../../core/types'
const props = defineProps<{ unit: RenderUnit }>()
const lines = computed(() => (props.unit.payload.lines as string[] | undefined) ?? [])
const collapsed = ref(lines.value.length > 55)
</script>
<template>
  <article class="message-card diff-card">
    <header>
      <span><span class="kind-dot diff-dot" />Diff · {{ unit.payload.file }}</span>
      <button class="mini" @click="collapsed = !collapsed">{{ collapsed ? 'expand' : 'collapse' }}</button>
    </header>
    <pre :class="{ collapsed }"><span v-for="(line, i) in lines" :key="i" :class="line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : ''">{{ line }}\n</span></pre>
  </article>
</template>
