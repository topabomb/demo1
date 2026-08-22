import type { ConversationExecutionController, LlmFailure, SubmitDisposition, TokenUsage } from '../engine/conversation/contracts'
import type { ConversationSessionKernel } from '../engine/conversation/session-kernel'
import { block, type LogicalMessage } from '../engine/model/conversation'
import {
  appendMarkdownContent,
  appendReasoningContent,
  markdownText,
  replaceMarkdownContent,
  settleReasoning,
} from '../engine/model/message-mutations'
import {
  applyLiveScenarioMilestone,
  LIVE_REASONING_PUBLISHES,
  liveAnswerDelta,
  liveReasoningDelta,
} from './live-run-script'

const MAX_RUN_PUBLISHES = 600

/** Demo-only playback driver. Synthetic timing/accounting and scripted scenario output never enter Engine policy. */
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

  abort(): void {
    this.#stopTimer()
    const index = this.#kernel.currentAssistantIndex
    if (index !== null) {
      const current = settleReasoning(this.#kernel.getMessage(index), 'interrupted')
      const patched = appendMarkdownContent(current, '\n\n_Stopped by user._')
      this.#kernel.replaceCanonicalMessage(index, { ...patched.message, live: false })
    }
    this.#kernel.clearQueue()
    this.#kernel.finishExecution('aborted')
  }

  fail(failure: LlmFailure): void {
    this.#stopTimer()
    const index = this.#kernel.currentAssistantIndex
    if (index !== null) {
      const current = settleReasoning(this.#kernel.getMessage(index), 'interrupted')
      this.#kernel.replaceCanonicalMessage(index, { ...current, revision: (current.revision ?? 0) + 1, live: false })
    }
    this.#kernel.finishExecution('error', failure)
  }

  submit(prompt: string): SubmitDisposition {
    const text = prompt.trim()
    if (!text || this.#kernel.pendingInteraction) return 'blocked'
    if (this.#kernel.status === 'working') return this.#kernel.enqueue(text) ? 'queued' : 'blocked'
    if (!this.#beginSyntheticTurn(text)) return 'blocked'
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

  #beginSyntheticTurn(prompt: string): boolean {
    const userIndex = this.#kernel.count
    const turnId = `${this.#kernel.id}:runtime-turn-${userIndex}`
    const stepId = `${turnId}:step-0`
    const indexes = this.#kernel.appendCanonicalMessages([
      {
        turnId,
        stepId,
        role: 'user',
        blocks: [block('prompt', 'markdown', { markdown: prompt })],
      },
      {
        turnId,
        stepId,
        role: 'assistant',
        blocks: [
          block('reasoning', 'reasoning', { text: '', tokenCount: 0, durationMs: 0, defaultOpen: false, status: 'streaming' }),
          block('answer', 'markdown', { markdown: '' }),
        ],
        live: true,
      },
    ])
    const assistantIndex = indexes[1]
    if (assistantIndex === undefined || !this.#kernel.startExecution(assistantIndex)) return false
    this.#accountPrompt(prompt)
    return true
  }

  #stopTimer(): void {
    if (this.#timer) clearInterval(this.#timer)
    this.#timer = null
    this.#framePending = false
    this.#pendingDelta = ''
  }

  #ingest(): void {
    this.ingressTicks += 1
    if (this.#runPublishes < LIVE_REASONING_PUBLISHES) this.#pendingDelta += liveReasoningDelta(this.ingressTicks)
    else this.#pendingDelta = 'answer-ready'
    if (this.#framePending) return
    this.#framePending = true
    scheduleFrame(() => { this.#framePending = false; this.#publish() })
  }

  #publish(): void {
    const index = this.#kernel.currentAssistantIndex
    if (!this.#pendingDelta || index === null) return

    const milestone = applyLiveScenarioMilestone(this.#kernel.getMessage(index), this.#runPublishes)
    if (milestone) this.#kernel.replaceCanonicalMessage(index, milestone)

    const reasoningPhase = this.#runPublishes < LIVE_REASONING_PUBLISHES
    const delta = reasoningPhase
      ? this.#pendingDelta
      : liveAnswerDelta(this.#runPublishes - LIVE_REASONING_PUBLISHES)
    this.#pendingDelta = ''

    if (reasoningPhase) {
      const current = this.#kernel.getMessage(index)
      const reasoningTokens = estimateTokens(reasoningText(current)) + estimateTokens(delta)
      const patched = appendReasoningContent(current, delta, this.#runPublishes * Math.max(16, Math.round(1000 / this.rate)), reasoningTokens)
      if (patched) {
        this.#kernel.replaceCanonicalMessage(index, patched.message, { kind: 'append-reasoning', blockId: patched.blockId, delta })
        this.#accountOutput(delta, true)
      }
    } else {
      const patched = appendMarkdownContent(this.#kernel.getMessage(index), delta)
      this.#kernel.replaceCanonicalMessage(index, patched.message, { kind: 'append-markdown', blockId: patched.blockId, delta })
      this.#accountOutput(delta, false)
    }

    this.#runPublishes += 1
    this.publishTicks += 1
    if (this.#runPublishes < MAX_RUN_PUBLISHES) return

    this.#stopTimer()
    this.#completeCurrent()
    const queued = this.#kernel.dequeue()
    if (queued !== null && this.#beginSyntheticTurn(queued)) {
      this.resetTelemetry()
      this.start(true)
    }
  }

  #completeCurrent(): void {
    const index = this.#kernel.currentAssistantIndex
    if (index !== null) {
      const current = settleReasoning(this.#kernel.getMessage(index), 'complete')
      const answer = markdownText(current).trim()
      const next = answer
        ? { ...current, revision: (current.revision ?? 0) + 1, live: false }
        : replaceMarkdownContent(current, 'Completed.', false)
      this.#kernel.replaceCanonicalMessage(index, next)
    }
    this.#kernel.finishExecution('completed')
  }

  #accountPrompt(text: string): void {
    const usage = this.#kernel.usage
    const context = this.#kernel.context
    const promptTokens = estimateTokens(text)
    const reusable = Math.min(context.projectedTokens, Math.round(context.projectedTokens * 0.82))
    const uncached = Math.max(promptTokens + 64, Math.round(context.projectedTokens * 0.03))
    const cacheWrite = Math.max(0, Math.round(uncached * 0.12))
    this.#kernel.setAccounting({
      ...usage,
      inputTokens: usage.inputTokens + uncached,
      cacheReadTokens: usage.cacheReadTokens + reusable,
      cacheWriteTokens: usage.cacheWriteTokens + cacheWrite,
    }, {
      ...context,
      projectedTokens: Math.min(context.contextWindow, context.projectedTokens + promptTokens + 32),
    })
  }

  #accountOutput(text: string, reasoning: boolean): void {
    const usage = this.#kernel.usage
    const context = this.#kernel.context
    const tokens = estimateTokens(text)
    const next: TokenUsage = reasoning
      ? { ...usage, reasoningTokens: usage.reasoningTokens + tokens }
      : { ...usage, outputTokens: usage.outputTokens + tokens }
    this.#kernel.setAccounting(next, {
      ...context,
      projectedTokens: Math.min(context.contextWindow, context.projectedTokens + tokens),
    })
  }
}

function reasoningText(message: LogicalMessage): string {
  const contentBlock = message.blocks.find(entry => entry.type === 'reasoning')
  return contentBlock?.type === 'reasoning' ? contentBlock.data.text : ''
}

function estimateTokens(text: string): number { return Math.max(1, Math.ceil(text.length / 4)) }

function scheduleFrame(callback: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback)
  else queueMicrotask(callback)
}
