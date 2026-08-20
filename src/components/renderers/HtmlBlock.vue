<script setup lang="ts">
import type { RenderUnit } from '../../core/types'
defineProps<{ unit: RenderUnit }>()
</script>
<template>
  <article class="message-card html-card">
    <header><span class="kind-dot html-dot" />HTML · message {{ unit.messageIndex.toLocaleString() }}</header>
    <!-- Synthetic trusted benchmark fixture only; real adapters must sanitize untrusted HTML. -->
    <div v-html="String(unit.payload.html ?? '')" />
  </article>
</template>
