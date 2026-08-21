import type { ConversationSource, LogicalMessage, LogicalRole, RenderKind } from './types'
import { hash32, intBetween } from './prng'

interface PatternEntry {
  role: LogicalRole
  kind: RenderKind
  variant: string
}

const TURN_PATTERN: readonly PatternEntry[] = [
  { role: 'user', kind: 'markdown', variant: 'user-request' },
  { role: 'assistant', kind: 'thinking', variant: 'analysis' },
  { role: 'assistant', kind: 'tool', variant: 'call:read_file' },
  { role: 'tool', kind: 'tool', variant: 'result:read_file' },
  { role: 'assistant', kind: 'thinking', variant: 'analysis' },
  { role: 'assistant', kind: 'tool', variant: 'call:search' },
  { role: 'tool', kind: 'tool', variant: 'result:search' },
  { role: 'assistant', kind: 'markdown', variant: 'assistant-answer' },
  { role: 'user', kind: 'text', variant: 'user-followup' },
  { role: 'assistant', kind: 'thinking', variant: 'analysis' },
  { role: 'assistant', kind: 'code', variant: 'code-proposal' },
  { role: 'assistant', kind: 'markdown', variant: 'explanation' },
  { role: 'user', kind: 'markdown', variant: 'user-change-request' },
  { role: 'assistant', kind: 'thinking', variant: 'analysis' },
  { role: 'assistant', kind: 'tool', variant: 'call:edit_file' },
  { role: 'tool', kind: 'tool', variant: 'result:edit_file' },
  { role: 'assistant', kind: 'tool', variant: 'call:test' },
  { role: 'tool', kind: 'tool', variant: 'result:test' },
  { role: 'assistant', kind: 'diff', variant: 'patch' },
  { role: 'assistant', kind: 'markdown', variant: 'verification' },
  { role: 'user', kind: 'text', variant: 'user-visual-request' },
  { role: 'assistant', kind: 'image', variant: 'image-output' },
  { role: 'assistant', kind: 'html', variant: 'artifact-preview' },
  { role: 'assistant', kind: 'markdown', variant: 'turn-summary' },
]

export class SyntheticConversationSource implements ConversationSource {
  readonly count: number
  #scope: string
  #seedOffset: number
  #liveTail: boolean

  constructor(count: number, scope = '', seedOffset = 0, liveTail = false) {
    this.count = count
    this.#scope = scope
    this.#seedOffset = seedOffset
    this.#liveTail = liveTail
  }

  getMessage(index: number): LogicalMessage {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) {
      throw new RangeError(`message index ${index} outside 0..${this.count - 1}`)
    }

    const seed = hash32(index + 0x51f15e + this.#seedOffset)
    const messageId = this.#scope ? `${this.#scope}:m-${index}` : `m-${index}`
    const turnId = this.#scope
      ? `${this.#scope}:turn-${Math.floor(index / TURN_PATTERN.length)}`
      : `turn-${Math.floor(index / TURN_PATTERN.length)}`

    if (this.#liveTail && index === this.count - 1) {
      return {
        id: messageId,
        index,
        turnId,
        role: 'assistant',
        kind: 'markdown',
        seed,
        intensity: 9,
        live: true,
        variant: 'live-tail',
      }
    }

    const pattern = TURN_PATTERN[index % TURN_PATTERN.length]!
    return {
      id: messageId,
      index,
      turnId,
      role: pattern.role,
      kind: pattern.kind,
      seed,
      intensity: intBetween(seed + 31, 1, 10),
      variant: pattern.variant,
    }
  }

  getRange(start: number, count: number): LogicalMessage[] {
    const safeStart = Math.max(0, Math.min(start, this.count))
    const safeEnd = Math.max(safeStart, Math.min(this.count, safeStart + Math.max(0, count)))
    const result = new Array<LogicalMessage>(safeEnd - safeStart)
    for (let i = safeStart; i < safeEnd; i += 1) result[i - safeStart] = this.getMessage(i)
    return result
  }
}
