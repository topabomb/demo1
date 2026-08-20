<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AgentWorkspace from './components/AgentWorkspace.vue'
import ArchitectureOverview from './components/ArchitectureOverview.vue'

const hash = ref(window.location.hash)
const view = computed(() => hash.value === '#lab' ? 'lab' : 'architecture')

function syncHash(): void { hash.value = window.location.hash }
onMounted(() => window.addEventListener('hashchange', syncHash))
onBeforeUnmount(() => window.removeEventListener('hashchange', syncHash))
</script>

<template>
  <AgentWorkspace v-if="view === 'lab'" />
  <ArchitectureOverview v-else />
</template>
