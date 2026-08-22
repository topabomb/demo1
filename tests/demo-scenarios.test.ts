import { describe, expect, it } from 'vitest'
import { block, type LogicalMessage } from '../src/engine/model/conversation'
import { SyntheticHistoryAdapter } from '../src/demo/history-adapter'
import { applyLiveScenarioMilestone, liveAnswerDelta } from '../src/demo/live-run-script'
import { createScenarioTail } from '../src/demo/session-scenarios'

function liveMessage(): LogicalMessage {
  return {
    id: 'demo:m-9', index: 9, turnId: 'demo:turn', stepId: 'demo:turn:step-0', role: 'assistant', live: true,
    blocks: [
      block('reasoning', 'reasoning', { text: 'inspect', status: 'streaming', defaultOpen: false }),
      block('answer', 'markdown', { markdown: '' }),
    ],
  }
}

describe('public Demo scenarios', () => {
  it('materializes realistic canonical tails at global history coordinates', () => {
    const tail = createScenarioTail('transport', 180_000, 'transport-refactor')
    expect(tail.length).toBeGreaterThan(4)
    expect(tail[0]?.index).toBe(180_000 - tail.length)
    expect(tail.at(-1)?.index).toBe(179_999)
    const kinds = new Set(tail.flatMap(message => message.blocks.map(contentBlock => contentBlock.type)))
    expect([...kinds]).toEqual(expect.arrayContaining(['tool-call', 'tool-result', 'diff', 'code', 'markdown']))
  })

  it('keeps the million-message scenario live at the real global tail', () => {
    const tail = createScenarioTail('million', 1_000_000, 'release-investigation')
    const live = tail.at(-1)!
    expect(live.index).toBe(999_999)
    expect(live.live).toBe(true)
    expect(live.blocks.map(contentBlock => contentBlock.type)).toEqual(['reasoning', 'markdown'])
  })

  it('overlays only the realistic tail while older stress history stays lazy', () => {
    const tail = createScenarioTail('transport', 100, 'transport-refactor')
    const adapter = new SyntheticHistoryAdapter('transport', 100, 3, false, tail)
    const old = adapter.loadRange(0, 1)[0]!
    const recent = adapter.loadRange(99, 1)[0]!
    expect(old.index).toBe(0)
    expect(old.id).toBe('transport:m-0')
    expect(recent).toBe(tail.at(-1))
  })

  it('adds heterogeneous live blocks through canonical message mutations', () => {
    let current = liveMessage()
    for (const milestone of [19, 28, 36, 44, 56, 68]) current = applyLiveScenarioMilestone(current, milestone) ?? current
    const kinds = current.blocks.map(contentBlock => contentBlock.type)
    expect(kinds).toEqual(['reasoning', 'tool-call', 'tool-result', 'diff', 'code', 'attachments', 'markdown'])
    const toolCall = current.blocks.find(contentBlock => contentBlock.type === 'tool-call')
    const toolResult = current.blocks.find(contentBlock => contentBlock.type === 'tool-result')
    if (toolCall?.type === 'tool-call' && toolResult?.type === 'tool-result') {
      expect(toolCall.data.callId).toBe('live-release-read')
      expect(toolResult.data.callId).toBe(toolCall.data.callId)
    }
  })

  it('streams rich Markdown structures instead of paragraph-only output', () => {
    const source = Array.from({ length: 9 }, (_, index) => liveAnswerDelta(index)).join('')
    expect(source).toContain('| Check | Result |')
    expect(source).toContain('```ts')
    expect(source).toContain('- [x]')
    expect(source).toContain('> The renderer may change physical height')
  })
})
