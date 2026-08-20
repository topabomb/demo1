import type { ConversationSource, LogicalMessage, RenderKind } from './types'
import { hash32, intBetween } from './prng'

const kinds: RenderKind[] = ['text', 'markdown', 'code', 'image', 'html', 'tool', 'diff']

export class SyntheticConversationSource implements ConversationSource {
  constructor(public readonly count: number) {}

  getMessage(index: number): LogicalMessage {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) {
      throw new RangeError(`message index ${index} outside 0..${this.count - 1}`)
    }
    const seed = hash32(index + 0x51f15e)
    const roleSelector = seed % 11
    const role: LogicalMessage['role'] = roleSelector < 3 ? 'user' : roleSelector === 10 ? 'tool' : 'assistant'
    const kind = kinds[hash32(seed + 17) % kinds.length]
    return {
      id: `m-${index}`,
      index,
      role,
      kind,
      seed,
      intensity: intBetween(seed + 31, 1, 10),
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
