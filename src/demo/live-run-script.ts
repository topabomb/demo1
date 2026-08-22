import { block, type AppendCanonicalMessage, type ContentBlock, type LogicalMessage, type ToolCategory } from '../engine/model/conversation'

export const STRESS_REASONING_PUBLISHES = 18
export const AGENT_REASONING_PUBLISHES = 6
export const AGENT_TOOL_CALL_PUBLISH = 12
export const AGENT_TOOL_RESULT_PUBLISH = 18
export const AGENT_FINAL_STEP = 4
export const AGENT_FINAL_DIFF_PUBLISH = 14
export const AGENT_FINAL_CODE_PUBLISH = 20
export const AGENT_FINAL_ARTIFACT_PUBLISH = 26
export const AGENT_MAX_PUBLISHES = 150

export interface LiveToolSpec {
  name: string
  callId: string
  category: ToolCategory
  input: Record<string, unknown>
  output: Record<string, unknown>
  model?: string
}

const TOOL_STEPS: Readonly<Record<number, LiveToolSpec>> = {
  1: {
    name: 'read_file',
    callId: 'loop-read-renderer',
    category: 'filesystem',
    input: { path: 'src/engine/presentation/projection-engine.ts', range: '1:260' },
    output: { lines: 238, finding: 'streaming Markdown patches only the active tail RenderUnits; settled prefix units retain identity' },
  },
  2: {
    name: 'search_code',
    callId: 'loop-search-boundaries',
    category: 'search',
    input: { query: 'stepId callId projection fullProjects incrementalPatches', scope: 'src/engine' },
    output: { matches: 17, files: ['conversation/session-kernel.ts', 'presentation/projection-engine.ts', 'runtime/session-runtime.ts'], finding: 'Turn/Step identity is provider-owned and physical viewport state is independent' },
  },
  3: {
    name: 'run_tests',
    callId: 'loop-run-tests',
    category: 'shell',
    input: { command: 'pnpm test && pnpm build && pnpm test:e2e', cwd: '/workspace/demo1' },
    output: { unit: '67+ passed', build: 'passed', chromium: 'running', exitCode: 0 },
  },
}

const STEP_MARKDOWN: Readonly<Record<number, readonly string[]>> = {
  1: [
    '### Step 2 · Inspect the projection path\n\nThe first CI clue points at the rendering boundary. I am keeping the canonical message untouched while checking how a live Markdown tail becomes keyed `RenderUnit`s. ',
    '\n\n| Surface | Owner | Invariant |\n| --- | --- | --- |\n',
    '| canonical history | SessionKernel | stable Message/Turn/Step identity |\n| live projection | ProjectionEngine | patch changed tail only |\n',
    '| physical rows | Vue/Virtua adapter | measurement cannot redefine reader position |\n\n',
    '- [x] preserve message identity\n- [x] keep settled Markdown chunks referentially stable\n- [ ] inspect the exact projection code path\n\n',
    '> A virtual row may remount because its height changed; the semantic conversation coordinate must not.\n\n',
  ],
  2: [
    '### Step 3 · Correlate engine boundaries\n\nThe file read confirms the hot-path behavior, so I am following correlation and lifecycle references before changing anything. ',
    '\n\n1. `turnId` groups the complete user-level run.\n2. `stepId` identifies each model/tool loop iteration.\n',
    '\n   - Tool call and result correlate by producer-owned `callId`.\n   - Artifact provenance points back to the producing call.\n\n',
    '```ts\nconst semanticKey = `${message.turnId}:${message.stepId}`\n',
    'const physicalRow = projection.getNode(renderUnitId)\n// semantic identity and DOM identity are intentionally different\n```\n\n',
    '| Boundary | May know provider policy? | May know DOM? |\n| --- | ---: | ---: |\n| SessionKernel | no | no |\n| Demo execution adapter | yes | no |\n| Vue viewport adapter | no | yes |\n\n',
  ],
  3: [
    '### Step 4 · Verify under load\n\nThe architecture is consistent. I am running the release gate while the same Turn stays live and the viewport continues measuring rich content. ',
    '\n\n| Verification | Expected | Live state |\n| --- | --- | --- |\n| unit + architecture | deterministic | passing |\n',
    '| strict build | no type drift | passing |\n| Chromium | no row overlap / no page overflow | running |\n\n',
    '```text\nlogical history      -> 1,000,000+\nhot projection      -> bounded window\nmounted DOM          -> visible rows only\n',
    'stream mutation     -> changed message only\n```\n\n',
    '> Structural tool milestones may rebuild one changed message; ordinary Markdown deltas stay on the incremental path.\n\n',
  ],
  4: [
    '## Final synthesis\n\nThe loop has now completed three distinct tool phases and returned to a normal assistant synthesis step. The fix stays inside the smallest responsible boundary. ',
    '\n\n### What changed\n\n- Engine lifecycle counts one Turn across separately appended Step records.\n- Demo orchestration owns the synthetic multi-step script.\n- Renderer/tool presentation remains provider-neutral.\n\n',
    '| Property | Result |\n| --- | --- |\n| stable Turn identity | yes |\n| multiple Step records | yes |\n| filesystem/search/shell tools | correlated |\n| Markdown streaming | incremental |\n| virtualized DOM | bounded |\n\n',
    '### Release checklist\n\n- [x] canonical tool correlation\n- [x] parser-aligned GFM chunking\n- [x] stable RenderUnit identities\n- [x] responsive containment\n- [ ] deployed Chromium verification\n\n',
    '> The Demo is intentionally richer than the Engine: it supplies scenarios and timing, while the Engine supplies reusable semantics and rendering machinery.\n\n',
  ],
}

export function liveToolForStep(stepOrdinal: number): LiveToolSpec | null {
  return TOOL_STEPS[stepOrdinal] ?? null
}

export function parseStepOrdinal(message: LogicalMessage): number {
  const match = message.stepId?.match(/:step-(\d+)$/)
  return match ? Number(match[1]) : 0
}

export function agentReasoningDelta(stepOrdinal: number, tick: number): string {
  const phrases = [
    `Step ${stepOrdinal + 1}: preserve canonical identity before touching presentation policy. `,
    'Separate producer/tool semantics from viewport measurement and product chrome. ',
    'Inspect only the changed hot state; never scan total history for ordinary UI work. ',
    'Keep tool correlation explicit so a remount cannot change business identity. ',
  ]
  const phrase = phrases[tick % phrases.length]!
  return tick % 3 === 0 ? `\n\n${phrase}` : phrase
}

export function agentMarkdownDelta(stepOrdinal: number, markdownTick: number): string {
  const scripted = STEP_MARKDOWN[stepOrdinal] ?? STEP_MARKDOWN[AGENT_FINAL_STEP]!
  if (markdownTick < scripted.length) return scripted[markdownTick]!
  const cycle = markdownTick - scripted.length
  const variants = [
    `### Ongoing verification ${cycle + 1}\n\nThe stream is still growing after the structured blocks above. Only the active Markdown tail is reparsed and republished; settled prefix units keep identity.\n\n`,
    `| live check | value |\n| --- | --- |\n| step | ${stepOrdinal + 1} |\n| sample | ${cycle + 1} |\n| semantic reader | preserved |\n\n`,
    '```ts\nconst next = appendMarkdownDelta(current, delta)\n// projector reuses every settled prefix RenderUnit\n```\n\n',
    '- [x] stream continues\n- [x] tool records stay correlated\n- [x] layout remains measurable\n\n',
    '> Rich Markdown can change physical height without changing Turn, Step or reader identity.\n\n',
  ]
  return variants[cycle % variants.length]!
}

export function stressReasoningDelta(tick: number): string {
  const phrases = [
    'Correlate the deployed failure with the renderer change before editing code. ',
    'Preserve stable Message, Block and RenderUnit identities while the live turn grows. ',
    'Keep semantic reader state independent from dynamic DOM measurement. ',
    'Prefer bounded hot-state work over total-history scans. ',
  ]
  const phrase = phrases[tick % phrases.length]!
  return tick % 5 === 0 ? `\n\n${phrase}` : phrase
}

export function stressMarkdownDelta(step: number): string {
  const variants = [
    `### Streaming stress sample ${step + 1}\n\nThe million-message session is intentionally a pure projection/viewport stress stream. Multi-step orchestration is demonstrated in the dedicated Agent-loop session. ${'bounded hot state '.repeat(9)}\n\n`,
    '| check | result |\n| --- | --- |\n| settled prefix | reused |\n| changed tail | patched |\n| total history scan | none |\n\n',
    '```ts\nprojection.appendMarkdownDelta(message, blockId, delta)\n// changed + hot + visible, not total history\n```\n\n',
    '- [x] exact Latest\n- [x] background execution\n- [x] bounded projection cache\n- [x] bounded DOM\n\n',
    '> Stress and product scenarios are separated so each test has one clear responsibility.\n\n',
  ]
  return variants[step % variants.length]!
}

export function settleReasoningBlock(message: LogicalMessage): LogicalMessage | null {
  const index = message.blocks.findIndex(entry => entry.type === 'reasoning')
  if (index < 0) return null
  const current = message.blocks[index]
  if (!current || current.type !== 'reasoning' || current.data.status === 'complete') return null
  const blocks = [...message.blocks]
  blocks[index] = block(current.id, 'reasoning', { ...current.data, status: 'complete' }, (current.revision ?? 0) + 1)
  return { ...message, blocks }
}

export function setLiveToolCall(message: LogicalMessage, spec: LiveToolSpec, status: 'running' | 'success', progress: number): LogicalMessage {
  const id = `live-tool-call-${spec.callId}`
  const replacement = block(id, 'tool-call', {
    name: spec.name,
    callId: spec.callId,
    category: spec.category,
    model: spec.model,
    status,
    progress,
    input: spec.input,
    durationMs: status === 'success' ? 180 + progress * 3 : Math.round(progress * 3),
    defaultOpen: false,
  })
  return replaceOrInsertBeforeAnswer(message, id, replacement)
}

export function createLiveToolResult(message: LogicalMessage, spec: LiveToolSpec): AppendCanonicalMessage {
  return {
    turnId: message.turnId,
    stepId: message.stepId,
    role: 'tool',
    blocks: [block(`live-tool-result-${spec.callId}`, 'tool-result', {
      name: spec.name,
      callId: spec.callId,
      category: spec.category,
      model: spec.model,
      status: 'success',
      progress: 100,
      output: spec.output,
      durationMs: 480,
      defaultOpen: false,
    })],
  }
}

export function createLiveAssistantStep(turnId: string, stepOrdinal: number): AppendCanonicalMessage {
  return {
    turnId,
    stepId: `${turnId}:step-${stepOrdinal}`,
    role: 'assistant',
    live: true,
    blocks: [
      block('reasoning', 'reasoning', { text: '', tokenCount: 0, durationMs: 0, defaultOpen: false, status: 'streaming' }),
      block('answer', 'markdown', { markdown: '' }),
    ],
  }
}

export function addFinalEvidence(message: LogicalMessage, kind: 'diff' | 'code' | 'artifacts'): LogicalMessage {
  if (kind === 'diff') return addBlockBeforeAnswer(message, block('live-final-diff', 'diff', {
    file: 'src/engine/conversation/session-kernel.ts',
    lines: [
      ' for (const entry of entries) {',
      '+  if (entry.turnId !== previousTurnId) turnCount += 1',
      '+  if (entry.stepId !== previousStepId) stepCount += 1',
      '   appendCanonicalMessage(entry)',
      ' }',
      '+kernel.continueExecutionAt(nextAssistantIndex)',
    ],
    defaultOpen: true,
  }))
  if (kind === 'code') return addBlockBeforeAnswer(message, block('live-final-code', 'code', {
    language: 'typescript',
    filename: 'tests/agent-loop.contract.ts',
    defaultOpen: true,
    code: `expect(activeTurnIds).toHaveLength(1)\nexpect(stepIds.size).toBeGreaterThanOrEqual(4)\nexpect(toolCategories).toEqual(expect.arrayContaining(['filesystem', 'search', 'shell']))\nexpect(mountedRows).toBeLessThan(180)\nexpect(maxVisibleRowOverlap).toBeLessThanOrEqual(1)`,
  }))
  return addBlockBeforeAnswer(message, block('live-final-artifacts', 'attachments', {
    title: 'Loop verification artifacts',
    provenance: { origin: 'tool-output', toolCallId: 'loop-run-tests', toolName: 'run_tests' },
    items: [
      { id: 'loop-desktop-proof', name: 'agent-loop-desktop.png', kind: 'image', mimeType: 'image/png', width: 1440, height: 900, sizeBytes: 642_000, seed: 8801 },
      { id: 'loop-mobile-proof', name: 'agent-loop-mobile.png', kind: 'image', mimeType: 'image/png', width: 780, height: 1380, sizeBytes: 514_000, seed: 8802 },
    ],
  }))
}

function replaceOrInsertBeforeAnswer(message: LogicalMessage, id: string, replacement: ContentBlock): LogicalMessage {
  const blocks = [...message.blocks]
  const existing = blocks.findIndex(entry => entry.id === id)
  if (existing >= 0) blocks[existing] = replacement
  else {
    const answerIndex = blocks.findIndex(entry => entry.id === 'answer' && entry.type === 'markdown')
    if (answerIndex < 0) blocks.push(replacement)
    else blocks.splice(answerIndex + 1, 0, replacement)
  }
  return { ...message, blocks }
}

function addBlockBeforeAnswer(message: LogicalMessage, contentBlock: ContentBlock): LogicalMessage {
  if (message.blocks.some(entry => entry.id === contentBlock.id)) return message
  const blocks = [...message.blocks]
  const answerIndex = blocks.findIndex(entry => entry.id === 'answer' && entry.type === 'markdown')
  if (answerIndex < 0) blocks.push(contentBlock)
  else blocks.splice(answerIndex, 0, contentBlock)
  return { ...message, blocks }
}