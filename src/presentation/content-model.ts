import type { LogicalMessage } from '../core/types'

/**
 * Portable semantic content. Applications may declaration-merge additional block
 * types without changing SessionKernel, viewport policy or virtualizer code.
 */
export interface ContentBlockMap {
  text: { text: string }
  markdown: { markdown: string; flavor?: 'gfm' }
  reasoning: { text: string; tokenCount?: number; durationMs?: number; defaultOpen?: boolean }
  code: { code: string; language?: string; filename?: string; defaultOpen?: boolean }
  image: { src?: string; width: number; height: number; alt?: string; seed?: number }
  html: { html: string }
  'tool-call': { name: string; callId: string; input: unknown; durationMs?: number; status?: 'running' | 'success' | 'error'; defaultOpen?: boolean }
  'tool-result': { name: string; callId: string; output: unknown; durationMs?: number; status?: 'running' | 'success' | 'error'; defaultOpen?: boolean }
  diff: { file: string; lines: readonly string[]; defaultOpen?: boolean }
}

export type ContentBlockType = keyof ContentBlockMap

export type ContentBlock<K extends ContentBlockType = ContentBlockType> = K extends ContentBlockType
  ? {
      id: string
      type: K
      data: ContentBlockMap[K]
      revision?: number
    }
  : never

export interface AppendCanonicalMessage {
  turnId: string
  role: LogicalMessage['role']
  blocks: readonly ContentBlock[]
  variant?: string
  live?: boolean
}

export function block<K extends ContentBlockType>(id: string, type: K, data: ContentBlockMap[K], revision = 0): ContentBlock<K> {
  return { id, type, data, revision }
}
