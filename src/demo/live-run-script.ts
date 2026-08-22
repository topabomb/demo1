import { block, type ContentBlock, type LogicalMessage } from '../engine/model/conversation'

export const LIVE_REASONING_PUBLISHES = 18

/**
 * Demo-only live run script. It deliberately changes presentation shape while the
 * answer is still streaming so the public Demo exercises the same mixed-content
 * path as real Agent turns: reasoning -> tool execution -> diff/code/artifact -> Markdown.
 */
export function applyLiveScenarioMilestone(message: LogicalMessage, publishIndex: number): LogicalMessage | null {
  if (publishIndex === 19) return settleReasoningBlock(message)
  if (publishIndex === 28) return addBlockBeforeAnswer(message, block('live-tool-call', 'tool-call', {
    name: 'read_file',
    callId: 'live-release-read',
    category: 'filesystem',
    status: 'running',
    input: { path: 'src/engine/vue/renderers/MarkdownBlock.vue', range: '1:120' },
    durationMs: 0,
    defaultOpen: false,
  }))
  if (publishIndex === 36) {
    const next = replaceBlock(message, 'live-tool-call', block('live-tool-call', 'tool-call', {
      name: 'read_file', callId: 'live-release-read', category: 'filesystem', status: 'success',
      input: { path: 'src/engine/vue/renderers/MarkdownBlock.vue', range: '1:120' }, durationMs: 74, defaultOpen: false,
    }))
    return addBlockBeforeAnswer(next, block('live-tool-result', 'tool-result', {
      name: 'read_file', callId: 'live-release-read', category: 'filesystem', status: 'success',
      output: { finding: 'continuation metadata changes row classes during streaming', lines: 42 }, durationMs: 74, defaultOpen: false,
    }))
  }
  if (publishIndex === 44) return addBlockBeforeAnswer(message, block('live-diff', 'diff', {
    file: 'src/engine/presentation/projection-engine.ts',
    lines: [
      ' const settledPrefix = blockUnits.slice(0, -1)',
      '-const partCount = settledPrefix.length + chunks.length',
      '+const finalPartIndex = baseIndex + chunks.length - 1',
      '+const hasNextPart = partIndex < finalPartIndex',
      ' // stable prefix units keep object identity',
    ],
    defaultOpen: true,
  }))
  if (publishIndex === 56) return addBlockBeforeAnswer(message, block('live-code', 'code', {
    language: 'typescript',
    filename: 'tests/streaming-layout.contract.ts',
    defaultOpen: true,
    code: `expect(stablePrefixAfter[0]).toBe(stablePrefixBefore[0])\nexpect(formerTail.payload.hasNextPart).toBe(true)\nexpect(lastPart.payload.hasNextPart).toBe(false)\nexpect(maxVisibleRowOverlap).toBeLessThanOrEqual(1)`,
  }))
  if (publishIndex === 68) return addBlockBeforeAnswer(message, block('live-artifact', 'attachments', {
    title: 'Verification artifacts',
    provenance: { origin: 'tool-output', toolCallId: 'live-release-read', toolName: 'verify_ui' },
    items: [
      { id: 'live-desktop-proof', name: 'desktop-proof.png', kind: 'image', mimeType: 'image/png', width: 1440, height: 900, sizeBytes: 642_000, seed: 7411 },
      { id: 'live-mobile-proof', name: 'mobile-proof.png', kind: 'image', mimeType: 'image/png', width: 780, height: 1380, sizeBytes: 514_000, seed: 7412 },
    ],
  }))
  return null
}

export function liveReasoningDelta(tick: number): string {
  const phrases = [
    'Correlate the deployed failure with the renderer change before editing code. ',
    'Preserve stable Message, Block and RenderUnit identities while the live turn grows. ',
    'Keep semantic reader state independent from dynamic DOM measurement. ',
    'Prefer a local presentation fix over changing durable conversation semantics. ',
  ]
  const phrase = phrases[tick % phrases.length]!
  return tick % 5 === 0 ? `\n\n${phrase}` : phrase
}

export function liveAnswerDelta(step: number): string {
  const scripted = [
    '## Release regression investigation\n\n',
    'The failing path is isolated to a presentation-boundary change; canonical history and session state remain correct.\n\n',
    '### Evidence\n\n',
    '| Check | Result |\n| --- | --- |\n| stable message identity | pass |\n| streamed tail identity | needs local fix |\n| semantic anchor | preserved |\n| page overflow | none |\n\n',
    '### Patch shape\n\n',
    '```ts\nconst hasNextPart = partIndex < finalPartIndex\n// settled prefix RenderUnits remain referentially stable\n```\n\n',
    '> The renderer may change physical height, but it must not redefine durable session position.\n\n',
    '### Verification\n\n- [x] mixed live blocks render through the canonical projector\n- [x] tool/result correlation keeps one `callId`\n- [x] code, diff and images re-measure without row overlap\n- [ ] deployed Chromium gate still running\n\n',
    'The remaining work is release verification, not another architecture layer. ',
  ]
  if (step < scripted.length) return scripted[step]!
  const followups = [
    'The live answer continues without rebuilding settled history. ',
    'Only changed hot presentation state is republished. ',
    'Browsing older messages does not stop the Agent run. ',
    'New renderer measurements preserve the committed semantic anchor. ',
  ]
  const phrase = followups[step % followups.length]!
  return step % 9 === 0 ? `\n\n### Ongoing verification\n\n${phrase}` : phrase
}

function settleReasoningBlock(message: LogicalMessage): LogicalMessage | null {
  const index = message.blocks.findIndex(entry => entry.type === 'reasoning')
  if (index < 0) return null
  const current = message.blocks[index]
  if (!current || current.type !== 'reasoning' || current.data.status === 'complete') return null
  const blocks = [...message.blocks]
  blocks[index] = block(current.id, 'reasoning', { ...current.data, status: 'complete' }, (current.revision ?? 0) + 1)
  return { ...message, blocks }
}

function addBlockBeforeAnswer(message: LogicalMessage, contentBlock: ContentBlock): LogicalMessage | null {
  if (message.blocks.some(entry => entry.id === contentBlock.id)) return null
  const blocks = [...message.blocks]
  const answerIndex = blocks.findIndex(entry => entry.id === 'answer' && entry.type === 'markdown')
  if (answerIndex < 0) blocks.push(contentBlock)
  else blocks.splice(answerIndex, 0, contentBlock)
  return { ...message, blocks }
}

function replaceBlock(message: LogicalMessage, id: string, replacement: ContentBlock): LogicalMessage {
  const blocks = [...message.blocks]
  const index = blocks.findIndex(entry => entry.id === id)
  if (index >= 0) blocks[index] = replacement
  return { ...message, blocks }
}
