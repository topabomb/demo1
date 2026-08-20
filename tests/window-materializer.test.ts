import { describe, expect, it } from 'vitest'
import { SyntheticConversationSource } from '../src/core/synthetic'
import { WindowMaterializer } from '../src/core/window-materializer'

describe('WindowMaterializer', () => {
  it('keeps a bounded hot window while navigating a million logical messages', () => {
    const source = new SyntheticConversationSource(1_000_000)
    const window = new WindowMaterializer(source, 2048, 512, 500_000)
    expect(window.range.end - window.range.start).toBe(2048)
    expect(window.units.length).toBeLessThan(10_000)
    window.jump(900_000)
    expect(window.range.start).toBeLessThanOrEqual(900_000)
    expect(window.range.end).toBeGreaterThan(900_000)
  })

  it('preserves retained RenderUnit identity across incremental segment shifts', () => {
    const source = new SyntheticConversationSource(100_000)
    const window = new WindowMaterializer(source, 2048, 512, 50_000)
    const retained = window.units.find(unit => unit.messageIndex === window.range.start + 800)
    expect(retained).toBeDefined()
    window.shiftForward()
    const after = window.units.find(unit => unit.id === retained!.id)
    expect(after).toBe(retained)
  })

  it('materializes only the requested hot range within a practical budget', () => {
    const source = new SyntheticConversationSource(1_000_000)
    const start = performance.now()
    const window = new WindowMaterializer(source, 2048, 512, 999_000)
    const elapsed = performance.now() - start
    expect(window.units.length).toBeGreaterThan(2048)
    expect(elapsed).toBeLessThan(1500)
  })
})
