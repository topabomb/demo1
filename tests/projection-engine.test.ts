import { describe, expect, it } from 'vitest'
import { block, type LogicalMessage } from '../src/engine/model/conversation'
import { ProjectionEngine } from '../src/engine/presentation/projection-engine'

function live(markdown: string, revision: number): LogicalMessage {
  return {
    id: 's:m-1', index: 1, turnId: 't', stepId: 't:s0', role: 'assistant',
    revision, live: true,
    blocks: [block('answer', 'markdown', { markdown }, revision)],
  }
}

function mixed(reasoning: string, markdown: string, revision: number): LogicalMessage {
  return {
    id: 's:m-mixed', index: 2, turnId: 't-mixed', stepId: 't-mixed:s0', role: 'assistant',
    revision, live: true,
    blocks: [
      block('reasoning', 'reasoning', { text: reasoning, defaultOpen: false, status: 'streaming' }, revision),
      block('answer', 'markdown', { markdown }, revision),
    ],
  }
}

describe('ProjectionEngine', () => {
  it('memoizes unchanged hot messages instead of re-projecting on refresh', () => {
    const engine = new ProjectionEngine(undefined, 256)
    const message = live('hello', 0)
    const first = engine.projectMessage(message)
    const second = engine.projectMessage(message)
    expect(second[0]).toBe(first[0])
    expect(engine.stats.fullProjects).toBe(1)
    expect(engine.stats.cacheHits).toBe(1)
  })

  it('re-chunks only the mutable Markdown tail on append events', () => {
    const engine = new ProjectionEngine(undefined, 256)
    const prefix = `${'stable prefix paragraph '.repeat(310)}\n\n`
    const initial = live(`${prefix}tail`, 0)
    const before = engine.projectMessage(initial)
    expect(before.length).toBeGreaterThan(1)
    const settled = before[0]!

    const delta = '\n\nnew streamed tail'
    const next = live(`${prefix}tail${delta}`, 1)
    const after = engine.appendMarkdownDelta(next, 'answer', delta)

    expect(after[0]).toBe(settled)
    expect(after.at(-1)?.payload.markdown).toContain('new streamed tail')
    expect(engine.stats.fullProjects).toBe(1)
    expect(engine.stats.incrementalPatches).toBe(1)
  })

  it('updates Markdown continuation metadata when a streamed append creates a new unit', () => {
    const engine = new ProjectionEngine(undefined, 256)
    const initialText = `${'first paragraph '.repeat(330)}\n\n${'tail '.repeat(40)}`
    const initial = live(initialText, 0)
    const before = engine.projectMessage(initial)
    const oldTail = before.at(-1)!

    const delta = `\n\n${'new section '.repeat(600)}`
    const after = engine.appendMarkdownDelta(live(`${initialText}${delta}`, 1), 'answer', delta)
    const nextOldTail = after.find(unit => unit.id === oldTail.id)!

    expect(after.length).toBeGreaterThan(before.length)
    expect(nextOldTail).not.toBe(oldTail)
    expect(Number(nextOldTail.payload.partIndex)).toBeLessThan(Number(nextOldTail.payload.partCount) - 1)
    expect(after.at(-1)?.payload.partCount).toBe(after.filter(unit => unit.blockId === 'answer').length)
  })

  it('patches reasoning inside a mixed live message without invalidating the answer sibling', () => {
    const engine = new ProjectionEngine(undefined, 256)
    const before = engine.projectMessage(mixed('inspect ', 'stable answer', 0))
    const reasoningBefore = before.find(unit => unit.blockId === 'reasoning')!
    const answerBefore = before.find(unit => unit.blockId === 'answer')!

    const delta = 'then verify '
    const after = engine.appendReasoningDelta(mixed(`inspect ${delta}`, 'stable answer', 1), 'reasoning', delta)
    const reasoningAfter = after.find(unit => unit.blockId === 'reasoning')!
    const answerAfter = after.find(unit => unit.blockId === 'answer')!

    expect(reasoningAfter.id).toBe(reasoningBefore.id)
    expect(reasoningAfter).not.toBe(reasoningBefore)
    expect(reasoningAfter.payload.text).toBe(`inspect ${delta}`)
    expect(answerAfter).toBe(answerBefore)
    expect(engine.stats.fullProjects).toBe(1)
    expect(engine.stats.incrementalPatches).toBe(1)
  })

  it('patches Markdown inside a mixed live message while preserving reasoning identity', () => {
    const engine = new ProjectionEngine(undefined, 256)
    const before = engine.projectMessage(mixed('stable reasoning', 'answer ', 0))
    const reasoningBefore = before.find(unit => unit.blockId === 'reasoning')!
    const delta = 'continues'
    const after = engine.appendMarkdownDelta(mixed('stable reasoning', `answer ${delta}`, 1), 'answer', delta)

    expect(after.find(unit => unit.blockId === 'reasoning')).toBe(reasoningBefore)
    expect(after.find(unit => unit.blockId === 'answer')?.payload.markdown).toContain('continues')
    expect(engine.stats.fullProjects).toBe(1)
    expect(engine.stats.incrementalPatches).toBe(1)
  })

  it('keeps its rebuildable cache bounded independently of total history', () => {
    const engine = new ProjectionEngine(undefined, 128)
    for (let i = 0; i < 300; i += 1) {
      engine.projectMessage({
        id: `m-${i}`, index: i, turnId: `t-${i}`, role: 'assistant', revision: 0,
        blocks: [block('answer', 'markdown', { markdown: `message ${i}` })],
      })
    }
    expect(engine.stats.cacheSize).toBe(128)
    expect(engine.stats.evictions).toBeGreaterThan(0)
  })
})
