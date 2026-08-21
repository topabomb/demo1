import type { ConversationExecutionController, SubmitDisposition } from './contracts'
import type { ConversationSessionKernel } from './session-kernel'

const MAX_RUN_PUBLISHES = 1800

/** Session-scoped execution. It never owns or depends on a viewport runtime. */
export class SyntheticStreamController implements ConversationExecutionController {
  #kernel: ConversationSessionKernel
  #timer: ReturnType<typeof setInterval> | null = null
  #framePending = false
  #pendingDelta = ''
  #runPublishes = 0

  constructor(kernel: ConversationSessionKernel) {
    this.#kernel = kernel
  }

  get running(): boolean {
    return this.#timer !== null && this.#kernel.status === 'working'
  }

  start(_reset = true): void {
    if (this.#kernel.status !== 'working' || this.#kernel.currentAssistantIndex === null) return
    this.#stopTimer()
    this.#runPublishes = 0
    this.#timer = setInterval(() => this.#ingest(), Math.max(16, Math.round(1000 / this.#kernel.streamRate)))
  }

  stop(_clear = false): void {
    this.#stopTimer()
  }

  abort(): void {
    this.#stopTimer()
    this.#kernel.abortCurrent()
  }

  submit(prompt: string): SubmitDisposition {
    if (this.#kernel.pendingInteraction) return 'blocked'
    if (this.#kernel.status === 'working') return this.#kernel.enqueue(prompt) ? 'queued' : 'blocked'
    const index = this.#kernel.beginTurn(prompt)
    if (index === null) return 'blocked'
    this.start(false)
    return 'started'
  }

  resolveInteraction(approved: boolean): void {
    this.#kernel.resolveInteraction(approved)
  }

  setRate(rate: number): void {
    const wasRunning = this.running
    this.#kernel.setStreamRate(rate)
    if (wasRunning) this.start(false)
  }

  dispose(): void {
    this.#stopTimer()
  }

  #stopTimer(): void {
    if (this.#timer) clearInterval(this.#timer)
    this.#timer = null
    this.#framePending = false
    this.#pendingDelta = ''
  }

  #ingest(): void {
    this.#kernel.incrementIngress()
    this.#pendingDelta += syntheticDelta(this.#kernel.streamIngressTicks)
    if (this.#framePending) return
    this.#framePending = true
    scheduleFrame(() => {
      this.#framePending = false
      this.#publish()
    })
  }

  #publish(): void {
    if (!this.#pendingDelta || this.#kernel.currentAssistantIndex === null) return
    const delta = this.#pendingDelta
    this.#pendingDelta = ''
    this.#kernel.appendAssistantDelta(delta)
    this.#runPublishes += 1
    if (this.#runPublishes < MAX_RUN_PUBLISHES) return

    this.#stopTimer()
    this.#kernel.completeCurrent()
    const queued = this.#kernel.dequeue()
    if (queued !== null) {
      this.#kernel.beginTurn(queued)
      this.start(false)
    }
  }
}

function syntheticDelta(tick: number): string {
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
