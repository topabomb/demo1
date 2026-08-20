<script setup lang="ts">
import { ref } from 'vue'
import type { RenderUnit } from '../../core/types'
const props = defineProps<{ unit: RenderUnit }>()
const collapsed = ref(String(props.unit.payload.code ?? '').split('\n').length > 70)
</script>
<template>
  <article class="message-card code-card">
    <header>
      <span><span class="kind-dot code-dot" />Code · {{ unit.payload.language }}</span>
      <button class="mini" @click="collapsed = !collapsed">{{ collapsed ? 'expand' : 'collapse' }}</button>
    </header>
    <pre :class="{ collapsed }"><code>{{ unit.payload.code }}</code></pre>
  </article>
</template>
