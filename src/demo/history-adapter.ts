import type { ConversationHistoryAdapter } from '../conversation/contracts'
import type { LogicalMessage } from '../model/conversation'
import { SyntheticConversationSource } from './synthetic'

/** Demo-only cold-history adapter. Real products replace this port with DB/network paging. */
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
