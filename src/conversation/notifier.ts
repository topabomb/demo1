export type Unsubscribe = () => void

/**
 * Framework-free microtask notifier inspired by DSH's projection layer: many
 * backend/model mutations in one turn collapse into one publication. It keeps
 * high-frequency stream events out of the UI framework scheduler.
 */
export class BatchedNotifier {
  #listeners = new Set<() => void>()
  #scheduled = false

  subscribe(listener: () => void): Unsubscribe {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  markDirty(): void {
    if (this.#scheduled) return
    this.#scheduled = true
    queueMicrotask(() => {
      this.#scheduled = false
      for (const listener of this.#listeners) listener()
    })
  }

  notifyNow(): void {
    this.#scheduled = false
    for (const listener of this.#listeners) listener()
  }

  get listenerCount(): number {
    return this.#listeners.size
  }
}
