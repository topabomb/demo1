import type { ConversationDescriptor, PendingInteraction } from '../engine/conversation/contracts'

export interface DemoSessionDescriptor extends ConversationDescriptor {
  age: string
}

export interface DemoSessionSeed extends DemoSessionDescriptor {
  seedOffset: number
  liveTail?: boolean
}

const approval: PendingInteraction = {
  id: 'approval-edit-config',
  kind: 'approval',
  title: 'Approve workspace edit',
  detail: 'The agent wants to edit src/runtime/config.ts. This blocker belongs to the session and survives navigation or viewport eviction.',
  toolName: 'edit_file',
}

const question: PendingInteraction = {
  id: 'question-android-target',
  kind: 'question',
  title: 'Choose target API behavior',
  detail: 'The agent needs a user decision before it can continue the Android protocol turn.',
}

function usage(inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheWriteTokens: number, reasoningTokens = 0) {
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens }
}

export const RECENT_SESSIONS: readonly DemoSessionSeed[] = [
  { id: 'million', title: 'Million-message stress session', age: 'now', status: 'working', logicalCount: 1_000_000, seedOffset: 0, liveTail: true, usage: usage(184_000, 12_600, 936_000, 31_000, 3_900), context: { projectedTokens: 103_400, contextWindow: 128_000 }, turnCount: 42_100, stepCount: 81_900 },
  { id: 'dsh-transport', title: 'DSH transport architecture', age: '14m', status: 'idle', logicalCount: 180_000, seedOffset: 101, lastTurnReason: 'completed', usage: usage(62_000, 8_400, 281_000, 14_000, 2_100), context: { projectedTokens: 74_200, contextWindow: 128_000 }, turnCount: 8_200, stepCount: 15_400 },
  { id: 'tool-rendering', title: 'Virtualized tool-call rendering', age: '1h', status: 'waiting', logicalCount: 420_000, seedOffset: 211, pendingInteraction: approval, lastTurnReason: 'blocked', usage: usage(91_000, 13_100, 452_000, 18_000, 2_800), context: { projectedTokens: 91_700, contextWindow: 128_000 }, turnCount: 18_900, stepCount: 39_200 },
  { id: 'event-normalization', title: 'Agent event normalization', age: '2h', status: 'idle', logicalCount: 95_000, seedOffset: 307, lastTurnReason: 'completed', usage: usage(34_000, 5_900, 149_000, 7_100, 1_300), context: { projectedTokens: 52_400, contextWindow: 128_000 }, turnCount: 4_300, stepCount: 8_700 },
  { id: 'dynamic-heights', title: 'Dynamic height edge cases', age: '4h', status: 'interrupted', logicalCount: 260_000, seedOffset: 401, lastTurnReason: 'interrupted', usage: usage(78_000, 10_700, 321_000, 11_800, 2_000), context: { projectedTokens: 86_900, contextWindow: 128_000 }, turnCount: 11_800, stepCount: 22_700 },
  { id: 'workspace-files', title: 'Workspace filesystem design', age: '1d', status: 'idle', logicalCount: 48_000, seedOffset: 503, lastTurnReason: 'completed', usage: usage(21_000, 3_500, 88_000, 5_200, 800), context: { projectedTokens: 39_800, contextWindow: 128_000 }, turnCount: 2_200, stepCount: 4_100 },
  { id: 'android-protocol', title: 'Android client protocol notes', age: '2d', status: 'waiting', logicalCount: 24_000, seedOffset: 601, pendingInteraction: question, lastTurnReason: 'blocked', usage: usage(18_000, 2_800, 64_000, 3_900, 600), context: { projectedTokens: 31_600, contextWindow: 128_000 }, turnCount: 1_100, stepCount: 2_300 },
  { id: 'context-cache', title: 'Long context cache analysis', age: '3d', status: 'idle', logicalCount: 700_000, seedOffset: 701, lastTurnReason: 'error', lastFailure: { code: 'PROVIDER_TIMEOUT', message: 'Provider request timed out after the retry budget was exhausted.', status: 504, requestId: 'req-demo-cache-timeout' }, usage: usage(128_000, 17_400, 812_000, 28_000, 4_800), context: { projectedTokens: 118_500, contextWindow: 128_000 }, turnCount: 31_500, stepCount: 63_100 },
]

export function newSessionSeed(counter: number): DemoSessionSeed {
  return {
    id: `new-${counter}`,
    title: `New agent session ${counter}`,
    age: 'now',
    status: 'idle',
    logicalCount: 0,
    seedOffset: 900 + counter,
    lastTurnReason: null,
    usage: usage(0, 0, 0, 0, 0),
    context: { projectedTokens: 0, contextWindow: 128_000 },
    turnCount: 0,
    stepCount: 0,
  }
}
