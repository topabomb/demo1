import { intBetween } from '../core/prng'
import type { LogicalMessage, RenderUnit } from '../core/types'
import { block, type ContentBlock } from './content-model'
import { splitMarkdown } from './markdown-chunks'

export interface ContentProjectionContext {
  message: LogicalMessage
  block: ContentBlock
  blockIndex: number
}

export type ContentProjector = (context: ContentProjectionContext) => readonly RenderUnit[]

/** Semantic ContentBlock → bounded RenderUnit registry. Framework-free. */
export class ContentProjectorRegistry {
  #projectors = new Map<string, ContentProjector>()

  register(type: string, projector: ContentProjector): this {
    this.#projectors.set(type, projector)
    return this
  }

  has(type: string): boolean { return this.#projectors.has(type) }

  project(message: LogicalMessage, contentBlock: ContentBlock, blockIndex: number): readonly RenderUnit[] {
    const projector = this.#projectors.get(contentBlock.type)
    if (!projector) return [makeUnit(message, contentBlock, `unknown-${blockIndex}`, 'unknown', 96, {
      blockType: contentBlock.type,
      data: contentBlock.data,
    })]
    return projector({ message, block: contentBlock, blockIndex })
  }
}

export const defaultContentProjectors = new ContentProjectorRegistry()

defaultContentProjectors
  .register('text', ({ message, block: contentBlock }) => {
    const data = contentBlock.data as { text: string }
    return [makeUnit(message, contentBlock, 'text', 'text', 74 + Math.min(320, data.text.length * 0.16), { text: data.text })]
  })
  .register('markdown', ({ message, block: contentBlock }) => {
    const data = contentBlock.data as { markdown: string }
    const chunks = splitMarkdown(data.markdown)
    return chunks.map(chunk => makeUnit(message, contentBlock, `md-${chunk.index}`, 'markdown', estimateMarkdown(chunk.text), {
      markdown: chunk.text,
      markdownHash: chunk.hash,
    }, chunk.hash))
  })
  .register('reasoning', ({ message, block: contentBlock }) => {
    const data = contentBlock.data as { text: string; tokenCount?: number; durationMs?: number; defaultOpen?: boolean }
    return [makeUnit(message, contentBlock, 'thinking', 'thinking', 72, {
      text: data.text,
      tokenCount: data.tokenCount ?? Math.round(data.text.length / 3.8),
      durationMs: data.durationMs ?? 0,
      defaultOpen: data.defaultOpen ?? false,
    })]
  })
  .register('code', ({ message, block: contentBlock }) => {
    const data = contentBlock.data as { code: string; language?: string; filename?: string; defaultOpen?: boolean }
    const lines = data.code.split('\n')
    return chunkArray(lines, 80).map((part, index) => makeUnit(message, contentBlock, `code-${index}`, 'code', 110 + Math.min(30, part.length) * 20, {
      language: data.language ?? 'text',
      code: part.join('\n'),
      filename: data.filename,
      defaultOpen: data.defaultOpen ?? part.length <= 34,
    }))
  })
  .register('image', ({ message, block: contentBlock }) => {
    const data = contentBlock.data as { src?: string; width: number; height: number; alt?: string; seed?: number }
    return [makeUnit(message, contentBlock, 'image', 'image', 110 + Math.min(620, (data.height / Math.max(1, data.width)) * 820), data)]
  })
  .register('html', ({ message, block: contentBlock }) => {
    const data = contentBlock.data as { html: string }
    return [makeUnit(message, contentBlock, 'html', 'html', 240 + Math.min(620, data.html.length * 0.08), data)]
  })
  .register('tool-call', ({ message, block: contentBlock }) => {
    const data = contentBlock.data as Record<string, unknown>
    return [makeUnit(message, contentBlock, 'tool-call', 'tool', 76, { ...data, phase: 'call', status: data.status ?? 'running' })]
  })
  .register('tool-result', ({ message, block: contentBlock }) => {
    const data = contentBlock.data as Record<string, unknown>
    return [makeUnit(message, contentBlock, 'tool-result', 'tool', 76, { ...data, phase: 'result', status: data.status ?? 'success' })]
  })
  .register('diff', ({ message, block: contentBlock }) => {
    const data = contentBlock.data as { file: string; lines: readonly string[]; defaultOpen?: boolean }
    return chunkArray([...data.lines], 72).map((lines, index) => makeUnit(message, contentBlock, `diff-${index}`, 'diff', 110 + Math.min(28, lines.length) * 20, {
      file: data.file,
      lines,
      defaultOpen: data.defaultOpen ?? lines.length <= 32,
    }))
  })

export function projectMessage(message: LogicalMessage, registry = defaultContentProjectors): RenderUnit[] {
  const blocks = message.blocks?.length ? [...message.blocks] : legacyBlocksForMessage(message)
  const units = blocks.flatMap((contentBlock, blockIndex) => [...registry.project(message, contentBlock, blockIndex)])
  const count = units.length
  return units.map((entry, index) => ({
    ...entry,
    payload: { ...entry.payload, partIndex: index, partCount: count },
  }))
}

export function projectMessages(messages: readonly LogicalMessage[], registry = defaultContentProjectors): RenderUnit[] {
  return messages.flatMap(message => projectMessage(message, registry))
}

export function legacyBlocksForMessage(message: LogicalMessage): ContentBlock[] {
  const kind = message.kind ?? 'markdown'
  const { seed, intensity } = message

  if (message.content !== undefined) {
    return [block('runtime-content', message.role === 'user' ? 'markdown' : 'markdown', { markdown: message.content }, message.revision ?? 0)]
  }

  if (kind === 'markdown') {
    if (message.live) return [block('live', 'markdown', { markdown: '### Working on it…\n\nThe latest assistant response is streaming. New model deltas are coalesced before UI publication.' })]
    const sectionCount = message.role === 'user' ? intBetween(seed + 2, 1, 2) : intBetween(seed + 2, 1, Math.min(6, 2 + Math.ceil(intensity / 2)))
    return Array.from({ length: sectionCount }, (_, i) => {
      const paragraphs = intBetween(seed + i * 19, 1, message.role === 'user' ? 3 : 6)
      const title = message.role === 'user' ? `Request ${message.index.toLocaleString()}` : ['Implementation', 'Investigation', 'Result', 'Trade-offs', 'Verification', 'Next steps'][i % 6]
      const markdown = [`### ${title}`, ...Array.from({ length: paragraphs }, (__, p) => sentence(seed + p * 23 + i * 7, 22 + intensity * 5))].join('\n\n')
      return block(`md-${i}`, 'markdown', { markdown })
    })
  }

  if (kind === 'text') {
    const lines = intBetween(seed + 1, 1, 8 + intensity)
    return [block('text', 'text', { text: sentence(seed, lines * 9) })]
  }

  if (kind === 'thinking') {
    const paragraphs = intBetween(seed + 41, 2, 6 + intensity)
    const text = Array.from({ length: paragraphs }, (_, i) => {
      const prefix = i === 0 ? 'I need to inspect the current state before changing anything.' : 'Then I should validate the next dependency and preserve the existing invariant.'
      return `${prefix} ${sentence(seed + i * 31, 24 + intensity * 4)}`
    }).join('\n\n')
    return [block('reasoning', 'reasoning', { text, tokenCount: Math.round(text.length / 3.8), durationMs: intBetween(seed + 43, 900, 28_000), defaultOpen: false })]
  }

  if (kind === 'code') {
    const lines = intBetween(seed + 3, 18, 70 + intensity * 14)
    const code = Array.from({ length: lines }, (_, i) => {
      if (i % 11 === 0) return `// render unit ${i}: keep hot state independent from total history size`
      if (i % 7 === 0) return `await adapter.applyDelta({ id: 'm-${message.index}-${i}', revision: ${i} })`
      return `const value_${i} = transform(input[${i}], { cache: ${i % 2 === 0}, priority: ${i % 7} })`
    }).join('\n')
    return [block('code', 'code', { code, language: 'typescript', filename: `src/agent/turn-${message.index % 97}.ts` })]
  }

  if (kind === 'image') {
    const width = intBetween(seed + 4, 720, 1600)
    const height = intBetween(seed + 5, 320, 1100)
    return [block('image', 'image', { width, height, seed, alt: `Generated artifact preview ${message.index}` })]
  }

  if (kind === 'html') {
    const cards = intBetween(seed + 6, 2, 7)
    const html = `<section class="synthetic-html"><h3>Generated interactive artifact</h3><p>This HTML is intentionally passed through the renderer boundary and sanitized before mounting.</p>${Array.from({ length: cards }, (_, i) => `<div class="html-chip"><strong>Node ${i + 1}</strong><span>${sentence(seed + i, 12)}</span></div>`).join('')}<script>window.__unsafeSyntheticPayload = true</script></section>`
    return [block('html', 'html', { html })]
  }

  if (kind === 'tool') {
    const rawVariant = String(message.variant ?? 'call:tool')
    const [phase, rawName] = rawVariant.split(':')
    const name = rawName || `tool_${seed % 17}`
    const rows = intBetween(seed + 7, 3, 8 + intensity)
    const callId = `call_${Math.floor(message.index / 2).toString(36)}_${seed.toString(36).slice(0, 4)}`
    const input = { path: `/workspace/src/${name}-${message.index % 31}.ts`, query: sentence(seed, 7), limit: intBetween(seed + 5, 10, 200), recursive: seed % 2 === 0 }
    const outputRows = Array.from({ length: rows }, (_, i) => ({ line: intBetween(seed + i * 17, 1, 4000), score: Number((((seed + i * 19) % 1000) / 1000).toFixed(3)), preview: sentence(seed + i * 29, 10 + (i % 8)) }))
    const status = phase === 'result' && seed % 17 === 0 ? 'error' : phase === 'result' ? 'success' : 'running'
    return phase === 'result'
      ? [block('tool-result', 'tool-result', { name, callId, durationMs: intBetween(seed, 5, 9000), status, output: { rows: outputRows, truncated: rows > 10, exitCode: status === 'error' ? 1 : 0 }, defaultOpen: false })]
      : [block('tool-call', 'tool-call', { name, callId, durationMs: intBetween(seed, 5, 9000), status, input, defaultOpen: false })]
  }

  if (kind === 'diff') {
    const lineCount = intBetween(seed + 8, 35, 100 + intensity * 24)
    const lines = Array.from({ length: lineCount }, (__, n) => `${n % 3 === 0 ? '+' : n % 5 === 0 ? '-' : ' '} ${String(n + 1).padStart(4, ' ')}  ${sentence(seed + n, 8 + (n % 11))}`)
    return [block('diff', 'diff', { file: `src/generated-${message.index % 29}.ts`, lines })]
  }

  return [block('unknown', 'text', { text: `[${String(kind)}] unsupported legacy content` })]
}

function makeUnit(message: LogicalMessage, contentBlock: ContentBlock, suffix: string, kind: string, estimatePx: number, payload: Record<string, unknown>, revision = contentBlock.revision ?? message.revision ?? 0): RenderUnit {
  return {
    id: `${message.id}:${contentBlock.id}:${suffix}`,
    messageId: message.id,
    messageIndex: message.index,
    kind,
    revision,
    estimatePx,
    payload: { role: message.role, turnId: message.turnId, variant: message.variant, live: message.live === true, blockType: contentBlock.type, ...payload },
  }
}

function estimateMarkdown(markdown: string): number {
  const lines = Math.max(1, markdown.split('\n').length)
  return Math.min(1800, 100 + markdown.length * 0.11 + lines * 10)
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result.length ? result : [[]]
}

const words = ['agent', 'context', 'runtime', 'stream', 'virtual', 'render', 'tool', 'model', 'workspace', 'cache', 'delta', 'anchor', 'message', 'token', 'layout', 'history', 'protocol', 'projection', 'session', 'gateway', 'artifact', 'reasoning', 'commit']
function sentence(seed: number, count: number): string {
  const out: string[] = []
  for (let i = 0; i < count; i += 1) out.push(words[(seed + i * 13) % words.length]!)
  return `${out.join(' ')}.`
}
