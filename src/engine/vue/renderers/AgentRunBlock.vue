<script setup lang="ts">
import { computed } from 'vue'
import type { RenderUnit } from '../../presentation/render-unit'

const props = defineProps<{ unit: RenderUnit }>()
const status = computed(() => String(props.unit.payload.status ?? 'queued'))
const title = computed(() => String(props.unit.payload.title ?? 'Delegated run'))
const agent = computed(() => String(props.unit.payload.agent ?? 'agent'))
const runId = computed(() => String(props.unit.payload.runId ?? ''))
const childSessionId = computed(() => typeof props.unit.payload.childSessionId === 'string' ? props.unit.payload.childSessionId : '')
const summary = computed(() => typeof props.unit.payload.summary === 'string' ? props.unit.payload.summary : '')
</script>

<template>
  <article class="message-card agent-run-card" :class="`agent-run-${status}`" :data-run-id="runId" data-testid="agent-run-block">
    <div class="agent-run-head">
      <span class="agent-run-glyph">↗</span>
      <span class="agent-run-title">
        <strong>{{ title }}</strong>
        <small>{{ agent }} · {{ runId }}<template v-if="childSessionId"> · {{ childSessionId }}</template></small>
      </span>
      <span :class="['status', status]"><i />{{ status }}</span>
    </div>
    <p v-if="summary" class="agent-run-summary">{{ summary }}</p>
  </article>
</template>
