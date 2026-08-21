import { describe, expect, it } from 'vitest'
import { block, type LogicalMessage } from '../src/model/conversation'
import { ProjectionEngine } from '../src/presentation/projection-engine'

function live(markdown: string, revision: number): LogicalMessage {
  return {
    id: 's:m-1', index: 1, turnId: 't', role: 'assistant', seed: 1, intensity: 1,
    revision, live: true,
    blocks: [block('answer', 'markdown', { markdown }, revision)],
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

  it('keeps its rebuildable cache bounded independently of total history', () => {
    const engine = new ProjectionEngine(undefined, 128)
    for (let i = 0; i < 300; i += 1) {
      engine.projectMessage({
        id: `m-${i}`, index: i, turnId: `t-${i}`, role: 'assistant', seed: i, intensity: 1, revision: 0,
        blocks: [block('answer', 'markdown', { markdown: `message ${i}` })],
      })
    }
    expect(engine.stats.cacheSize).toBe(128)
    expect(engine.stats.evictions).toBeGreaterThan(0)
  })
})
