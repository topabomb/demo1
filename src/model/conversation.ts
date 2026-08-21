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
export type ContentBlock<K extends ContentBlockType = ContentBlockType> = {
  [P in K]: { id: string; type: P; data: ContentBlockMap[P]; revision?: number }
}[K]

export type LogicalRole = 'user' | 'assistant' | 'tool' | 'system'

/** Provider-neutral canonical history record. No Vue/DOM/virtualizer concerns belong here. */
export interface LogicalMessage {
  id: string
  index: number
  turnId: string
  /** Stable model-request coordinate inside a Turn when the producer has one. */
  stepId?: string
  role: LogicalRole
  blocks?: readonly ContentBlock[]
  revision?: number
  live?: boolean
  variant?: string

  /** Synthetic/demo compatibility only. Production adapters should emit `blocks`. */
  kind?: string
  seed?: number
  intensity?: number
  content?: string
}

export interface AppendCanonicalMessage {
  turnId: string
  stepId?: string
  role: LogicalRole
  blocks: readonly ContentBlock[]
  variant?: string
  live?: boolean
}

export function block<K extends ContentBlockType>(id: string, type: K, data: ContentBlockMap[K], revision = 0): ContentBlock<K> {
  return { id, type, data, revision } as ContentBlock<K>
}
