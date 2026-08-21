export type BuiltinToolCategory = 'generic' | 'search' | 'filesystem' | 'shell' | 'image-generation' | 'tts' | 'asr'
/** Tool categories are routing/presentation hints, not a closed list of capabilities. */
export type ToolCategory = BuiltinToolCategory | (string & {})
export type AttachmentKind = 'image' | 'audio' | 'video' | 'file'

export interface AttachmentItem {
  id: string
  name: string
  kind: AttachmentKind
  mimeType: string
  sizeBytes?: number
  src?: string
  width?: number
  height?: number
  durationMs?: number
  seed?: number
}

export interface ArtifactProvenance {
  origin: 'user-upload' | 'tool-output' | 'assistant'
  toolCallId?: string
  toolName?: string
  model?: string
  prompt?: string
}

export interface ContentBlockMap {
  text: { text: string }
  markdown: { markdown: string; flavor?: 'gfm' }
  reasoning: { text: string; tokenCount?: number; durationMs?: number; defaultOpen?: boolean; status?: 'streaming' | 'complete' | 'interrupted' }
  code: { code: string; language?: string; filename?: string; defaultOpen?: boolean }
  /** Legacy stress-corpus image shape. New user/tool media should normally use `attachments`. */
  image: { src?: string; width: number; height: number; alt?: string; seed?: number }
  attachments: { items: readonly AttachmentItem[]; title?: string; provenance?: ArtifactProvenance }
  audio: { title: string; purpose: 'tts' | 'asr-input' | 'recording'; durationMs: number; src?: string; transcript?: string; model?: string; waveform?: readonly number[]; status?: 'processing' | 'ready' | 'error' }
  html: { html: string }
  'tool-call': { name: string; callId: string; input: unknown; category?: ToolCategory; model?: string; progress?: number; durationMs?: number; status?: 'running' | 'success' | 'error'; defaultOpen?: boolean }
  'tool-result': { name: string; callId: string; output: unknown; category?: ToolCategory; model?: string; progress?: number; durationMs?: number; status?: 'running' | 'success' | 'error'; defaultOpen?: boolean }
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