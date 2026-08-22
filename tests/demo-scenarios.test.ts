import { describe, expect, it } from 'vitest'
import { block, type LogicalMessage } from '../src/engine/model/conversation'
import { SyntheticHistoryAdapter } from '../src/demo/history-adapter'
import {
  addFinalEvidence,
  agentMarkdownDelta,
  createLiveAssistantStep,
  createLiveToolResult,
  liveToolForStep,
  setLiveToolCall,
} from '../src/demo/live-run-script'
import { createScenarioTail } from '../src/demo/session-scenarios'

function liveMessage(step = 1): LogicalMessage {
  return {
    id: 'demo:m-9', index: 9, turnId: 'demo:turn', stepId: `demo:turn:step-${step}`, role: 'assistant', live: true,
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

  it('keeps the seeded Agent-loop assistant live at the real global tail', () => {
    const tail = createScenarioTail('agent-loop', 84_000, 'release-investigation')
    const live = tail.at(-1)!
    expect(live.index).toBe(83_999)
    expect(live.live).toBe(true)
    expect(live.stepId).toMatch(/:step-1$/)
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

  it('models three provider-neutral tool phases as separate call/result records in one Turn', () => {
    const specs = [1, 2, 3].map(step => liveToolForStep(step)!)
    expect(specs.map(spec => spec.category)).toEqual(['filesystem', 'search', 'shell'])
    expect(new Set(specs.map(spec => spec.callId)).size).toBe(3)

    let assistant = liveMessage(1)
    assistant = setLiveToolCall(assistant, specs[0]!, 'running', 25)
    assistant = setLiveToolCall(assistant, specs[0]!, 'success', 100)
    const result = createLiveToolResult(assistant, specs[0]!)
    const next = createLiveAssistantStep(assistant.turnId, 2)
    const call = assistant.blocks.find(contentBlock => contentBlock.type === 'tool-call')
    expect(call?.type === 'tool-call' ? call.data.callId : null).toBe(specs[0]!.callId)
    expect(result).toMatchObject({ turnId: assistant.turnId, stepId: assistant.stepId, role: 'tool' })
    expect(result.blocks[0]?.type === 'tool-result' ? result.blocks[0].data.callId : null).toBe(specs[0]!.callId)
    expect(next).toMatchObject({ turnId: assistant.turnId, stepId: `${assistant.turnId}:step-2`, role: 'assistant', live: true })
  })

  it('streams complex GFM across model steps and adds final evidence as canonical blocks', () => {
    const source = [1, 2, 3, 4]
      .flatMap(step => Array.from({ length: 10 }, (_, index) => agentMarkdownDelta(step, index)))
      .join('')
    expect(source).toContain('| Surface | Owner | Invariant |')
    expect(source).toContain('```ts')
    expect(source).toContain('```text')
    expect(source).toContain('- [x]')
    expect(source).toContain('> A virtual row may remount')
    expect(source).toContain('1. `turnId` groups')

    let final = liveMessage(4)
    final = addFinalEvidence(final, 'diff')
    final = addFinalEvidence(final, 'code')
    final = addFinalEvidence(final, 'artifacts')
    expect(final.blocks.map(contentBlock => contentBlock.type)).toEqual(['reasoning', 'diff', 'code', 'attachments', 'markdown'])
  })
})
