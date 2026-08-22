import { describe, expect, it } from 'vitest'
import {
  billedInputTokens,
  cacheHitPercent,
  contextOccupancyPercent,
  defaultTurnReason,
  deriveSessionIndicator,
} from '../src/engine/conversation/session-semantics'
import type { ConversationDescriptor, TokenUsage } from '../src/engine/conversation/contracts'

function descriptor(overrides: Partial<ConversationDescriptor>): ConversationDescriptor {
  return { id: 's', title: 'Session', status: 'idle', logicalCount: 10, ...overrides }
}

describe('session semantics', () => {
  it('separates live execution from the most recent settled turn outcome', () => {
    expect(deriveSessionIndicator(descriptor({ status: 'working', lastTurnReason: 'error' }))).toBe('working')
    expect(deriveSessionIndicator(descriptor({ status: 'idle', lastTurnReason: 'error' }))).toBe('failed')
    expect(deriveSessionIndicator(descriptor({ status: 'idle', lastTurnReason: 'completed' }))).toBe('completed')
    expect(deriveSessionIndicator(descriptor({ status: 'waiting', lastTurnReason: 'blocked' }))).toBe('blocked')
    expect(deriveSessionIndicator(descriptor({ status: 'interrupted', lastTurnReason: 'aborted' }))).toBe('interrupted')
    expect(deriveSessionIndicator(descriptor({ status: 'idle', lastTurnReason: 'max-tokens' }))).toBe('max-tokens')
    expect(deriveSessionIndicator(descriptor({ status: 'idle', lastTurnReason: null }))).toBe('idle')
  })

  it('never invents a completed Turn merely because execution is idle', () => {
    expect(defaultTurnReason('idle')).toBeNull()
    expect(defaultTurnReason('working')).toBeNull()
    expect(defaultTurnReason('waiting')).toBe('blocked')
    expect(defaultTurnReason('interrupted')).toBe('interrupted')
  })

  it('uses disjoint DSH-style prompt buckets for cache accounting', () => {
    const usage: TokenUsage = {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 300,
      cacheWriteTokens: 100,
      reasoningTokens: 12,
    }
    expect(billedInputTokens(usage)).toBe(500)
    expect(cacheHitPercent(usage)).toBe(60)
  })

  it('keeps context pressure independent of the viewport window', () => {
    expect(contextOccupancyPercent({ projectedTokens: 64_000, contextWindow: 128_000 })).toBe(50)
    expect(contextOccupancyPercent({ projectedTokens: 140_000, contextWindow: 128_000 })).toBe(100)
  })
})
