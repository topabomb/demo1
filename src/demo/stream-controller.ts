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
  addFinalEvidence,
  AGENT_FINAL_ARTIFACT_PUBLISH,
  AGENT_FINAL_CODE_PUBLISH,
  AGENT_FINAL_DIFF_PUBLISH,
  AGENT_FINAL_STEP,
  AGENT_MAX_PUBLISHES,
  AGENT_REASONING_PUBLISHES,
  AGENT_TOOL_CALL_PUBLISH,
  AGENT_TOOL_RESULT_PUBLISH,
  agentMarkdownDelta,
  agentReasoningDelta,
  createLiveAssistantStep,
  createLiveToolResult,
  liveToolForStep,
  parseStepOrdinal,
  setLiveToolCall,
  settleReasoningBlock,
  STRESS_REASONING_PUBLISHES,
  stressMarkdownDelta,
  stressReasoningDelta,
} from './live-run-script'

export type DemoPlaybackMode = 'standard' | 'stress' | 'agent-loop'

const STRESS_MAX_PUBLISHES = 600
const AGENT_TOOL_PROGRESS_PUBLISH = AGENT_TOOL_CALL_PUBLISH + 3
const AGENT_TOOL_SUCCESS_PUBLISH = AGENT_TOOL_RESULT_PUBLISH - 1
const AGENT_FINAL_COMPLETE_PUBLISH = AGENT_FINAL_ARTIFACT_PUBLISH + 12

/** Demo-only playback driver. Synthetic timing/accounting and scripted scenario output never enter Engine policy. */
export class SyntheticStreamController implements ConversationExecutionController {
  #kernel: ConversationSessionKernel
  #mode: DemoPlaybackMode
  #timer: ReturnType<typeof setInterval> | null = null
  #framePending = false
  #pendingDelta = ''
  #runPublishes = 0
  #stepPublishes = 0
  #markdownTicks = 0

  rate = 20
  ingressTicks = 0
  publishTicks = 0

  constructor(kernel: ConversationSessionKernel, mode: DemoPlaybackMode = 'standard') {
    this.#kernel = kernel
    this.#mode = mode
  }

  get running(): boolean { return this.#timer !== null && this.#kernel.status === 'working' }
  get mode(): DemoPlaybackMode { return this.#mode }

  start(reset = true): void {
    if (this.#kernel.status !== 'working' || this.#kernel.currentAssistantIndex === null) return
    this.#stopTimer()
    if (reset) {
      this.#runPublishes = 0
      this.#stepPublishes = 0
      this.#markdownTicks = 0
    }
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
      this.#kernel.replaceCanonicalMessage(index, { ...current, live: false })
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
    const userStepId = `${turnId}:step-0`
    const assistant = this.#mode === 'agent-loop'
      ? createLiveAssistantStep(turnId, 1)
      : {
          turnId,
          stepId: userStepId,
          role: 'assistant' as const,
          blocks: [
            block('reasoning', 'reasoning', { text: '', tokenCount: 0, durationMs: 0, defaultOpen: false, status: 'streaming' }),
            block('answer', 'markdown', { markdown: '' }),
          ],
          live: true,
        }
    const indexes = this.#kernel.appendCanonicalMessages([
      { turnId, stepId: userStepId, role: 'user', blocks: [block('prompt', 'markdown', { markdown: prompt })] },
      assistant,
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
    const reasoningPublishes = this.#mode === 'agent-loop' ? AGENT_REASONING_PUBLISHES : STRESS_REASONING_PUBLISHES
    this.#pendingDelta = this.#stepPublishes < reasoningPublishes
      ? this.#mode === 'agent-loop'
        ? agentReasoningDelta(this.#currentStepOrdinal(), this.ingressTicks)
        : stressReasoningDelta(this.ingressTicks)
      : 'answer-ready'
    if (this.#framePending) return
    this.#framePending = true
    scheduleFrame(() => { this.#framePending = false; this.#publish() })
  }

  #publish(): void {
    const index = this.#kernel.currentAssistantIndex
    if (!this.#pendingDelta || index === null) return
    if (this.#mode === 'agent-loop') this.#publishAgentLoop(index)
    else this.#publishStress(index)
  }

  #publishStress(index: number): void {
    const reasoningPhase = this.#stepPublishes < STRESS_REASONING_PUBLISHES
    const delta = reasoningPhase ? this.#pendingDelta : stressMarkdownDelta(this.#markdownTicks++)
    this.#pendingDelta = ''

    if (reasoningPhase) this.#appendReasoning(index, delta)
    else {
      if (this.#stepPublishes === STRESS_REASONING_PUBLISHES) this.#settleCurrentReasoning(index)
      this.#appendMarkdown(index, delta)
    }

    this.#stepPublishes += 1
    this.#runPublishes += 1
    this.publishTicks += 1
    if (this.#runPublishes < STRESS_MAX_PUBLISHES) return
    this.#completeCurrentTurn()
  }

  #publishAgentLoop(index: number): void {
    const stepOrdinal = this.#currentStepOrdinal()
    const reasoningPhase = this.#stepPublishes < AGENT_REASONING_PUBLISHES
    const delta = reasoningPhase ? this.#pendingDelta : agentMarkdownDelta(stepOrdinal, this.#markdownTicks++)
    this.#pendingDelta = ''

    if (reasoningPhase) this.#appendReasoning(index, delta)
    else {
      if (this.#stepPublishes === AGENT_REASONING_PUBLISHES) this.#settleCurrentReasoning(index)
      this.#appendMarkdown(index, delta)
    }

    if (stepOrdinal < AGENT_FINAL_STEP) {
      const spec = liveToolForStep(stepOrdinal)
      if (spec && this.#stepPublishes === AGENT_TOOL_CALL_PUBLISH) {
        this.#kernel.replaceCanonicalMessage(index, setLiveToolCall(this.#kernel.getMessage(index), spec, 'running', 25))
      } else if (spec && this.#stepPublishes === AGENT_TOOL_PROGRESS_PUBLISH) {
        this.#kernel.replaceCanonicalMessage(index, setLiveToolCall(this.#kernel.getMessage(index), spec, 'running', 70))
      } else if (spec && this.#stepPublishes === AGENT_TOOL_SUCCESS_PUBLISH) {
        this.#kernel.replaceCanonicalMessage(index, setLiveToolCall(this.#kernel.getMessage(index), spec, 'success', 100))
      }
    } else {
      if (this.#stepPublishes === AGENT_FINAL_DIFF_PUBLISH) this.#kernel.replaceCanonicalMessage(index, addFinalEvidence(this.#kernel.getMessage(index), 'diff'))
      if (this.#stepPublishes === AGENT_FINAL_CODE_PUBLISH) this.#kernel.replaceCanonicalMessage(index, addFinalEvidence(this.#kernel.getMessage(index), 'code'))
      if (this.#stepPublishes === AGENT_FINAL_ARTIFACT_PUBLISH) this.#kernel.replaceCanonicalMessage(index, addFinalEvidence(this.#kernel.getMessage(index), 'artifacts'))
    }

    this.#stepPublishes += 1
    this.#runPublishes += 1
    this.publishTicks += 1

    if (stepOrdinal < AGENT_FINAL_STEP && this.#stepPublishes > AGENT_TOOL_RESULT_PUBLISH) {
      this.#advanceAgentStep(index, stepOrdinal)
      return
    }
    if (stepOrdinal === AGENT_FINAL_STEP && (this.#stepPublishes > AGENT_FINAL_COMPLETE_PUBLISH || this.#runPublishes >= AGENT_MAX_PUBLISHES)) {
      this.#completeCurrentTurn()
    }
  }

  #advanceAgentStep(index: number, stepOrdinal: number): void {
    const current = this.#kernel.getMessage(index)
    const spec = liveToolForStep(stepOrdinal)
    if (!spec) return
    const settled = settleReasoningBlock(current) ?? current
    this.#kernel.replaceCanonicalMessage(index, { ...settled, live: false })
    const indexes = this.#kernel.appendCanonicalMessages([
      createLiveToolResult(current, spec),
      createLiveAssistantStep(current.turnId, stepOrdinal + 1),
    ])
    const nextAssistant = indexes[1]
    if (nextAssistant === undefined) throw new Error('agent-loop assistant step missing')
    this.#kernel.continueExecutionAt(nextAssistant)
    this.#stepPublishes = 0
    this.#markdownTicks = 0
  }

  #appendReasoning(index: number, delta: string): void {
    const current = this.#kernel.getMessage(index)
    const reasoningTokens = estimateTokens(reasoningText(current)) + estimateTokens(delta)
    const patched = appendReasoningContent(current, delta, this.#stepPublishes * Math.max(16, Math.round(1000 / this.rate)), reasoningTokens)
    if (!patched) return
    this.#kernel.replaceCanonicalMessage(index, patched.message, { kind: 'append-reasoning', blockId: patched.blockId, delta })
    this.#accountOutput(delta, true)
  }

  #appendMarkdown(index: number, delta: string): void {
    const patched = appendMarkdownContent(this.#kernel.getMessage(index), delta)
    this.#kernel.replaceCanonicalMessage(index, patched.message, { kind: 'append-markdown', blockId: patched.blockId, delta })
    this.#accountOutput(delta, false)
  }

  #settleCurrentReasoning(index: number): void {
    const current = this.#kernel.getMessage(index)
    const settled = settleReasoningBlock(current)
    if (settled) this.#kernel.replaceCanonicalMessage(index, settled)
  }

  #currentStepOrdinal(): number {
    const index = this.#kernel.currentAssistantIndex
    return index === null ? 0 : parseStepOrdinal(this.#kernel.getMessage(index))
  }

  #completeCurrentTurn(): void {
    this.#stopTimer()
    const index = this.#kernel.currentAssistantIndex
    if (index !== null) {
      const current = settleReasoning(this.#kernel.getMessage(index), 'complete')
      const answer = markdownText(current).trim()
      const next = answer ? { ...current, live: false } : replaceMarkdownContent(current, 'Completed.', false)
      this.#kernel.replaceCanonicalMessage(index, next)
    }
    this.#kernel.finishExecution('completed')
    const queued = this.#kernel.dequeue()
    if (queued !== null && this.#beginSyntheticTurn(queued)) {
      this.resetTelemetry()
      this.start(true)
    }
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
