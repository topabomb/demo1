import { describe, expect, it } from 'vitest'
import { ConversationSessionKernel } from '../src/conversation/session-kernel'
import { SyntheticHistoryAdapter } from '../src/conversation/synthetic-adapter'
import { SyntheticStreamController } from '../src/conversation/stream-controller'

describe('ConversationSessionKernel', () => {
  it('turns an idle historical conversation into a canonical resumable Turn/Step with durable accounting', () => {
    const descriptor = {
      id: 'resume', title: 'Resume', age: 'now', status: 'idle' as const, logicalCount: 100,
      usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 40, cacheWriteTokens: 5, reasoningTokens: 2 },
      context: { projectedTokens: 2_000, contextWindow: 128_000 },
      lastTurnReason: 'completed' as const,
    }
    const kernel = new ConversationSessionKernel(descriptor, new SyntheticHistoryAdapter('resume', 100), 9)
    const execution = new SyntheticStreamController(kernel)
    const inputBefore = kernel.usage.inputTokens
    expect(execution.submit('continue this task')).toBe('started')
    expect(kernel.count).toBe(102)
    expect(kernel.getMessage(100)).toMatchObject({
      role: 'user', turnId: 'resume:runtime-turn-100', stepId: 'resume:runtime-turn-100:step-0',
      blocks: [{ id: 'prompt', type: 'markdown', data: { markdown: 'continue this task' } }],
    })
    expect(kernel.getMessage(101)).toMatchObject({
      role: 'assistant', live: true, turnId: 'resume:runtime-turn-100', stepId: 'resume:runtime-turn-100:step-0',
      blocks: [{ id: 'answer', type: 'markdown', data: { markdown: '' } }],
    })
    expect(kernel.status).toBe('working')
    expect(kernel.lastTurnReason).toBeNull()
    expect(kernel.usage.inputTokens).toBeGreaterThan(inputBefore)
    kernel.appendAssistantDelta('A streamed answer adds output-token accounting. ')
    expect(kernel.getMessage(101)).toMatchObject({
      blocks: [{ id: 'answer', type: 'markdown', data: { markdown: 'A streamed answer adds output-token accounting. ' } }],
    })
    expect(kernel.lastEvent.contentPatch).toMatchObject({ kind: 'append-markdown', blockId: 'answer' })
    expect(kernel.usage.outputTokens).toBeGreaterThan(10)
    kernel.completeCurrent()
    expect(kernel.lastTurnReason).toBe('completed')
    execution.dispose()
  })

  it('delivers every semantic mutation in producer order while summary notification stays coalesced', async () => {
    const descriptor = { id: 'events', title: 'Events', age: 'now', status: 'idle' as const, logicalCount: 0 }
    const kernel = new ConversationSessionKernel(descriptor, new SyntheticHistoryAdapter('events', 0), 4)
    const events: string[] = []
    let summaries = 0
    const unsubscribeEvents = kernel.subscribeEvents(event => events.push(event.kind))
    const unsubscribeSummary = kernel.subscribe(() => { summaries += 1 })

    kernel.beginTurn('first')
    kernel.appendAssistantDelta('a')
    kernel.appendAssistantDelta('b')

    expect(events).toEqual(['append', 'content', 'content'])
    expect(summaries).toBe(0)
    await Promise.resolve()
    expect(summaries).toBe(1)
    unsubscribeEvents()
    unsubscribeSummary()
  })

  it('queues follow-ups while working instead of coupling them to the viewport', () => {
    const descriptor = { id: 'queue', title: 'Queue', age: 'now', status: 'idle' as const, logicalCount: 0 }
    const kernel = new ConversationSessionKernel(descriptor, new SyntheticHistoryAdapter('queue', 0), 4)
    const execution = new SyntheticStreamController(kernel)
    expect(execution.submit('first')).toBe('started')
    expect(execution.submit('second')).toBe('queued')
    expect(kernel.queuedPrompts).toBe(1)
    execution.dispose()
  })

  it('records last-turn failure without making the historical session non-resumable', () => {
    const descriptor = { id: 'failed', title: 'Failed', age: 'now', status: 'idle' as const, logicalCount: 20, lastTurnReason: 'error' as const }
    const kernel = new ConversationSessionKernel(descriptor, new SyntheticHistoryAdapter('failed', 20), 4)
    const execution = new SyntheticStreamController(kernel)
    expect(execution.submit('retry with a new turn')).toBe('started')
    kernel.failCurrent({ code: 'PROVIDER_TIMEOUT', message: 'timeout', status: 504 })
    expect(kernel.status).toBe('idle')
    expect(kernel.lastTurnReason).toBe('error')
    expect(kernel.lastFailure?.code).toBe('PROVIDER_TIMEOUT')
    expect(execution.submit('continue after failure')).toBe('started')
    expect(kernel.lastFailure).toBeNull()
    execution.dispose()
  })
})
