import { PageHeightIndex, DEFAULT_PAGE_SIZE } from '../core/page-index'
import { SegmentManager } from '../core/segment-manager'
import type { SegmentRange } from '../core/types'
import { ProjectionEngine } from '../presentation/projection-engine'
import type { RenderUnit } from '../presentation/render-unit'
import type { PendingInteraction, SessionStatus, ViewportSnapshot } from './contracts'
import { KeyedConversationProjection } from './keyed-node-store'
import { BatchedNotifier, type Unsubscribe } from './notifier'
import type { ConversationSessionKernel } from './session-kernel'

export const WINDOW_MESSAGES = 2048
export const SHIFT_MESSAGES = 512

export interface ShiftPlan {
  direction: 'backward' | 'forward'
  previous: SegmentRange
  next: SegmentRange
  intermediate: readonly RenderUnit[]
  final: readonly RenderUnit[]
}

export interface SessionUiSnapshot {
  rangeStart: number
  rangeEnd: number
  reader: number
  followTail: boolean
  atVisualBottom: boolean
  mountedRows: number
  streamRate: number
  streamIngressTicks: number
  streamRenderTicks: number
  streamTarget: string | null
  messagesAfter: number
  liveChunkCount: number
  projectionSize: number
  projectionCacheSize: number
  projectionCacheHits: number
  projectionFullProjects: number
  projectionIncrementalPatches: number
  virtualEpoch: number
  estimatedTotalHeight: number
  sessionStatus: SessionStatus
  queuedPrompts: number
  pendingInteraction: PendingInteraction | null
}

/**
 * Disposable hot presentation runtime. Execution/history remain in SessionKernel;
 * this object owns only bounded segment projection, keyed nodes and reader snapshot.
 */
export class ConversationSessionRuntime {
  readonly projection = new KeyedConversationProjection()
  readonly projectionEngine = new ProjectionEngine()
  readonly kernel: ConversationSessionKernel
  pageHeights: PageHeightIndex
  segment: SegmentManager

  #stateNotifier = new BatchedNotifier()
  #activeUnits: RenderUnit[] = []
  #snapshot: ViewportSnapshot
  #kernelUnsubscribe: Unsubscribe
  #knownLogicalCount: number

  virtualEpoch = 0
  shiftMode = false
  mountedRows = 0
  jumpInput: number
  currentLogicalPosition: number
  followTail: boolean
  atVisualBottom: boolean
  draftText: string

  constructor(kernel: ConversationSessionKernel, snapshot: ViewportSnapshot) {
    this.kernel = kernel
    this.#knownLogicalCount = kernel.count
    this.pageHeights = new PageHeightIndex(kernel.count)
    const position = clampIndex(snapshot.logicalPosition, kernel.count)
    this.segment = new SegmentManager(kernel.count, WINDOW_MESSAGES, SHIFT_MESSAGES, position)
    this.#snapshot = { ...snapshot, logicalPosition: position }
    this.jumpInput = position
    this.currentLogicalPosition = position
    this.followTail = snapshot.followTail
    this.atVisualBottom = snapshot.atVisualBottom && this.segment.range.end === kernel.count
    this.draftText = snapshot.draftText
    this.#activeUnits = this.#materialize(this.segment.range)
    this.#refreshPageEstimates()
    this.projection.replace(this.#activeUnits)
    this.#kernelUnsubscribe = kernel.subscribe(() => this.#syncKernel())
  }

  dispose(): void { this.#kernelUnsubscribe(); this.projectionEngine.clear() }
  get id(): string { return this.kernel.id }
  get title(): string { return this.kernel.title }
  get status(): SessionStatus { return this.kernel.status }
  get logicalCount(): number { return this.kernel.count }
  get range(): SegmentRange { return this.segment.range }
  get activeUnits(): readonly RenderUnit[] { return this.#activeUnits }
  get displayUnits(): readonly RenderUnit[] { return this.#activeUnits }
  get messagesAfterCurrent(): number { return Math.max(0, this.logicalCount - 1 - this.currentLogicalPosition) }
  get estimatedTotalHeight(): number { return this.pageHeights.estimatedTotalHeight() }

  get uiSnapshot(): SessionUiSnapshot {
    const target = this.kernel.currentAssistantIndex
    const projectionStats = this.projectionEngine.stats
    return {
      rangeStart: this.range.start,
      rangeEnd: this.range.end,
      reader: this.currentLogicalPosition,
      followTail: this.followTail,
      atVisualBottom: this.atVisualBottom,
      mountedRows: this.mountedRows,
      streamRate: this.kernel.streamRate,
      streamIngressTicks: this.kernel.streamIngressTicks,
      streamRenderTicks: this.kernel.streamRenderTicks,
      streamTarget: target === null ? null : `${this.id}:m-${target}`,
      messagesAfter: this.messagesAfterCurrent,
      liveChunkCount: target === null ? 0 : this.#activeUnits.filter(unit => unit.messageIndex === target).length,
      projectionSize: this.projection.size,
      projectionCacheSize: projectionStats.cacheSize,
      projectionCacheHits: projectionStats.cacheHits,
      projectionFullProjects: projectionStats.fullProjects,
      projectionIncrementalPatches: projectionStats.incrementalPatches,
      virtualEpoch: this.virtualEpoch,
      estimatedTotalHeight: this.estimatedTotalHeight,
      sessionStatus: this.kernel.status,
      queuedPrompts: this.kernel.queuedPrompts,
      pendingInteraction: this.kernel.pendingInteraction,
    }
  }

  subscribeState(listener: () => void): Unsubscribe { return this.#stateNotifier.subscribe(listener) }
  markStateDirty(): void { this.#stateNotifier.markDirty() }

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

  get rememberedSnapshot(): ViewportSnapshot { return { ...this.#snapshot, draftText: this.draftText } }

  setReaderPosition(index: number, atVisualBottom: boolean): void {
    this.currentLogicalPosition = clampIndex(index, this.logicalCount)
    this.atVisualBottom = atVisualBottom && this.range.end === this.logicalCount
    this.#stateNotifier.markDirty()
  }

  setFollowTail(value: boolean): void {
    if (this.followTail === value) return
    this.followTail = value
    this.#stateNotifier.markDirty()
  }

  jump(index: number): void {
    if (this.logicalCount <= 0) return
    const target = clampIndex(index, this.logicalCount)
    this.segment.setTotalMessages(this.logicalCount)
    this.segment.jump(target)
    this.#activeUnits = this.#materialize(this.range)
    this.currentLogicalPosition = target
    this.jumpInput = target
    if (target !== this.logicalCount - 1) this.setFollowTail(false)
    this.atVisualBottom = false
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
    return { direction: 'backward', previous, next: { ...next }, intermediate: [...incoming, ...this.#activeUnits], final: [...incoming, ...retained] }
  }

  planShiftForward(): ShiftPlan | null {
    const previous = { ...this.range }
    const next = this.segment.shiftForward()
    if (next.start === previous.start) return null
    const incoming = this.#materializeRange(previous.end, next.end)
    const retained = this.#activeUnits.filter(unit => unit.messageIndex >= next.start)
    return { direction: 'forward', previous, next: { ...next }, intermediate: [...this.#activeUnits, ...incoming], final: [...retained, ...incoming] }
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
    this.projection.replace(this.#activeUnits)
    this.#stateNotifier.markDirty()
  }

  finishShift(): void { this.shiftMode = false; this.#stateNotifier.markDirty() }

  refreshProjection(): void {
    this.#activeUnits = this.#materialize(this.range)
    this.projection.replace(this.#activeUnits)
    this.#stateNotifier.markDirty()
  }

  #syncKernel(): void {
    const event = this.kernel.lastEvent
    const oldCount = this.#knownLogicalCount
    const newCount = this.logicalCount

    if (newCount !== oldCount) {
      const wasPinned = this.followTail || this.atVisualBottom
      this.#knownLogicalCount = newCount
      this.segment.setTotalMessages(newCount)
      if (Math.ceil(Math.max(1, newCount) / DEFAULT_PAGE_SIZE) !== this.pageHeights.pageCount) this.pageHeights = new PageHeightIndex(newCount)
      if (wasPinned && newCount > 0) {
        this.segment.setEndingAt(newCount - 1)
        this.currentLogicalPosition = newCount - 1
        this.atVisualBottom = true
        this.#activeUnits = this.#materialize(this.range)
        this.#refreshPageEstimates()
        this.projection.replace(this.#activeUnits)
      }
    }

    if (event.messageIndex !== undefined && event.messageIndex >= this.range.start && event.messageIndex < this.range.end) {
      const message = this.kernel.getMessage(event.messageIndex)
      const units = event.contentPatch?.kind === 'append-markdown'
        ? this.projectionEngine.appendMarkdownDelta(message, event.contentPatch.blockId, event.contentPatch.delta)
        : this.projectionEngine.projectMessage(message)
      const existing = this.#activeUnits.filter(unit => unit.messageIndex === event.messageIndex)
      const sameIds = existing.length === units.length && existing.every((unit, index) => unit.id === units[index]?.id)
      if (sameIds) {
        const byId = new Map(units.map(unit => [unit.id, unit]))
        this.#activeUnits = this.#activeUnits.map(unit => byId.get(unit.id) ?? unit)
        for (const unit of units) this.projection.patch(unit)
      } else {
        const before = this.#activeUnits.filter(unit => unit.messageIndex < event.messageIndex!)
        const after = this.#activeUnits.filter(unit => unit.messageIndex > event.messageIndex!)
        this.#activeUnits = [...before, ...units, ...after]
        this.projection.replace(this.#activeUnits)
      }
    }

    this.#stateNotifier.markDirty()
  }

  #materialize(range: SegmentRange): RenderUnit[] { return this.#materializeRange(range.start, range.end) }

  #materializeRange(start: number, end: number): RenderUnit[] {
    if (end <= start) return []
    return this.projectionEngine.projectMessages(this.kernel.loadRange(start, end - start))
  }

  #refreshPageEstimates(): void {
    const byPage = new Map<number, { height: number; messages: Set<number> }>()
    for (const unit of this.#activeUnits) {
      const page = Math.floor(unit.messageIndex / DEFAULT_PAGE_SIZE)
      let bucket = byPage.get(page)
      if (!bucket) { bucket = { height: 0, messages: new Set() }; byPage.set(page, bucket) }
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
  if (count <= 0) return 0
  return Math.max(0, Math.min(count - 1, Math.floor(Number(index) || 0)))
}
