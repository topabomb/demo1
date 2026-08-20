import { describe, expect, it } from 'vitest'
import { ConversationSessionRuntime, SHIFT_MESSAGES, WINDOW_MESSAGES } from '../src/conversation/session-runtime'
import { SyntheticHistoryAdapter } from '../src/conversation/synthetic-adapter'

function runtimeAt(position: number) {
  const descriptor = {
    id: 'identity-test',
    title: 'identity test',
    age: 'now',
    status: 'completed' as const,
    logicalCount: 1_000_000,
  }
  return new ConversationSessionRuntime(
    descriptor,
    new SyntheticHistoryAdapter(descriptor.id, descriptor.logicalCount, 73),
    { logicalPosition: position, anchorUnitId: null, anchorOffsetPx: 0, followTail: false, atVisualBottom: false },
  )
}

describe('ConversationSessionRuntime segment shifts', () => {
  it('projects only the incoming slice and retains existing RenderUnit objects on prepend', () => {
    const runtime = runtimeAt(500_000)
    const old = [...runtime.activeUnits]
    const oldRange = { ...runtime.range }
    const plan = runtime.planShiftBackward()
    expect(plan).not.toBeNull()
    expect(plan!.next.end - plan!.next.start).toBe(WINDOW_MESSAGES)
    expect(oldRange.start - plan!.next.start).toBe(SHIFT_MESSAGES)

    const retained = old.find(unit => unit.messageIndex >= oldRange.start && unit.messageIndex < plan!.next.end)
    expect(retained).toBeDefined()
    const same = plan!.final.find(unit => unit.id === retained!.id)
    expect(same).toBe(retained)

    const incomingMessages = new Set(plan!.final.filter(unit => unit.messageIndex < oldRange.start).map(unit => unit.messageIndex))
    expect(incomingMessages.size).toBe(SHIFT_MESSAGES)
  })

  it('retains existing RenderUnit objects on forward shift as well', () => {
    const runtime = runtimeAt(500_000)
    const old = [...runtime.activeUnits]
    const oldRange = { ...runtime.range }
    const plan = runtime.planShiftForward()
    expect(plan).not.toBeNull()

    const retained = old.find(unit => unit.messageIndex >= plan!.next.start && unit.messageIndex < oldRange.end)
    expect(retained).toBeDefined()
    expect(plan!.final.find(unit => unit.id === retained!.id)).toBe(retained)

    const incomingMessages = new Set(plan!.final.filter(unit => unit.messageIndex >= oldRange.end).map(unit => unit.messageIndex))
    expect(incomingMessages.size).toBe(SHIFT_MESSAGES)
  })
})
