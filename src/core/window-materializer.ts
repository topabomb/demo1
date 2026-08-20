import { projectMessages } from './projector'
import { SegmentManager } from './segment-manager'
import type { ConversationSource, RenderUnit, SegmentRange } from './types'

export class WindowMaterializer {
  readonly manager: SegmentManager
  private _units: RenderUnit[] = []

  constructor(
    private readonly source: ConversationSource,
    capacity = 2048,
    shift = 512,
    initialCenter = source.count - 1,
  ) {
    this.manager = new SegmentManager(source.count, capacity, shift, initialCenter)
    this.materializeAll(this.manager.range)
  }

  get range(): SegmentRange { return this.manager.range }
  get units(): readonly RenderUnit[] { return this._units }

  jump(index: number): readonly RenderUnit[] {
    this.materializeAll(this.manager.jump(index))
    return this._units
  }

  shiftBackward(): readonly RenderUnit[] {
    const previous = this.range
    const next = this.manager.shiftBackward()
    if (next.start === previous.start) return this._units
    const incoming = projectMessages(this.source.getRange(next.start, previous.start - next.start))
    const kept = this._units.filter(unit => unit.messageIndex < next.end)
    this._units = [...incoming, ...kept]
    return this._units
  }

  shiftForward(): readonly RenderUnit[] {
    const previous = this.range
    const next = this.manager.shiftForward()
    if (next.start === previous.start) return this._units
    const incoming = projectMessages(this.source.getRange(previous.end, next.end - previous.end))
    const kept = this._units.filter(unit => unit.messageIndex >= next.start)
    this._units = [...kept, ...incoming]
    return this._units
  }

  private materializeAll(range: SegmentRange): void {
    this._units = projectMessages(this.source.getRange(range.start, range.end - range.start))
  }
}
