<script setup lang="ts">
import { computed } from 'vue'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import type { RenderUnit } from '../../core/types'

const props = defineProps<{ unit: RenderUnit }>()
const isFirst = computed(() => Number(props.unit.payload.partIndex ?? 0) === 0)
const isLast = computed(() => Number(props.unit.payload.partIndex ?? 0) >= Number(props.unit.payload.partCount ?? 1) - 1)
const role = computed(() => String(props.unit.payload.role ?? 'assistant'))
const live = computed(() => props.unit.payload.live === true)
const html = computed(() => {
  const raw = marked.parse(String(props.unit.payload.markdown ?? ''), { async: false }) as string
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
})
</script>

<template>
  <article
    class="message-card markdown-card"
    :class="[`role-${role}`, { continuation: !isFirst, 'has-next-part': !isLast, live }]"
    :data-live-unit="live ? 'true' : undefined"
  >
    <header v-if="isFirst" class="message-author">
      <span class="author-mark">{{ role === 'user' ? 'U' : '✦' }}</span>
      <span>{{ role === 'user' ? 'You' : 'Agent' }}</span>
      <span v-if="live" class="streaming-label"><i /> streaming</span>
      <small>message {{ unit.messageIndex.toLocaleString() }}</small>
    </header>
    <div class="markdown-body" v-html="html" />
  </article>
</template>
