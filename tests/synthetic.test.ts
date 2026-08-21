import { describe, expect, it } from 'vitest'
import { SyntheticConversationSource } from '../src/core/synthetic'
import { projectMessage } from '../src/core/projector'

describe('SyntheticConversationSource', () => {
  it('addresses one million messages without materializing them', () => {
    const source = new SyntheticConversationSource(1_000_000)
    expect(source.count).toBe(1_000_000)
    expect(source.getMessage(543_210)).toEqual(source.getMessage(543_210))
    expect(source.getRange(900_000, 32)).toHaveLength(32)
  })

  it('keeps historical tails idle unless the adapter explicitly models a live run', () => {
    expect(new SyntheticConversationSource(10).getMessage(9).live).not.toBe(true)
    expect(new SyntheticConversationSource(10, 'live', 0, true).getMessage(9).live).toBe(true)
  })

  it('generates every renderer kind and splits unbounded synthetic content', () => {
    const source = new SyntheticConversationSource(1000)
    const kinds = new Set(Array.from({ length: 1000 }, (_, i) => source.getMessage(i).kind))
    expect(kinds).toEqual(new Set(['text', 'markdown', 'thinking', 'code', 'image', 'html', 'tool', 'diff']))
    const candidate = Array.from({ length: 1000 }, (_, i) => source.getMessage(i)).find(message => {
      if (message.kind !== 'markdown' && message.kind !== 'diff' && message.kind !== 'code') return false
      return projectMessage(message).length > 1
    })
    expect(candidate).toBeDefined()
  })
})
