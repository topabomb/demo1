import { describe, expect, it } from 'vitest'
import { ConversationSessionRuntime, SHIFT_MESSAGES, WINDOW_MESSAGES } from '../src/conversation/session-runtime'
import { SyntheticHistoryAdapter } from '../src/conversation/synthetic-adapter'

function runtimeAt(position: number, status: 'running' | 'completed' = 'completed') {
  const descriptor = {
    id: 'identity-test',
    title: 'identity test',
    age: 'now',
    status,
    logicalCount: 1_000_000,
  }
  return new ConversationSessionRuntime(
    descriptor,
    new SyntheticHistoryAdapter(descriptor.id, descriptor.logicalCount, 73),
    {
      logicalPosition: position,
      anchorUnitId: null,
      anchorOffsetPx: 0,
      followTail: status === 'running',
      atVisualBottom: position === descriptor.logicalCount - 1,
      draftText: '',
    },
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

  it('does not destroy live async tail state when the reader jumps into history', () => {
    const runtime = runtimeAt(999_999, 'running')
    const tail = runtime.activeUnits.find(unit => unit.messageIndex === 999_999)!
    const patched = {
      ...tail,
      revision: 7,
      payload: { ...tail.payload, markdown: 'async text that arrived before navigation', live: true },
    }
    runtime.streamTarget = tail.id
    runtime.streamBaseUnit = tail
    runtime.streamChunkText = String(patched.payload.markdown)
    runtime.patchNode(patched)

    runtime.jump(500_000)
    expect(runtime.streamTarget).toBe(tail.id)
    expect(runtime.streamChunkText).toContain('async text')
    expect(runtime.range.start).toBeLessThanOrEqual(500_000)

    runtime.jump(999_999)
    runtime.refreshProjection()
    expect(runtime.projection.getNode(tail.id)?.revision).toBe(7)
    expect(runtime.projection.getNode(tail.id)?.payload.markdown).toContain('async text')
  })

  it('persists a per-session composer draft as lightweight semantic state', () => {
    const runtime = runtimeAt(500_000)
    runtime.setDraftText('line one\nline two\nline three')
    const snapshot = runtime.snapshot()
    expect(snapshot.draftText).toContain('line three')
    runtime.setDraftText('changed')
    runtime.rememberSnapshot(snapshot)
    expect(runtime.draftText).toBe('line one\nline two\nline three')
  })
})
