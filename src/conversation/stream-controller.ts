import type { RenderUnit } from '../core/types'
import type { ConversationExecutionController } from './contracts'
import type { ConversationSessionRuntime } from './session-runtime'

const LIVE_CHUNK_LIMIT = 6500

/**
 * Reference implementation of the session-scoped execution contract.
 * It is deliberately framework-free: a running session may continue receiving
 * deltas while another Recent session is active or while its reader is in history.
 */
export class SyntheticStreamController implements ConversationExecutionController {
  #runtime: ConversationSessionRuntime
  #timer: ReturnType<typeof setInterval> | null = null
  #framePending = false

  constructor(runtime: ConversationSessionRuntime) {
    this.#runtime = runtime
  }

  get running(): boolean { return this.#timer !== null }

  start(reset = true): void {
    const runtime = this.#runtime
    if (runtime.status !== 'running') return
    if (reset) this.stop(true)
    if (runtime.range.end !== runtime.logicalCount) runtime.jump(runtime.logicalCount - 1)

    const tail = [...runtime.activeUnits].reverse().find(unit => unit.messageIndex === runtime.logicalCount - 1)
    if (!tail) return

    runtime.streamBaseUnit = tail
    runtime.streamTarget = tail.id
    runtime.streamChunkText = String(tail.payload.markdown ?? '')
    runtime.pendingDelta = ''
    runtime.streamIngressTicks = 0
    runtime.streamRenderTicks = 0
    runtime.setFollowTail(true)
    runtime.markStateDirty()

    this.#timer = setInterval(() => this.#ingest(), Math.max(16, Math.round(1000 / runtime.streamRate)))
  }

  stop(clear = false): void {
    if (this.#timer) clearInterval(this.#timer)
    this.#timer = null
    this.#framePending = false
    const runtime = this.#runtime
    runtime.pendingDelta = ''
    runtime.streamBaseUnit = null
    runtime.streamTarget = null
    runtime.tailIntentGeneration += 1
    if (clear) runtime.clearLiveTail()
    runtime.markStateDirty()
  }

  setRate(rate: number): void {
    this.#runtime.streamRate = Math.max(1, Math.floor(rate))
    if (!this.running) {
      this.#runtime.markStateDirty()
      return
    }
    this.stop(false)
    this.start(false)
  }

  #ingest(): void {
    const runtime = this.#runtime
    runtime.streamIngressTicks += 1
    runtime.pendingDelta += syntheticDelta(runtime.streamIngressTicks)
    runtime.markStateDirty()
    if (this.#framePending) return
    this.#framePending = true
    scheduleFrame(() => {
      this.#framePending = false
      this.#publish()
    })
  }

  #publish(): void {
    const runtime = this.#runtime
    if (!runtime.pendingDelta || !runtime.streamTarget || !runtime.streamBaseUnit) return

    if (runtime.streamChunkText.length >= LIVE_CHUNK_LIMIT) {
      const next = createNextLiveChunk(runtime.streamBaseUnit, runtime.liveTailUnits.length + 1)
      runtime.appendLiveChunk(next)
      runtime.streamBaseUnit = next
      runtime.streamTarget = next.id
      runtime.streamChunkText = ''
      runtime.pendingDelta = `${runtime.pendingDelta}\n\n`
    }

    runtime.streamChunkText += runtime.pendingDelta
    runtime.pendingDelta = ''
    const base = runtime.streamBaseUnit
    const patched: RenderUnit = {
      ...base,
      revision: base.revision + runtime.streamRenderTicks + 1,
      estimatePx: Math.max(base.estimatePx, 180 + Math.min(5200, runtime.streamChunkText.length * 0.12)),
      payload: { ...base.payload, markdown: runtime.streamChunkText, live: true },
    }
    runtime.patchNode(patched)
  }
}

function createNextLiveChunk(previous: RenderUnit, chunkIndex: number): RenderUnit {
  return {
    ...previous,
    id: `${previous.messageId}:live-extra-${chunkIndex}`,
    revision: 0,
    estimatePx: 180,
    payload: { ...previous.payload, markdown: '', live: true, partIndex: chunkIndex, partCount: chunkIndex + 1 },
  }
}

function syntheticDelta(tick: number): string {
  const phrases = [
    'I inspected the affected render path and preserved stable node identity.',
    'The next step is validating dynamic measurements before changing the scroll anchor.',
    'Tool output is folded structurally so hidden payload does not inflate the DOM.',
    'Streaming deltas are coalesced before UI publication instead of updating for every token.',
    'Backend events remain normalized behind the canonical conversation boundary.',
  ]
  const phrase = phrases[tick % phrases.length]!
  if (tick % 11 === 0) return `\n\n### Progress ${Math.floor(tick / 11) + 1}\n\n${phrase} `
  return `${phrase} `
}

function scheduleFrame(callback: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback)
  else queueMicrotask(callback)
}
