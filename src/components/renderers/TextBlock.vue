<script setup lang="ts">
import type { RenderUnit } from '../../core/types'
defineProps<{ unit: RenderUnit }>()
</script>
<template>
  <article class="message-card text-card">
    <header><span class="kind-dot text-dot" />Text · message {{ unit.messageIndex.toLocaleString() }}</header>
    <p>{{ unit.payload.text }}</p>
  </article>
</template>
