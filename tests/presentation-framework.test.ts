import { describe, expect, it } from 'vitest'
import type { LogicalMessage } from '../src/model/conversation'
import { block } from '../src/model/conversation'
import { ContentProjectorRegistry, defaultContentProjectors, projectMessage } from '../src/presentation/projector-registry'
import { splitMarkdown } from '../src/presentation/markdown-chunks'
import { AGENT_SCENARIO_MESSAGE_COUNT, createAgentScenarioPack, createMixedDemoTurn, MARKDOWN_COMPATIBILITY_FIXTURES } from '../src/presentation/demo-fixtures'

function message(blocks: LogicalMessage['blocks'], revision = 0): LogicalMessage {
  return { id: 's:m-1', index: 1, turnId: 's:t-1', stepId: 's:t-1:step-0', role: 'assistant', blocks, revision }
}

describe('Agent presentation framework', () => {
  it('projects one canonical message containing heterogeneous content through bounded stable units', () => {
    const fixture = createMixedDemoTurn('s', 3)[1]!
    const units = projectMessage(message(fixture.blocks))
    expect(new Set(units.map(unit => unit.kind))).toEqual(new Set(['thinking', 'markdown', 'html']))
    expect(units.every(unit => unit.id.startsWith('s:m-1:'))).toBe(true)
    expect(units.every(unit => unit.estimatePx <= 1800)).toBe(true)
    expect(units.every(unit => unit.turnId === 's:t-1' && unit.stepId === 's:t-1:step-0')).toBe(true)
  })

  it('keeps settled Markdown prefix chunks stable while only the streaming tail changes', () => {
    const prefix = Array.from({ length: 80 }, (_, i) => `### section ${i}\n\n${'stable paragraph '.repeat(20)}`).join('\n\n')
    const before = projectMessage(message([block('answer', 'markdown', { markdown: prefix })]))
    const after = projectMessage(message([block('answer', 'markdown', { markdown: `${prefix}\n\n### appended\n\nnew streaming tail` })], 1))
    expect(before.length).toBeGreaterThan(1)
    for (let i = 0; i < before.length - 1; i += 1) {
      expect(after[i]?.id).toBe(before[i]?.id)
      expect(after[i]?.revision).toBe(before[i]?.revision)
    }
  })

  it('never splits an open fenced code block', () => {
    const source = `intro\n\n\`\`\`ts\n${Array.from({ length: 600 }, (_, i) => `const line_${i} = ${i}`).join('\n')}\n\`\`\`\n\nafter`
    const chunks = splitMarkdown(source, 900)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    for (const chunk of chunks) {
      const fences = chunk.text.match(/```/g)?.length ?? 0
      expect(fences % 2).toBe(0)
    }
  })

  it('supports semantic projector extensions without modifying the default registry', () => {
    const registry = new ContentProjectorRegistry()
    registry.register('citation', ({ message: owner, block: contentBlock }) => [{
      id: `${owner.id}:${contentBlock.id}:citation`, messageId: owner.id, messageIndex: owner.index,
      turnId: owner.turnId, stepId: owner.stepId, blockId: contentBlock.id,
      kind: 'citation', revision: 0, estimatePx: 64, payload: { href: 'https://example.com' },
    }])
    const customBlock = { id: 'cite-1', type: 'citation', data: { href: 'https://example.com' } } as never
    expect(registry.project(message([]), customBlock, 0)[0]?.kind).toBe('citation')
    expect(defaultContentProjectors.has('citation')).toBe(false)
  })

  it('projects common Agent media workflows without tool-specific renderer coupling', () => {
    const pack = createAgentScenarioPack('scenario', 2)
    expect(pack).toHaveLength(AGENT_SCENARIO_MESSAGE_COUNT)
    const projected = pack.flatMap((entry, index) => projectMessage({
      id: `scenario:m-${index}`,
      index,
      turnId: entry.turnId,
      stepId: entry.stepId,
      role: entry.role,
      blocks: entry.blocks,
      variant: entry.variant,
      revision: 0,
    }))
    expect(new Set(projected.map(unit => unit.kind))).toEqual(new Set(['attachments', 'thinking', 'markdown', 'tool', 'audio']))
    expect(projected.filter(unit => unit.kind === 'attachments')).toHaveLength(3)
    expect(projected.filter(unit => unit.kind === 'audio')).toHaveLength(2)

    const imageCall = pack.find(entry => entry.variant === 'scenario-image-gen-call')?.blocks[0]
    const imageResult = pack.find(entry => entry.variant === 'scenario-image-gen-result')?.blocks[0]
    const generated = pack.find(entry => entry.variant === 'scenario-image-gen-artifacts')?.blocks[0]
    expect(imageCall?.type).toBe('tool-call')
    expect(imageResult?.type).toBe('tool-result')
    expect(generated?.type).toBe('attachments')
    if (imageCall?.type === 'tool-call' && imageResult?.type === 'tool-result' && generated?.type === 'attachments') {
      expect(imageResult.data.callId).toBe(imageCall.data.callId)
      expect(generated.data.provenance?.toolCallId).toBe(imageCall.data.callId)
      expect(generated.data.items).toHaveLength(4)
    }
  })

  it('maintains a deterministic Markdown compatibility gallery', () => {
    expect(MARKDOWN_COMPATIBILITY_FIXTURES.map(item => item.id)).toEqual([
      'gfm-basics', 'lists-tasks', 'wide-table', 'fences', 'raw-html', 'long-document',
    ])
  })
})
