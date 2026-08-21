import { describe, expect, it } from 'vitest'
import { ConversationSessionKernel } from '../src/engine/conversation/session-kernel'
import { block } from '../src/engine/model/conversation'
import { appendMarkdownContent, appendReasoningContent, settleReasoning } from '../src/engine/model/message-mutations'
import { SyntheticHistoryAdapter } from '../src/demo/history-adapter'
import { SyntheticStreamController } from '../src/demo/stream-controller'

function appendTurn(kernel: ConversationSessionKernel, prompt: string): number {
  const userIndex = kernel.count
  const turnId = `${kernel.id}:test-turn-${userIndex}`
  const stepId = `${turnId}:step-0`
  const indexes = kernel.appendCanonicalMessages([
    { turnId, stepId, role: 'user', blocks: [block('prompt', 'markdown', { markdown: prompt })] },
    { turnId, stepId, role: 'assistant', blocks: [block('reasoning', 'reasoning', { text: '', tokenCount: 0, durationMs: 0, status: 'streaming' }), block('answer', 'markdown', { markdown: '' })], live: true },
  ])
  return indexes[1]!
}

describe('ConversationSessionKernel', () => {
  it('stores canonical content/lifecycle/accounting without inventing provider behavior', () => {
    const descriptor = {
      id: 'resume', title: 'Resume', status: 'idle' as const, logicalCount: 100,
      usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 40, cacheWriteTokens: 5, reasoningTokens: 2 },
      context: { projectedTokens: 2_000, contextWindow: 128_000 },
      lastTurnReason: 'completed' as const,
    }
    const kernel = new ConversationSessionKernel(descriptor, new SyntheticHistoryAdapter('resume', 100, 9))
    const assistantIndex = appendTurn(kernel, 'continue this task')
    expect(kernel.startExecution(assistantIndex)).toBe(true)
    expect(kernel.count).toBe(102)
    expect(kernel.getMessage(100)).toMatchObject({ role: 'user', blocks: [{ id: 'prompt', type: 'markdown' }] })
    expect(kernel.getMessage(101)).toMatchObject({ role: 'assistant', live: true, blocks: [{ id: 'reasoning' }, { id: 'answer' }] })

    const reasoning = appendReasoningContent(kernel.getMessage(assistantIndex), 'Inspect stable identities before rendering. ', 20, 11)!
    kernel.replaceCanonicalMessage(assistantIndex, reasoning.message, { kind: 'append-reasoning', blockId: reasoning.blockId, delta: 'Inspect stable identities before rendering. ' })
    expect(kernel.lastEvent.contentPatch).toMatchObject({ kind: 'append-reasoning', blockId: 'reasoning' })

    const answer = appendMarkdownContent(kernel.getMessage(assistantIndex), 'A provider-normalized streamed answer. ')
    kernel.replaceCanonicalMessage(assistantIndex, answer.message, { kind: 'append-markdown', blockId: answer.blockId, delta: 'A provider-normalized streamed answer. ' })
    expect(kernel.lastEvent.contentPatch).toMatchObject({ kind: 'append-markdown', blockId: 'answer' })

    kernel.setAccounting({ inputTokens: 25, outputTokens: 19, cacheReadTokens: 44, cacheWriteTokens: 6, reasoningTokens: 13 }, { projectedTokens: 2_100, contextWindow: 128_000 })
    expect(kernel.usage).toEqual({ inputTokens: 25, outputTokens: 19, cacheReadTokens: 44, cacheWriteTokens: 6, reasoningTokens: 13 })

    const settled = settleReasoning(kernel.getMessage(assistantIndex), 'complete')
    kernel.replaceCanonicalMessage(assistantIndex, { ...settled, live: false })
    kernel.finishExecution('completed')
    expect(kernel.status).toBe('idle')
    expect(kernel.lastTurnReason).toBe('completed')
    expect(kernel.getMessage(assistantIndex)).toMatchObject({ live: false, blocks: [{ type: 'reasoning', data: { status: 'complete' } }, { type: 'markdown' }] })
  })

  it('delivers every semantic mutation in producer order while summary notification stays coalesced', async () => {
    const descriptor = { id: 'events', title: 'Events', status: 'idle' as const, logicalCount: 0 }
    const kernel = new ConversationSessionKernel(descriptor, new SyntheticHistoryAdapter('events', 0, 4))
    const events: string[] = []
    let summaries = 0
    const unsubscribeEvents = kernel.subscribeEvents(event => events.push(event.contentPatch?.kind ?? event.kind))
    const unsubscribeSummary = kernel.subscribe(() => { summaries += 1 })

    const index = appendTurn(kernel, 'first')
    kernel.startExecution(index)
    const reasoning = appendReasoningContent(kernel.getMessage(index), 'r', 1, 1)!
    kernel.replaceCanonicalMessage(index, reasoning.message, { kind: 'append-reasoning', blockId: reasoning.blockId, delta: 'r' })
    let answer = appendMarkdownContent(kernel.getMessage(index), 'a')
    kernel.replaceCanonicalMessage(index, answer.message, { kind: 'append-markdown', blockId: answer.blockId, delta: 'a' })
    answer = appendMarkdownContent(kernel.getMessage(index), 'b')
    kernel.replaceCanonicalMessage(index, answer.message, { kind: 'append-markdown', blockId: answer.blockId, delta: 'b' })

    expect(events).toEqual(['append', 'status', 'append-reasoning', 'append-markdown', 'append-markdown'])
    expect(summaries).toBe(0)
    await Promise.resolve()
    expect(summaries).toBe(1)
    unsubscribeEvents()
    unsubscribeSummary()
  })

  it('queues follow-ups while working instead of coupling them to the viewport', () => {
    const descriptor = { id: 'queue', title: 'Queue', status: 'idle' as const, logicalCount: 0 }
    const kernel = new ConversationSessionKernel(descriptor, new SyntheticHistoryAdapter('queue', 0, 4))
    const execution = new SyntheticStreamController(kernel)
    expect(execution.submit('first')).toBe('started')
    expect(execution.submit('second')).toBe('queued')
    expect(kernel.queuedPrompts).toBe(1)
    execution.dispose()
  })

  it('records last-turn failure without making the historical session non-resumable', () => {
    const descriptor = { id: 'failed', title: 'Failed', status: 'idle' as const, logicalCount: 20, lastTurnReason: 'error' as const }
    const kernel = new ConversationSessionKernel(descriptor, new SyntheticHistoryAdapter('failed', 20, 4))
    const execution = new SyntheticStreamController(kernel)
    expect(execution.submit('retry with a new turn')).toBe('started')
    execution.fail({ code: 'PROVIDER_TIMEOUT', message: 'timeout', status: 504 })
    expect(kernel.status).toBe('idle')
    expect(kernel.lastTurnReason).toBe('error')
    expect(kernel.lastFailure?.code).toBe('PROVIDER_TIMEOUT')
    expect(execution.submit('continue after failure')).toBe('started')
    expect(kernel.lastFailure).toBeNull()
    execution.dispose()
  })
})
