<script setup lang="ts">
import { computed } from 'vue'
import type { RenderUnit } from '../../presentation/render-unit'
import { useFoldState } from './fold-state'

const props = defineProps<{ unit: RenderUnit }>()
const lines = computed(() => (props.unit.payload.lines as string[] | undefined) ?? [])
const open = useFoldState(props.unit.id, Boolean(props.unit.payload.defaultOpen))
const visibleLines = computed(() => open.value || lines.value.length <= 30 ? lines.value : lines.value.slice(0, 28))
</script>

<template>
  <article class="message-card diff-card" data-testid="diff-block">
    <header class="compact-kind-head">
      <span><span class="kind-dot diff-dot" />Diff · {{ unit.payload.file }}</span>
      <span class="head-actions">
        <small>{{ lines.length }} lines</small>
        <button v-if="lines.length > 30" class="mini" type="button" @click="open = !open">{{ open ? 'collapse' : 'expand' }}</button>
      </span>
    </header>
    <pre><span v-for="(line, i) in visibleLines" :key="i" :class="line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : ''">{{ line }}\n</span><span v-if="!open && lines.length > visibleLines.length" class="diff-ellipsis">… {{ lines.length - visibleLines.length }} lines hidden\n</span></pre>
  </article>
</template>
