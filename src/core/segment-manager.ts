import type { SegmentRange } from './types'

export class SegmentManager {
  private _range: SegmentRange

  constructor(
    readonly totalMessages: number,
    readonly capacity = 2048,
    readonly shift = 512,
    initialReader = totalMessages - 1,
  ) {
    // ViewportSnapshot.logicalPosition is the last visible logical message, not
    // the center of a window. Initial/cold-rehydrated ranges therefore end at
    // the reader. Explicit far jumps use around() because they intentionally
    // create a fresh centered navigation window.
    this._range = this.endingAt(initialReader)
  }

  get range(): SegmentRange { return { ...this._range } }

  endingAt(index: number): SegmentRange {
    if (this.totalMessages <= 0) return { start: 0, end: 0 }
    const reader = Math.max(0, Math.min(this.totalMessages - 1, Math.floor(index)))
    const end = reader + 1
    return { start: Math.max(0, end - this.capacity), end }
  }

  around(index: number): SegmentRange {
    const center = Math.max(0, Math.min(this.totalMessages - 1, Math.floor(index)))
    const maxStart = Math.max(0, this.totalMessages - this.capacity)
    const start = Math.max(0, Math.min(maxStart, center - Math.floor(this.capacity / 2)))
    return { start, end: Math.min(this.totalMessages, start + this.capacity) }
  }

  jump(index: number): SegmentRange {
    this._range = this.around(index)
    return this.range
  }

  shiftBackward(): SegmentRange {
    const start = Math.max(0, this._range.start - this.shift)
    this._range = { start, end: Math.min(this.totalMessages, start + this.capacity) }
    return this.range
  }

  shiftForward(): SegmentRange {
    const maxStart = Math.max(0, this.totalMessages - this.capacity)
    const start = Math.min(maxStart, this._range.start + this.shift)
    this._range = { start, end: Math.min(this.totalMessages, start + this.capacity) }
    return this.range
  }
}
