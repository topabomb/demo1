import { intBetween } from './prng'
import type { LogicalMessage, RenderUnit } from './types'

const words = [
  'agent', 'context', 'runtime', 'stream', 'virtual', 'render', 'tool', 'model',
  'workspace', 'cache', 'delta', 'anchor', 'message', 'token', 'layout', 'history',
  'protocol', 'projection', 'session', 'gateway', 'artifact', 'reasoning', 'commit',
]

function sentence(seed: number, count: number): string {
  const out: string[] = []
  for (let i = 0; i < count; i += 1) out.push(words[(seed + i * 13) % words.length]!)
  return `${out.join(' ')}.`
}

function commonPayload(message: LogicalMessage): Record<string, unknown> {
  return {
    role: message.role,
    turnId: message.turnId,
    variant: message.variant,
    live: message.live === true,
  }
}

function unit(
  message: LogicalMessage,
  suffix: string,
  kind: RenderUnit['kind'],
  estimatePx: number,
  payload: RenderUnit['payload'],
): RenderUnit {
  return {
    id: `${message.id}:${suffix}`,
    messageId: message.id,
    messageIndex: message.index,
    kind,
    revision: 0,
    estimatePx,
    payload: { ...commonPayload(message), ...payload },
  }
}

function annotateParts(units: RenderUnit[]): RenderUnit[] {
  const count = units.length
  return units.map((entry, index) => ({
    ...entry,
    payload: { ...entry.payload, partIndex: index, partCount: count },
  }))
}

function markdownUnits(message: LogicalMessage): RenderUnit[] {
  if (message.live) {
    return annotateParts([
      unit(message, 'live', 'markdown', 190, {
        markdown: '### Working on it…\n\nThe latest assistant response is streaming. New model deltas are coalesced to animation frames before Vue publication.',
      }),
    ])
  }

  const { seed, intensity } = message
  const sectionCount = message.role === 'user'
    ? intBetween(seed + 2, 1, 2)
    : intBetween(seed + 2, 1, Math.min(6, 2 + Math.ceil(intensity / 2)))

  const units = Array.from({ length: sectionCount }, (_, i) => {
    const paragraphs = intBetween(seed + i * 19, 1, message.role === 'user' ? 3 : 6)
    const title = message.role === 'user'
      ? `Request ${message.index.toLocaleString()}`
      : ['Implementation', 'Investigation', 'Result', 'Trade-offs', 'Verification', 'Next steps'][i % 6]
    const body = [
      `### ${title}`,
      ...Array.from({ length: paragraphs }, (__, p) => sentence(seed + p * 23 + i * 7, 22 + intensity * 5)),
    ].join('\n\n')
    return unit(message, `md-${i}`, 'markdown', 120 + paragraphs * 96, { markdown: body })
  })
  return annotateParts(units)
}

function thinkingUnits(message: LogicalMessage): RenderUnit[] {
  const paragraphs = intBetween(message.seed + 41, 2, 6 + message.intensity)
  const thoughts = Array.from({ length: paragraphs }, (_, i) => {
    const prefix = i === 0 ? 'I need to inspect the current state before changing anything.' : 'Then I should validate the next dependency and preserve the existing invariant.'
    return `${prefix} ${sentence(message.seed + i * 31, 24 + message.intensity * 4)}`
  }).join('\n\n')

  return annotateParts([
    unit(message, 'thinking', 'thinking', 72, {
      text: thoughts,
      tokenCount: Math.round(thoughts.length / 3.8),
      durationMs: intBetween(message.seed + 43, 900, 28_000),
      defaultOpen: false,
    }),
  ])
}

function codeUnits(message: LogicalMessage): RenderUnit[] {
  const lines = intBetween(message.seed + 3, 18, 70 + message.intensity * 14)
  const all = Array.from({ length: lines }, (_, i) => {
    if (i % 11 === 0) return `// render unit ${i}: keep hot state independent from total history size`
    if (i % 7 === 0) return `await adapter.applyDelta({ id: 'm-${message.index}-${i}', revision: ${i} })`
    return `const value_${i} = transform(input[${i}], { cache: ${i % 2 === 0}, priority: ${i % 7} })`
  })
  const chunkSize = 80
  const chunks = Math.ceil(all.length / chunkSize)
  return annotateParts(Array.from({ length: chunks }, (_, chunk) => {
    const code = all.slice(chunk * chunkSize, (chunk + 1) * chunkSize).join('\n')
    const lineCount = code.split('\n').length
    return unit(message, `code-${chunk}`, 'code', 110 + Math.min(28, lineCount) * 20, {
      language: 'typescript',
      code,
      filename: `src/agent/turn-${message.index % 97}.ts`,
      defaultOpen: lineCount <= 34,
    })
  }))
}

function toolUnit(message: LogicalMessage): RenderUnit[] {
  const rawVariant = String(message.variant ?? 'call:tool')
  const [phase, rawName] = rawVariant.split(':')
  const toolName = rawName || `tool_${message.seed % 17}`
  const rows = intBetween(message.seed + 7, 3, 8 + message.intensity)
  const callId = `call_${Math.floor(message.index / 2).toString(36)}_${message.seed.toString(36).slice(0, 4)}`

  const input = {
    path: `/workspace/src/${toolName}-${message.index % 31}.ts`,
    query: sentence(message.seed, 7),
    limit: intBetween(message.seed + 5, 10, 200),
    recursive: message.seed % 2 === 0,
  }

  const outputRows = Array.from({ length: rows }, (_, i) => ({
    line: intBetween(message.seed + i * 17, 1, 4000),
    score: Number((((message.seed + i * 19) % 1000) / 1000).toFixed(3)),
    preview: sentence(message.seed + i * 29, 10 + (i % 8)),
  }))

  const status = phase === 'result' && message.seed % 17 === 0 ? 'error' : phase === 'result' ? 'success' : 'running'
  return annotateParts([
    unit(message, 'tool', 'tool', 76, {
      phase,
      name: toolName,
      callId,
      durationMs: intBetween(message.seed, 5, 9000),
      status,
      input,
      output: { rows: outputRows, truncated: rows > 10, exitCode: status === 'error' ? 1 : 0 },
      defaultOpen: false,
    }),
  ])
}

export function projectMessage(message: LogicalMessage): RenderUnit[] {
  const { seed, intensity } = message
  switch (message.kind) {
    case 'text': {
      const lines = intBetween(seed + 1, 1, 8 + intensity)
      return annotateParts([
        unit(message, 'text', 'text', 70 + lines * 22, { text: sentence(seed, lines * 9) }),
      ])
    }
    case 'markdown':
      return markdownUnits(message)
    case 'thinking':
      return thinkingUnits(message)
    case 'code':
      return codeUnits(message)
    case 'image': {
      const width = intBetween(seed + 4, 720, 1600)
      const height = intBetween(seed + 5, 320, 1100)
      return annotateParts([
        unit(message, 'image', 'image', 110 + Math.min(620, (height / width) * 820), { width, height, seed, alt: `Generated artifact preview ${message.index}` }),
      ])
    }
    case 'html': {
      const cards = intBetween(seed + 6, 2, 7)
      const html = `<section class="synthetic-html"><h3>Generated interactive artifact</h3><p>This HTML is intentionally passed through the renderer boundary and sanitized before mounting.</p>${Array.from({ length: cards }, (_, i) => `<div class="html-chip"><strong>Node ${i + 1}</strong><span>${sentence(seed + i, 12)}</span></div>`).join('')}<script>window.__unsafeSyntheticPayload = true</script></section>`
      return annotateParts([unit(message, 'html', 'html', 150 + cards * 58, { html })])
    }
    case 'tool':
      return toolUnit(message)
    case 'diff': {
      const lineCount = intBetween(seed + 8, 35, 100 + intensity * 24)
      const chunkSize = 72
      const chunks = Math.ceil(lineCount / chunkSize)
      return annotateParts(Array.from({ length: chunks }, (_, chunk) => {
        const start = chunk * chunkSize
        const end = Math.min(lineCount, start + chunkSize)
        const lines = Array.from({ length: end - start }, (__, i) => {
          const n = start + i
          return `${n % 3 === 0 ? '+' : n % 5 === 0 ? '-' : ' '} ${String(n + 1).padStart(4, ' ')}  ${sentence(seed + n, 8 + (n % 11))}`
        })
        return unit(message, `diff-${chunk}`, 'diff', 110 + Math.min(28, lines.length) * 20, {
          file: `src/generated-${message.index % 29}.ts`,
          lines,
          defaultOpen: lines.length <= 32,
        })
      }))
    }
  }
}

export function projectMessages(messages: LogicalMessage[]): RenderUnit[] {
  return messages.flatMap(projectMessage)
}
