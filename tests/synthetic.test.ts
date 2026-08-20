import { describe, expect, it } from 'vitest'
import { SyntheticConversationSource } from '../src/core/synthetic'
import { projectMessage } from '../src/core/projector'

describe('SyntheticConversationSource', () => {
  it('addresses one million logical messages without materializing them', () => {
    const source = new SyntheticConversationSource(1_000_000)
    expect(source.count).toBe(1_000_000)
    expect(source.getMessage(543_210)).toEqual(source.getMessage(543_210))
    expect(source.getRange(900_000, 32)).toHaveLength(32)
    expect(Object.keys(source)).toEqual(['count'])
  })

  it('generates every renderer kind in deterministic agent turns', () => {
    const source = new SyntheticConversationSource(1000)
    const kinds = new Set(Array.from({ length: 1000 }, (_, i) => source.getMessage(i).kind))
    expect(kinds).toEqual(new Set(['text', 'markdown', 'thinking', 'code', 'image', 'html', 'tool', 'diff']))

    const turn = source.getRange(0, 20)
    expect(turn[0]).toMatchObject({ role: 'user', kind: 'markdown' })
    expect(turn[1]).toMatchObject({ role: 'assistant', kind: 'thinking' })
    expect(turn[2]).toMatchObject({ role: 'assistant', kind: 'tool', variant: 'call:read_file' })
    expect(turn[3]).toMatchObject({ role: 'tool', kind: 'tool', variant: 'result:read_file' })
    expect(turn[14]).toMatchObject({ role: 'assistant', kind: 'tool', variant: 'call:edit_file' })
    expect(turn[17]).toMatchObject({ role: 'tool', kind: 'tool', variant: 'result:test' })
    expect(turn[18]).toMatchObject({ role: 'assistant', kind: 'diff' })
  })

  it('keeps the global tail as a live assistant message', () => {
    const source = new SyntheticConversationSource(1_000_000)
    expect(source.getMessage(999_999)).toMatchObject({
      role: 'assistant',
      kind: 'markdown',
      live: true,
      variant: 'live-tail',
    })
  })

  it('splits unbounded content into stable bounded render units', () => {
    const source = new SyntheticConversationSource(1000)
    const candidate = Array.from({ length: 1000 }, (_, i) => source.getMessage(i)).find(message => {
      if (message.kind !== 'markdown' && message.kind !== 'diff' && message.kind !== 'code') return false
      return projectMessage(message).length > 1
    })
    expect(candidate).toBeDefined()
    const first = projectMessage(candidate!)
    const second = projectMessage(candidate!)
    expect(first.length).toBeGreaterThan(1)
    expect(first.map(unit => unit.id)).toEqual(second.map(unit => unit.id))
    expect(first.every(unit => unit.estimatePx < 2000)).toBe(true)
  })

  it('projects thinking and tools collapsed by default', () => {
    const source = new SyntheticConversationSource(1000)
    const thinking = projectMessage(source.getMessage(1))[0]!
    const call = projectMessage(source.getMessage(2))[0]!
    const result = projectMessage(source.getMessage(3))[0]!

    expect(thinking).toMatchObject({ kind: 'thinking', estimatePx: 72 })
    expect(thinking.payload.defaultOpen).toBe(false)
    expect(call.payload).toMatchObject({ phase: 'call', defaultOpen: false })
    expect(result.payload).toMatchObject({ phase: 'result', defaultOpen: false })
  })
})
