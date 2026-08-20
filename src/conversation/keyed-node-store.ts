import type { RenderUnit } from '../core/types'
import type { ConversationProjectionStore } from './contracts'
import { BatchedNotifier, type Unsubscribe } from './notifier'

/**
 * Framework-free conversation projection.
 *
 * `order` changes only when rows enter/leave/move. Streaming or tool lifecycle
 * changes replace one node by stable key and notify only subscribers of that key.
 * This is the same render-economics principle we wanted to borrow from DSH.
 */
export class KeyedConversationProjection implements ConversationProjectionStore {
  #order: readonly string[] = Object.freeze([] as string[])
  #nodes = new Map<string, RenderUnit>()
  #orderNotifier = new BatchedNotifier()
  #nodeNotifiers = new Map<string, BatchedNotifier>()

  get order(): readonly string[] {
    return this.#order
  }

  get size(): number {
    return this.#order.length
  }

  getNode(id: string): RenderUnit | undefined {
    return this.#nodes.get(id)
  }

  subscribeOrder(listener: () => void): Unsubscribe {
    return this.#orderNotifier.subscribe(listener)
  }

  subscribeNode(id: string, listener: () => void): Unsubscribe {
    let notifier = this.#nodeNotifiers.get(id)
    if (!notifier) {
      notifier = new BatchedNotifier()
      this.#nodeNotifiers.set(id, notifier)
    }
    const unsubscribe = notifier.subscribe(listener)
    return () => {
      unsubscribe()
      if (notifier?.listenerCount === 0) this.#nodeNotifiers.delete(id)
    }
  }

  /** Replace the visible/hot logical order while retaining unchanged node objects. */
  replace(units: readonly RenderUnit[]): void {
    const nextIds = units.map(unit => unit.id)
    const orderChanged = !sameOrder(this.#order, nextIds)
    const live = new Set(nextIds)

    for (const unit of units) {
      const previous = this.#nodes.get(unit.id)
      if (previous === unit) continue
      if (previous && previous.revision === unit.revision && previous.kind === unit.kind) continue
      this.#nodes.set(unit.id, unit)
      this.#nodeNotifiers.get(unit.id)?.markDirty()
    }

    for (const id of this.#nodes.keys()) {
      if (!live.has(id)) this.#nodes.delete(id)
    }

    if (orderChanged) {
      this.#order = Object.freeze(nextIds)
      this.#orderNotifier.markDirty()
    }
  }

  /** Patch one stable node without invalidating the list order. */
  patch(unit: RenderUnit): void {
    if (!this.#nodes.has(unit.id)) return
    this.#nodes.set(unit.id, unit)
    this.#nodeNotifiers.get(unit.id)?.markDirty()
  }

  clear(): void {
    if (this.#order.length === 0) return
    this.#order = Object.freeze([] as string[])
    this.#nodes.clear()
    this.#orderNotifier.markDirty()
  }
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false
  return true
}
