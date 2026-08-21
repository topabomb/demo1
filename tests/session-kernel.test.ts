import { describe, expect, it } from 'vitest'
import { ConversationSessionKernel } from '../src/conversation/session-kernel'
import { SyntheticHistoryAdapter } from '../src/conversation/synthetic-adapter'
import { SyntheticStreamController } from '../src/conversation/stream-controller'

describe('ConversationSessionKernel', () => {
  it('turns an idle historical conversation into a new resumable turn', () => {
    const descriptor = { id: 'resume', title: 'Resume', age: 'now', status: 'idle' as const, logicalCount: 100 }
    const kernel = new ConversationSessionKernel(descriptor, new SyntheticHistoryAdapter('resume', 100), 9)
    const execution = new SyntheticStreamController(kernel)
    expect(execution.submit('continue this task')).toBe('started')
    expect(kernel.count).toBe(102)
    expect(kernel.getMessage(100)).toMatchObject({ role: 'user', content: 'continue this task' })
    expect(kernel.getMessage(101)).toMatchObject({ role: 'assistant', live: true })
    execution.dispose()
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
})
