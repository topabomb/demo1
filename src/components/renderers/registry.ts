import type { Component } from 'vue'
import TextBlock from './TextBlock.vue'
import MarkdownBlock from './MarkdownBlock.vue'
import ThinkingBlock from './ThinkingBlock.vue'
import CodeBlock from './CodeBlock.vue'
import ImageBlock from './ImageBlock.vue'
import HtmlBlock from './HtmlBlock.vue'
import ToolBlock from './ToolBlock.vue'
import DiffBlock from './DiffBlock.vue'
import UnknownBlock from './UnknownBlock.vue'

/**
 * Physical frontend rendering is intentionally separate from semantic projection.
 * Product packages may register or replace renderer IDs without changing the store,
 * SessionKernel, projection economics or viewport algorithms.
 */
const renderers = new Map<string, Component>([
  ['text', TextBlock],
  ['markdown', MarkdownBlock],
  ['thinking', ThinkingBlock],
  ['code', CodeBlock],
  ['image', ImageBlock],
  ['html', HtmlBlock],
  ['tool', ToolBlock],
  ['diff', DiffBlock],
  ['unknown', UnknownBlock],
])

export function registerRenderer(id: string, component: Component): void {
  renderers.set(id, component)
}

export function resolveRenderer(id: string): Component {
  return renderers.get(id) ?? UnknownBlock
}

export function registeredRendererIds(): readonly string[] {
  return Object.freeze([...renderers.keys()])
}
