# Agent Workbench Rendering Engine Architecture

`demo1` is an executable reference for **front-end conversation/session rendering infrastructure** shared by long-running coding, research and office Agents.

The core rule is not “keep Engine as small as possible”. It is:

> **Put stable, cross-product renderable semantics and their consistency rules in Engine; keep provider execution, product workflow policy and physical UI composition outside it.**

Normal UI work should scale with **changed + hot + visible** state, not total history.

## 1. Ownership law

```text
Provider / Agent runtime / connectors / persistence / network
        │ normalize history + explicit session truth
        ▼
Framework-neutral Engine (`src/engine/**`, excluding Vue)
  canonical identity/history
  SessionKernel current truth + invariants
  bounded projection
  semantic viewport policy
        │
        ├── optional Vue reference adapter (`src/engine/vue/**`)
        │
        ▲ consume
Demo host (`src/demo/**`)
  workspace/session routing
  realistic scripted scenarios
  fake runtime/actions/sources
  synthetic playback/stress/diagnostics
```

### Engine owns

- Message / Turn / Step / Block identity;
- tool `callId`, `ResourceRef`, `AgentRunRef`;
- canonical replayable content;
- explicit current `WorkPlan`;
- session execution status, typed pending interactions and exact interaction identity;
- explicit Turn outcome/failure/accounting;
- producer-reported tool/terminal/child execution facts;
- bounded projection and semantic reader/Latest/anchor/follow state.

These are reusable facts a renderer must preserve correctly across providers and products.

### External runtime owns

- provider protocol and model/tool loops;
- actual tool/process/external side-effect execution;
- post-approval/post-answer continuation;
- retries, retryability, backoff, fallback choice and confidence policy;
- child scheduling/concurrency/provider selection;
- connector authentication and permissions;
- async network/DB IO and durable persistence.

### Demo/Host owns

- multi-session workspace composition and Recent metadata;
- parent/child navigation topology;
- scenario selection and fake execution;
- synthetic large history/playback;
- diagnostics shortcuts and performance counters;
- product layout and the public architecture view.

`src/engine/**` never imports Demo. Framework-neutral layers never depend on Vue/DOM/Virtua/CSS. `src/engine/vue/**` is a replaceable physical adapter.

## 2. Identity layers must remain distinct

```ts
interface LogicalMessage {
  id: string
  index: number
  turnId: string
  stepId?: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  blocks: readonly ContentBlock[]
  revision?: number
  live?: boolean
}
```

- **Message** — globally addressable history record.
- **Turn** — user-level interaction lifecycle.
- **Step** — actual producer/model/tool execution coordinate.
- **Block** — stable semantic content inside a Message.
- **callId** — producer-owned tool call/result identity.
- **ResourceRef** — host-neutral file/URL/artifact identity.
- **AgentRunRef** — parent-facing delegated-child identity/status.
- **interaction id** — identity of one current session blocker.
- **Session state** — explicit current truth, never inferred from viewport/history position.

DOM adjacency, connector name, virtual-row order, panel placement and “latest unfinished card” are never business identity.

## 3. Replayable history vs current session truth

### Plan snapshot ≠ current WorkPlan

A canonical `plan` block is replayable history. `stepId` says what execution actually happened. `ConversationDescriptor.activePlan` is explicit current work state:

```ts
type WorkPlan = ContentBlockMap['plan']

interface ConversationDescriptor {
  activePlan?: WorkPlan | null
}
```

`WorkPlan` deliberately aliases the canonical Plan shape rather than creating a second task model. `SessionKernel` never scans latest history or DOM to infer it.

### Pending interaction is current truth

Questions/approvals are not inferred from text cards. A waiting session has exactly one typed `PendingInteraction`.

```ts
interface PendingApproval {
  id: string
  kind: 'approval'
  title: string
  detail: string
  toolName?: string
  callId?: string
}

type InteractionResolution =
  | { interactionId: string; kind: 'approval'; approved: boolean }
  | { interactionId: string; kind: 'question'; answer: string | null }
```

`interactionId` identifies the blocker. Tool `callId` identifies a canonical tool call. They are different identities; `PendingApproval.callId` only correlates them when one approval concerns one exact call.

This distinction prevents a delayed response to an older approval/question from clearing a newer same-kind blocker.

## 4. Approval boundary: proposed call ≠ execution

A common flow is:

```text
canonical proposed tool call (callId)
        │
        ├── no execution status yet
        │
        ▼
PendingApproval { id, callId? }
        │
        ▼
InteractionResolution { interactionId, decision }
        │ Engine validates/clears blocker
        ▼
outcome-neutral idle
        │
        └── external runtime chooses execute / reject / resume / new Turn
```

The Engine owns correlation and session-state consistency because they are generic rendering semantics. It does **not** interpret an approval as a side effect.

A tool `status`, `progress`, `durationMs` or result is producer-reported execution truth. If the producer has not executed a proposed action, status may be absent. Projection and reference renderers must not convert absence into `running` or `success`.

This yields the following hard invariants:

- `status:'waiting'` iff one `pendingInteraction` exists;
- resolution must match the exact current interaction id and kind;
- `finishExecution(...)` cannot settle a session while a blocker remains;
- `startExecution(...)` cannot reset an already-working execution;
- Engine getters/summaries do not expose mutable references to internal blocker/failure state;
- resolving an interaction clears generic blocker state only; provider continuation is external policy.

## 5. Tool semantics: capability, presentation and execution are separate

`ToolCategory` describes capability; `ToolPresentationIntent` describes renderer-neutral interpretation:

```ts
type ToolPresentationIntent =
  | { kind: 'generic' }
  | { kind: 'resources'; resources: readonly ResourceRef[] }
  | { kind: 'changes'; resources?: readonly ResourceRef[] }
  | { kind: 'terminal'; command?: string; cwd?: ResourceRef }
```

Presentation intent contains no panel/width/color/component/connector/permission behavior.

Tool call/result remain separate canonical records correlated by `callId`. Top-level tool `resources` are semantic evidence exposed to the renderer; any ResourceRefs repeated inside presentation intent must refer to the same identities and never create a parallel resource identity system. A future cleanup may reduce this duplication, but it does not justify connector-specific resource types.

## 6. Terminal and delegated children

Terminal is a first-class streaming primitive. Append-only output patches one stable RenderUnit. Process start/kill/retry/attach remains runtime policy.

A plural `delegation` block carries one or more `AgentRunRef`s:

```ts
type AgentRunMode = 'foreground' | 'background'
type AgentRunStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'interrupted'
```

`mode` is parent-facing observation, never a scheduling command. `childSessionId` is a semantic address, not a core session tree. Child traces stay in independent conversation sessions.

A failed child is renderable evidence, not a parent outcome or retry instruction. Siblings and parent may continue if the runtime chooses that policy.

## 7. SessionKernel is truth storage, not workflow execution

`ConversationSessionKernel` owns normalized history access, appended/overridden messages, live status, active assistant coordinate, current WorkPlan, queue, typed blockers, foreground/unread attention, last settled Turn outcome/failure, accounting and Turn/Step counters.

It does not own:

- retry/fallback/resume policy;
- what a user answer means to the model;
- actual approved tool execution;
- office/mail/calendar semantics;
- workspace navigation or child orchestration.

`SessionStatus`, `activePlan` and `lastTurnReason` are independent facts. `idle` means no current execution, not “completed”; a failure/interruption remains explicit historical/session evidence and does not dictate the next Turn.

## 8. Resource and layout boundaries

`ResourceRef` answers **what/where**, not **how to open**. Security, connector auth and editor/browser/app routing stay outside Engine.

There is intentionally **no core `PresentationSurface`**. Conversation/changes/artifacts/preview/composer/sidebars/tabs/drawers are product surfaces derived by hosts.

**Semantic renderability is Engine responsibility; application layout and style are not.**

## 9. History, projection and viewport scaling

`ConversationHistorySource` is a synchronous hot-read contract. Async fetch/prefetch/cache fill happens outside Engine before exposing a local range.

The reference runtime keeps a bounded hot history segment (~2,048 messages) and keyed RenderUnits. Neighbor shifts project only incoming slices; far jumps rebase one bounded window. Markdown/reasoning/terminal deltas patch stable units incrementally.

Semantic reader/Latest/anchor/follow state is independent of DOM measurement. Vue/Virtua owns physical measurement, ResizeObserver and responsive convergence.

## 10. Executable Demo mapping

All scenarios use normal canonical/session/projector/renderer paths:

- **Coding Agent:** resources/tools → mixed foreground/background delegation → streaming terminal → diff/code/artifacts.
- **Executive briefing:** mail/calendar/docs/web ResourceRefs → evidence tools → specialist delegation → DOCX/PPTX/XLSX.
- **Meeting follow-up:** sources/draft → blocked Plan/WorkPlan → proposed productivity call **without execution status** → PendingApproval correlated to that callId.
- **Production config approval:** exact diff → proposed `edit_file` call without execution status → PendingApproval.
- **Clarify → continue:** PendingQuestion → exact InteractionResolution → subsequent execution may start.
- **Partial child failure:** failed child remains evidence; Demo/runtime selects a cached fallback and parent completes.
- **Interrupt → steer:** interrupted terminal/Turn stays history; later user direction becomes a separate Turn.
- **Million-message stress:** 1M+ addressable records with bounded hot/cache/DOM work.

The Demo proves these combinations; it is not the source of Engine architecture.

## 11. Explicit Engine non-goals

Do not add these merely because Agent products use them:

- Agent/model/provider routing or child scheduling;
- retry budget, retryability, backoff, fallback-source/confidence or automatic recovery policy;
- post-approval/post-answer provider continuation;
- project/worktree/process/background-job lifecycle;
- enterprise connector/auth and permission policy;
- real mail/calendar/document/tool side effects;
- scheduled/recurring workflow orchestration;
- parent/child workspace topology/navigation;
- editor/resource opening behavior;
- panel/sidebar/tab/drawer/preview/composer placement;
- durable cloud sync or async persistence.

## 12. Public API policy

`src/engine/index.ts` exports framework-neutral semantics/core composition only. `src/engine/vue/index.ts` exports optional physical reference components. Demo/session-tree/workflow/recovery policy and tuning telemetry stay out of the neutral public entry.

The repository is a Vite/Pages application with package publishing disabled; source extraction/reuse is supported, npm distribution is a separate concern.