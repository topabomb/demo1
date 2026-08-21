import { SyntheticConversationSource } from '../core/synthetic'
import type { LogicalMessage } from '../core/types'
import type { ConversationHistoryAdapter } from './contracts'

export class SyntheticHistoryAdapter implements ConversationHistoryAdapter {
  readonly #source: SyntheticConversationSource

  constructor(
    public readonly sessionId: string,
    public readonly count: number,
    seedOffset = 0,
    liveTail = false,
  ) {
    this.#source = new SyntheticConversationSource(count, sessionId, seedOffset, liveTail)
  }

  loadRange(start: number, count: number): readonly LogicalMessage[] {
    return this.#source.getRange(start, count)
  }
}
