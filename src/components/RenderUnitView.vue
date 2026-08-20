<script setup lang="ts">
import type { Component } from 'vue'
import type { RenderKind, RenderUnit } from '../core/types'
import TextBlock from './renderers/TextBlock.vue'
import MarkdownBlock from './renderers/MarkdownBlock.vue'
import ThinkingBlock from './renderers/ThinkingBlock.vue'
import CodeBlock from './renderers/CodeBlock.vue'
import ImageBlock from './renderers/ImageBlock.vue'
import HtmlBlock from './renderers/HtmlBlock.vue'
import ToolBlock from './renderers/ToolBlock.vue'
import DiffBlock from './renderers/DiffBlock.vue'

defineProps<{ unit: RenderUnit }>()

const registry: Record<RenderKind, Component> = {
  text: TextBlock,
  markdown: MarkdownBlock,
  thinking: ThinkingBlock,
  code: CodeBlock,
  image: ImageBlock,
  html: HtmlBlock,
  tool: ToolBlock,
  diff: DiffBlock,
}
</script>

<template>
  <component :is="registry[unit.kind]" :unit="unit" />
</template>
