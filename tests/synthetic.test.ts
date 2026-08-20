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

  it('generates all renderer kinds across a deterministic sample', () => {
    const source = new SyntheticConversationSource(1000)
    const kinds = new Set(Array.from({ length: 1000 }, (_, i) => source.getMessage(i).kind))
    expect(kinds).toEqual(new Set(['text', 'markdown', 'code', 'image', 'html', 'tool', 'diff']))
  })

  it('splits long logical messages into stable render units', () => {
    const source = new SyntheticConversationSource(1000)
    const candidate = Array.from({ length: 1000 }, (_, i) => source.getMessage(i)).find(message => {
      if (message.kind !== 'markdown' && message.kind !== 'diff') return false
      return projectMessage(message).length > 1
    })
    expect(candidate).toBeDefined()
    const first = projectMessage(candidate!)
    const second = projectMessage(candidate!)
    expect(first.length).toBeGreaterThan(1)
    expect(first.map(unit => unit.id)).toEqual(second.map(unit => unit.id))
  })
})
