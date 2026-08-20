import { PageHeightIndex, DEFAULT_PAGE_SIZE } from '../core/page-index'
import { projectMessages } from '../core/projector'
import { SegmentManager } from '../core/segment-manager'
import type { RenderUnit, SegmentRange } from '../core/types'
import type { ConversationDescriptor, ConversationHistoryAdapter, ViewportSnapshot } from './contracts'
import { KeyedConversationProjection } from './keyed-node-store'
import { BatchedNotifier, type Unsubscribe } from './notifier'

export const WINDOW_MESSAGES = 2048
export const SHIFT_MESSAGES = 512

export interface ShiftPlan {
  direction: 'backward' | 'forward'
  previous: SegmentRange
  next: SegmentRange
  intermediate: readonly RenderUnit[]
  final: readonly RenderUnit[]
}

export class ConversationSessionRuntime {
  readonly projection = new KeyedConversationProjection()
  readonly pageHeights: PageHeightIndex
  readonly descriptor: ConversationDescriptor
  readonly adapter: ConversationHistoryAdapter
  readonly segment: SegmentManager

  #stateNotifier = new BatchedNotifier()
  #activeUnits: RenderUnit[] = []
  #liveTailUnits: RenderUnit[] = []
  #snapshot: ViewportSnapshot

  virtualEpoch = 0
  shiftMode = false
  mountedRows = 0
  jumpInput: number
  currentLogicalPosition: number
  followTail: boolean
  atVisualBottom: boolean
  draftText: string
  streamRate = 20
  streamIngressTicks = 0
  streamRenderTicks = 0
  streamTarget: string | null = null
  streamChunkText = ''
  streamBaseUnit: RenderUnit | null = null
  pendingDelta = ''
  tailIntentGeneration = 0

  constructor(
    descriptor: ConversationDescriptor,
    adapter: ConversationHistoryAdapter,
    snapshot: ViewportSnapshot,
  ) {
    this.descriptor = descriptor
    this.adapter = adapter
    this.pageHeights = new PageHeightIndex(adapter.count)
    const position = clampIndex(snapshot.logicalPosition, adapter.count)
    this.segment = new SegmentManager(adapter.count, WINDOW_MESSAGES, SHIFT_MESSAGES, position)
    this.#snapshot = { ...snapshot, logicalPosition: position }
    this.jumpInput = position
    this.currentLogicalPosition = position
    this.followTail = snapshot.followTail
    this.atVisualBottom = snapshot.atVisualBottom && this.segment.range.end === adapter.count
    this.draftText = snapshot.draftText
    this.#activeUnits = this.#materialize(this.segment.range)
    this.#refreshPageEstimates()
    this.projection.replace(this.#activeUnits)
  }

  get id(): string { return this.descriptor.id }
  get title(): string { return this.descriptor.title }
  get status(): ConversationDescriptor['status'] { return this.descriptor.status }
  get logicalCount(): number { return this.adapter.count }
  get range(): SegmentRange { return this.segment.range }
  get activeUnits(): readonly RenderUnit[] { return this.#activeUnits }
  get liveTailUnits(): readonly RenderUnit[] { return this.#liveTailUnits }
  get displayUnits(): readonly RenderUnit[] { return this.range.end === this.logicalCount ? [...this.#activeUnits, ...this.#liveTailUnits] : this.#activeUnits }
  get messagesAfterCurrent(): number { return Math.max(0, this.logicalCount - 1 - this.currentLogicalPosition) }
  get estimatedTotalHeight(): number { return this.pageHeights.estimatedTotalHeight() }

  subscribeState(listener: () => void): Unsubscribe {
    return this.#stateNotifier.subscribe(listener)
  }

  markStateDirty(): void {
    this.#stateNotifier.markDirty()
  }

  setDraftText(value: string): void {
    if (this.draftText === value) return
    this.draftText = value
    this.#stateNotifier.markDirty()
  }

  snapshot(anchorUnitId = this.#snapshot.anchorUnitId, anchorOffsetPx = this.#snapshot.anchorOffsetPx): ViewportSnapshot {
    return {
      logicalPosition: clampIndex(this.currentLogicalPosition, this.logicalCount),
      anchorUnitId,
      anchorOffsetPx,
      followTail: this.followTail,
      atVisualBottom: this.atVisualBottom,
      draftText: this.draftText,
    }
  }

  rememberSnapshot(snapshot: ViewportSnapshot): void {
    this.#snapshot = { ...snapshot, logicalPosition: clampIndex(snapshot.logicalPosition, this.logicalCount) }
    this.draftText = snapshot.draftText
  }

  get rememberedSnapshot(): ViewportSnapshot {
    return { ...this.#snapshot, draftText: this.draftText }
  }

  setReaderPosition(index: number, atVisualBottom: boolean): void {
    this.currentLogicalPosition = clampIndex(index, this.logicalCount)
    this.atVisualBottom = atVisualBottom && this.range.end === this.logicalCount
    this.#stateNotifier.markDirty()
  }

  setFollowTail(value: boolean): void {
    if (this.followTail === value) return
    this.followTail = value
    this.tailIntentGeneration += 1
    this.#stateNotifier.markDirty()
  }

  jump(index: number): void {
    const target = clampIndex(index, this.logicalCount)
    this.segment.jump(target)
    this.#activeUnits = this.#materialize(this.range)
    this.#liveTailUnits = []
    this.streamTarget = null
    this.streamBaseUnit = null
    this.streamChunkText = ''
    this.pendingDelta = ''
    this.currentLogicalPosition = target
    this.jumpInput = target
    this.followTail = target === this.logicalCount - 1
    this.atVisualBottom = target === this.logicalCount - 1
    this.virtualEpoch += 1
    this.#refreshPageEstimates()
    this.projection.replace(this.#activeUnits)
    this.#stateNotifier.markDirty()
  }

  planShiftBackward(): ShiftPlan | null {
    const previous = { ...this.range }
    const next = this.segment.shiftBackward()
    if (next.start === previous.start) return null

    const incoming = this.#materializeRange(next.start, previous.start)
    const retained = this.#activeUnits.filter(unit => unit.messageIndex < next.end)
    const final = [...incoming, ...retained]
    return {
      direction: 'backward',
      previous,
      next: { ...next },
      intermediate: [...incoming, ...this.#activeUnits],
      final,
    }
  }

  planShiftForward(): ShiftPlan | null {
    const previous = { ...this.range }
    const next = this.segment.shiftForward()
    if (next.start === previous.start) return null

    const incoming = this.#materializeRange(previous.end, next.end)
    const retained = this.#activeUnits.filter(unit => unit.messageIndex >= next.start)
    const final = [...retained, ...incoming]
    return {
      direction: 'forward',
      previous,
      next: { ...next },
      intermediate: [...this.#activeUnits, ...incoming],
      final,
    }
  }

  applyIntermediate(units: readonly RenderUnit[], shiftMode: boolean): void {
    this.shiftMode = shiftMode
    this.projection.replace(units)
    this.#stateNotifier.markDirty()
  }

  commitShift(plan: ShiftPlan, shiftMode: boolean): void {
    this.shiftMode = shiftMode
    this.#activeUnits = [...plan.final]
    this.#refreshPageEstimates()
    this.projection.replace(this.displayUnits)
    this.#stateNotifier.markDirty()
  }

  finishShift(): void {
    this.shiftMode = false
    this.#stateNotifier.markDirty()
  }

  appendLiveChunk(unit: RenderUnit): void {
    this.#liveTailUnits = [...this.#liveTailUnits, unit]
    this.projection.replace(this.displayUnits)
    this.#stateNotifier.markDirty()
  }

  patchNode(unit: RenderUnit): void {
    this.projection.patch(unit)
    this.streamRenderTicks += 1
    this.#stateNotifier.markDirty()
  }

  clearLiveTail(): void {
    if (this.#liveTailUnits.length === 0) return
    this.#liveTailUnits = []
    this.projection.replace(this.#activeUnits)
    this.#stateNotifier.markDirty()
  }

  #materialize(range: SegmentRange): RenderUnit[] {
    return this.#materializeRange(range.start, range.end)
  }

  #materializeRange(start: number, end: number): RenderUnit[] {
    if (end <= start) return []
    return projectMessages([...this.adapter.loadRange(start, end - start)])
  }

  #refreshPageEstimates(): void {
    const byPage = new Map<number, { height: number; messages: Set<number> }>()
    for (const unit of this.#activeUnits) {
      const page = Math.floor(unit.messageIndex / DEFAULT_PAGE_SIZE)
      let bucket = byPage.get(page)
      if (!bucket) {
        bucket = { height: 0, messages: new Set() }
        byPage.set(page, bucket)
      }
      bucket.height += unit.estimatePx
      bucket.messages.add(unit.messageIndex)
    }
    for (const [page, bucket] of byPage) {
      const scale = DEFAULT_PAGE_SIZE / Math.max(1, bucket.messages.size)
      this.pageHeights.updatePage(page, bucket.height * scale)
    }
  }
}

function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(Math.max(0, count - 1), Math.floor(Number(index) || 0)))
}
