import type { ConversationExecutionController, SubmitDisposition } from '../engine/conversation/contracts'
import type { ConversationSessionKernel } from '../engine/conversation/session-kernel'

const MAX_RUN_PUBLISHES = 1800
const REASONING_PUBLISHES = 18

/** Demo-only playback driver. Rate controls and counters are intentionally not engine/session state. */
export class SyntheticStreamController implements ConversationExecutionController {
  #kernel: ConversationSessionKernel
  #timer: ReturnType<typeof setInterval> | null = null
  #framePending = false
  #pendingDelta = ''
  #runPublishes = 0

  rate = 20
  ingressTicks = 0
  publishTicks = 0

  constructor(kernel: ConversationSessionKernel) { this.#kernel = kernel }
  get running(): boolean { return this.#timer !== null && this.#kernel.status === 'working' }

  start(reset = true): void {
    if (this.#kernel.status !== 'working' || this.#kernel.currentAssistantIndex === null) return
    this.#stopTimer()
    if (reset) this.#runPublishes = 0
    this.#timer = setInterval(() => this.#ingest(), Math.max(16, Math.round(1000 / this.rate)))
  }

  pause(): void { this.#stopTimer() }
  abort(): void { this.#stopTimer(); this.#kernel.abortCurrent() }

  submit(prompt: string): SubmitDisposition {
    if (this.#kernel.pendingInteraction) return 'blocked'
    if (this.#kernel.status === 'working') return this.#kernel.enqueue(prompt) ? 'queued' : 'blocked'
    const index = this.#kernel.beginTurn(prompt)
    if (index === null) return 'blocked'
    this.resetTelemetry()
    this.start(true)
    return 'started'
  }

  resolveInteraction(approved: boolean): void { this.#kernel.resolveInteraction(approved) }
  setRate(rate: number): void {
    const wasRunning = this.running
    this.rate = Math.max(1, Math.floor(rate))
    if (wasRunning) this.start(false)
  }
  resetTelemetry(): void { this.ingressTicks = 0; this.publishTicks = 0 }
  dispose(): void { this.#stopTimer() }

  #stopTimer(): void {
    if (this.#timer) clearInterval(this.#timer)
    this.#timer = null
    this.#framePending = false
    this.#pendingDelta = ''
  }

  #ingest(): void {
    this.ingressTicks += 1
    this.#pendingDelta += this.#runPublishes < REASONING_PUBLISHES
      ? syntheticReasoningDelta(this.ingressTicks)
      : syntheticAnswerDelta(this.ingressTicks)
    if (this.#framePending) return
    this.#framePending = true
    scheduleFrame(() => { this.#framePending = false; this.#publish() })
  }

  #publish(): void {
    if (!this.#pendingDelta || this.#kernel.currentAssistantIndex === null) return
    const delta = this.#pendingDelta
    this.#pendingDelta = ''
    if (this.#runPublishes < REASONING_PUBLISHES) this.#kernel.appendCurrentReasoningDelta(delta)
    else this.#kernel.appendAssistantDelta(delta)
    this.#runPublishes += 1
    this.publishTicks += 1
    if (this.#runPublishes < MAX_RUN_PUBLISHES) return

    this.#stopTimer()
    this.#kernel.completeCurrent()
    const queued = this.#kernel.dequeue()
    if (queued !== null) {
      this.#kernel.beginTurn(queued)
      this.resetTelemetry()
      this.start(true)
    }
  }
}

function syntheticReasoningDelta(tick: number): string {
  const phrases = [
    'Inspect the session facts before choosing a presentation action. ',
    'Preserve Turn, Step and Block identity while the reasoning text grows. ',
    'Keep this stream independent from the physical viewport and current fold state. ',
    'Apply every semantic delta but coalesce framework publication where possible. ',
  ]
  const phrase = phrases[tick % phrases.length]!
  return tick % 5 === 0 ? `\n\n${phrase}` : phrase
}

function syntheticAnswerDelta(tick: number): string {
  const phrases = [
    'I inspected the active workspace state and preserved stable semantic identity.',
    'The agent can keep running even when its viewport has been evicted from the hot LRU.',
    'Tool and reasoning output remain structured presentation nodes rather than backend-specific components.',
    'Streaming deltas are coalesced before publication so framework work stays bounded.',
    'The next verification step checks restore, queue, and interaction state across session switches.',
  ]
  const phrase = phrases[tick % phrases.length]!
  if (tick % 13 === 0) return `\n\n### Progress ${Math.floor(tick / 13) + 1}\n\n${phrase} `
  return `${phrase} `
}

function scheduleFrame(callback: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback)
  else queueMicrotask(callback)
}
