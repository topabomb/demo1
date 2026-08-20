<script setup lang="ts">
import { computed } from 'vue'
import type { RenderUnit } from '../../core/types'

const props = defineProps<{ unit: RenderUnit }>()
const role = computed(() => String(props.unit.payload.role ?? 'assistant'))
</script>

<template>
  <article class="message-card text-card" :class="`role-${role}`">
    <header class="message-author">
      <span class="author-mark">{{ role === 'user' ? 'U' : '✦' }}</span>
      <span>{{ role === 'user' ? 'You' : 'Agent' }}</span>
      <small>message {{ unit.messageIndex.toLocaleString() }}</small>
    </header>
    <p>{{ unit.payload.text }}</p>
  </article>
</template>
