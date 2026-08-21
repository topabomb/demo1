import { describe, expect, it } from 'vitest'
import { ConversationSessionRuntime, SHIFT_MESSAGES, WINDOW_MESSAGES } from '../src/conversation/session-runtime'
import { ConversationSessionKernel } from '../src/conversation/session-kernel'
import { SyntheticHistoryAdapter } from '../src/conversation/synthetic-adapter'

function runtimeAt(position: number, status: 'idle' | 'working' = 'idle') {
  const descriptor = { id: 'identity-test', title: 'identity test', age: 'now', status, logicalCount: 1_000_000 } as const
  const kernel = new ConversationSessionKernel(
    descriptor,
    new SyntheticHistoryAdapter(descriptor.id, descriptor.logicalCount, 73, status === 'working'),
    73,
  )
  const runtime = new ConversationSessionRuntime(kernel, {
    logicalPosition: position,
    anchorUnitId: null,
    anchorOffsetPx: 0,
    followTail: status === 'working',
    atVisualBottom: position === descriptor.logicalCount - 1,
    draftText: '',
  })
  return { kernel, runtime }
}

describe('ConversationSessionRuntime', () => {
  it('projects only the incoming slice and retains RenderUnit objects on prepend', () => {
    const { runtime } = runtimeAt(500_000)
    const old = [...runtime.activeUnits]
    const oldRange = { ...runtime.range }
    const plan = runtime.planShiftBackward()!
    expect(plan.next.end - plan.next.start).toBe(WINDOW_MESSAGES)
    expect(oldRange.start - plan.next.start).toBe(SHIFT_MESSAGES)
    const retained = old.find(unit => unit.messageIndex >= oldRange.start && unit.messageIndex < plan.next.end)!
    expect(plan.final.find(unit => unit.id === retained.id)).toBe(retained)
    runtime.dispose()
  })

  it('keeps a history reader stable while the kernel grows off-screen', async () => {
    const { kernel, runtime } = runtimeAt(500_000)
    const before = runtime.currentLogicalPosition
    kernel.beginTurn('background work')
    await Promise.resolve()
    expect(runtime.logicalCount).toBe(1_000_002)
    expect(runtime.currentLogicalPosition).toBe(before)
    expect(runtime.messagesAfterCurrent).toBeGreaterThan(500_000)
    runtime.dispose()
  })

  it('rehydrates appended turns from the lightweight kernel', async () => {
    const { kernel, runtime } = runtimeAt(999_999)
    kernel.beginTurn('continue the old session')
    kernel.appendAssistantDelta('new answer')
    await Promise.resolve()
    runtime.jump(kernel.count - 1)
    expect(runtime.projection.order.some(id => id.includes('runtime-0'))).toBe(true)
    expect(runtime.logicalCount).toBe(1_000_002)
    runtime.dispose()
  })
})
