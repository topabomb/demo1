<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import type { RenderUnit } from '../../core/types'
const props = defineProps<{ unit: RenderUnit }>()
const html = computed(() => marked.parse(String(props.unit.payload.markdown ?? ''), { async: false }) as string)
</script>
<template>
  <article class="message-card markdown-card">
    <header><span class="kind-dot markdown-dot" />Markdown · message {{ unit.messageIndex.toLocaleString() }}</header>
    <div class="markdown-body" v-html="html" />
  </article>
</template>
