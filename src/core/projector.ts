import { intBetween } from './prng'
import type { LogicalMessage, RenderUnit } from './types'

const words = ['agent', 'context', 'runtime', 'stream', 'virtual', 'render', 'tool', 'model', 'workspace', 'cache', 'delta', 'anchor', 'message', 'token', 'layout', 'history']

function sentence(seed: number, count: number): string {
  const out: string[] = []
  for (let i = 0; i < count; i += 1) out.push(words[(seed + i * 13) % words.length])
  return `${out.join(' ')}.`
}

function unit(message: LogicalMessage, suffix: string, kind: RenderUnit['kind'], estimatePx: number, payload: RenderUnit['payload']): RenderUnit {
  return {
    id: `${message.id}:${suffix}`,
    messageId: message.id,
    messageIndex: message.index,
    kind,
    revision: 0,
    estimatePx,
    payload,
  }
}

export function projectMessage(message: LogicalMessage): RenderUnit[] {
  const { seed, intensity } = message
  switch (message.kind) {
    case 'text': {
      const lines = intBetween(seed + 1, 1, 12 + intensity * 2)
      return [unit(message, 'text', 'text', 70 + lines * 22, { role: message.role, text: sentence(seed, lines * 9) })]
    }
    case 'markdown': {
      const sections = intBetween(seed + 2, 1, Math.min(6, 1 + Math.ceil(intensity / 2)))
      return Array.from({ length: sections }, (_, i) => {
        const paragraphs = intBetween(seed + i * 19, 2, 7)
        const body = Array.from({ length: paragraphs }, (__, p) => `### Section ${i + 1}.${p + 1}\n\n${sentence(seed + p * 23, 30 + intensity * 4)}`).join('\n\n')
        return unit(message, `md-${i}`, 'markdown', 150 + paragraphs * 92, { role: message.role, markdown: body })
      })
    }
    case 'code': {
      const lines = intBetween(seed + 3, 8, 35 + intensity * 12)
      const code = Array.from({ length: lines }, (_, i) => `const value_${i} = transform(input[${i}], { cache: ${i % 2 === 0}, priority: ${i % 7} })`).join('\n')
      return [unit(message, 'code', 'code', 100 + lines * 20, { language: 'ts', code })]
    }
    case 'image': {
      const width = intBetween(seed + 4, 640, 1600)
      const height = intBetween(seed + 5, 260, 1200)
      return [unit(message, 'image', 'image', 120 + Math.min(720, (height / width) * 820), { width, height, seed })]
    }
    case 'html': {
      const cards = intBetween(seed + 6, 1, 8)
      const html = `<section class="synthetic-html"><h3>Generated HTML fragment</h3>${Array.from({ length: cards }, (_, i) => `<div class="html-chip"><strong>Node ${i + 1}</strong><span>${sentence(seed + i, 12)}</span></div>`).join('')}</section>`
      return [unit(message, 'html', 'html', 120 + cards * 58, { html })]
    }
    case 'tool': {
      const rows = intBetween(seed + 7, 2, 14)
      return [unit(message, 'tool', 'tool', 130 + rows * 30, { name: `tool_${seed % 17}`, durationMs: intBetween(seed, 5, 9000), rows, status: seed % 9 === 0 ? 'error' : 'success' })]
    }
    case 'diff': {
      const lineCount = intBetween(seed + 8, 20, 80 + intensity * 20)
      const chunkSize = 70
      const chunks = Math.ceil(lineCount / chunkSize)
      return Array.from({ length: chunks }, (_, chunk) => {
        const start = chunk * chunkSize
        const end = Math.min(lineCount, start + chunkSize)
        const lines = Array.from({ length: end - start }, (__, i) => {
          const n = start + i
          return `${n % 3 === 0 ? '+' : n % 5 === 0 ? '-' : ' '} ${String(n + 1).padStart(4, ' ')}  ${sentence(seed + n, 8 + (n % 11))}`
        })
        return unit(message, `diff-${chunk}`, 'diff', 110 + lines.length * 20, { file: `src/generated-${message.index % 29}.ts`, lines })
      })
    }
  }
}

export function projectMessages(messages: LogicalMessage[]): RenderUnit[] {
  return messages.flatMap(projectMessage)
}
