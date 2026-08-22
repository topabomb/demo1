# Agent Workbench Rendering Engine Architecture

`demo1` is an executable reference for the **front-end rendering infrastructure** shared by long-running Agent workbenches. It deliberately separates three responsibilities:

1. **External adapters** — provider protocol, Agent/model/tool/child orchestration, permission policy, durable persistence, async network/database IO and recovery strategy.
2. **Framework-neutral Engine core (`src/engine/**`, excluding the optional Vue adapter)** — canonical renderable semantics, runtime session truth, bounded projection and semantic viewport policy.
3. **Demo host (`src/demo/**`)** — multi-session product composition, realistic scripted Agent tasks, synthetic histories/playback, diagnostics and the public architecture page.

The core performance target is:

> Normal UI work scales with **changed + hot + visible** state, not total history.

The Engine is intentionally smaller than the workbench. It is not an Agent runtime, provider SDK, project/worktree manager, editor integration, permission system, child-agent scheduler or workspace layout framework.

## 1. Dependency and ownership law

```text
Provider / Agent runtime / persistence / network
        │ normalize + cache
        ▼
┌──────────────────────────────────────┐
│ Framework-neutral Engine core        │
│ canonical semantics · SessionKernel  │
│ projection · semantic viewport       │
└──────────────────────────────────────┘
        │
        ├── optional Vue adapter/renderers
        │
        ▲ consume
┌──────────────────────────────────────┐
│ Demo host                            │
│ workspace/LRU · scenarios · playback│
│ stress history · diagnostics         │
└──────────────────────────────────────┘
```

`src/engine/**` never imports `src/demo/**`. Framework-neutral modules do not depend on Vue, DOM, Virtua or CSS. `src/engine/vue/**` is a reference physical adapter that consumes semantic Engine state; its components and CSS do not define canonical identity.

External/provider adapters own SSE/WebSocket decoding, model/tool-loop decisions, delegated-child scheduling/concurrency, child provider selection, retry/recovery lifecycle, permission evaluation, durable persistence, async fetch/cache fill and provider-specific billing/cache interpretation.

The Demo owns Recent-session metadata, active-session routing, hot-runtime LRU, fake 1M history, playback timing, scripted tool outputs, scripted child lifecycles, diagnostics and browser performance counters.

## 2. Canonical identity model

Provider/runtime events normalize into stable history records:

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

Identity levels are deliberately distinct:

- **Message** — globally addressable history record;
- **Turn** — one user-level interaction lifecycle;
- **Step** — actual producer-owned model/tool execution coordinate;
- **Block** — stable semantic content in a Message;
- **callId** — producer-owned correlation between tool call/result;
- **ResourceRef** — stable host-neutral reference to a file, URL or artifact;
- **AgentRunRef** — stable parent-facing reference to one delegated child run;
- **artifact provenance** — link from generated outputs to their producing call where applicable.

DOM adjacency, virtual-row order, renderer type and “latest unfinished row” are never business identity.

One Turn may append multiple model/tool records over time. The Engine preserves those coordinates but never decides when another Step/tool/child run occurs.

## 3. Workbench rendering primitives

The Engine adds only concepts that are stable across coding/research/office Agent clients and directly useful to rendering/replay.

### 3.1 `ResourceRef`: identity, not navigation

```ts
interface ResourceRef {
  id: string
  kind: 'file' | 'url' | 'artifact'
  uri: string
  label?: string
  range?: {
    startLine: number
    startColumn?: number
    endLine?: number
    endColumn?: number
  }
}
```

A ResourceRef answers **what resource is being referenced and where**, not **what the UI should do when clicked**. VS Code opening, browser routing, preview drawers, download behavior and security policy belong to the host.

`code`, `diff`, attachments and tool activities can reuse the same resource identity instead of inventing incompatible path/url/artifact fields. `diff` has one canonical source of truth: `resource`, not a parallel legacy `file` identity.

### 3.2 Plan is not execution Step

```ts
interface PlanItem {
  id: string
  text: string
  status: 'pending' | 'in-progress' | 'completed' | 'blocked' | 'cancelled'
}
```

A `plan` block reports intended/progress work. `stepId` reports execution that actually happened. They must not be merged: one PlanItem may consume many model/tool Steps, execution may add unplanned Steps, and a Plan can be updated without changing execution identity.

The Engine renders producer-reported Plan state; it does not generate, reorder or schedule the plan.

### 3.3 Tool category is not presentation intent

`ToolCategory` is capability semantics such as `filesystem`, `search` or `shell`. `ToolPresentationIntent` is a renderer-neutral hint describing how the activity is best understood:

```ts
type ToolPresentationIntent =
  | { kind: 'generic' }
  | { kind: 'resources'; resources: readonly ResourceRef[] }
  | { kind: 'changes'; resources?: readonly ResourceRef[] }
  | { kind: 'terminal'; command?: string; cwd?: ResourceRef }
```

Presentation intent does **not** contain panel/side/width/color/component identifiers or host actions. Tool call/result remain separate canonical records linked by `callId`; provider permission decisions remain outside this metadata.

### 3.4 Terminal is a streaming semantic primitive

A `terminal` block carries command, cwd ResourceRef, output, status, exit code and duration. Append-only output publishes:

```ts
{ kind: 'append-terminal', blockId, delta }
```

`ProjectionEngine.appendTerminalDelta(...)` replaces only the stable terminal RenderUnit and preserves unrelated sibling units. Starting, killing, retrying or attaching to a process remains the execution adapter's job.

### 3.5 Delegated child runs: one batch, stable refs, separate child traces

Industry practice converges on a useful boundary: a child Agent normally has its own conversation/session/thread and lifecycle, while the parent needs stable identity, status and a concise result. Foreground children may block the parent flow; background children may continue after the starting call. Multiple sibling children can overlap. The parent UI must not confuse child completion with parent completion, and concurrent children must remain individually addressable.

The Engine therefore uses one canonical `delegation` block:

```ts
type AgentRunMode = 'foreground' | 'background'

type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'interrupted'

interface AgentRunRef {
  runId: string
  title: string
  agent?: string
  mode: AgentRunMode
  status: AgentRunStatus
  childSessionId?: string
  summary?: string
}

interface DelegationBlockData {
  title?: string
  runs: readonly AgentRunRef[]
}
```

The block is intentionally plural even for one child. That avoids separate `agent-run` and `agent-runs` concepts and naturally covers:

- one synchronous/foreground child;
- one detached/background child;
- several parallel background children;
- a mixed parent-visible batch where a foreground review has settled while sibling background audits continue.

`mode` is a **producer-reported relationship to parent flow**, not a scheduler instruction. `status` is the child run's own lifecycle and must not redefine parent `SessionStatus` or `lastTurnReason`.

`childSessionId` is only a stable address. A Host may use it to open/navigate to the child conversation. The Engine does not define that navigation, does not assume child sessions are mounted, and does not maintain a workspace/session tree.

Most importantly, a parent `delegation` block does **not** recursively embed child `LogicalMessage[]`. Child text, reasoning, tool traces, nested descendants and continuation turns stay in the child session/thread. This keeps parent history bounded and attribution correct. If a child itself delegates, that child session can contain its own `delegation` block using the same contract.

The Engine never starts, resumes, interrupts, disposes, routes models for or assigns permissions to a child. It also does not define worktree isolation, max parallelism, background-task collection, parent/child authorization or team messaging.

## 4. Deliberate non-abstraction: no core PresentationSurface

The core does **not** define `conversation`, `changes`, `artifacts`, `preview`, `left-panel`, `right-panel`, tabs or drawers as a projection target.

A host may derive any layout from canonical resources, diffs, artifacts, plans and delegation refs. Encoding surface placement now would couple reusable rendering semantics to one workbench shell. A multi-surface projection contract should be added only if a concrete reusable requirement proves that the same canonical state must independently project into multiple semantic streams.

This is a central boundary: **semantic renderability is Engine responsibility; application layout and style are not.**

## 5. SessionKernel: runtime truth, not persistence or orchestration

`ConversationSessionKernel` owns normalized history access, appended/overridden messages, live execution status, explicit active assistant coordinate, runtime queue, typed blockers, foreground/unread attention, last explicitly settled Turn outcome/failure, normalized accounting and Turn/Step counters.

It does not imply durable persistence. A restart-safe host must persist/restore those facts itself.

`SessionStatus` answers current live state. `lastTurnReason` answers the latest explicitly settled Turn outcome. Therefore:

- `idle` means no execution is currently running, not “completed”;
- `waiting` exists iff one `pendingInteraction` exists;
- a fresh session is `idle + lastTurnReason:null`;
- outcomes are written only by explicit `finishExecution(...)`;
- a restored working session never infers its target from the newest history row; `activeAssistantIndex` is producer/host truth.

Child AgentRun statuses do not participate in this state machine. A background child may still be `running` while the parent session advances to another Step, becomes idle, or finishes; only the external runtime decides those relationships.

`continueExecutionAt(index)` only moves an already-running execution target without resetting Turn timing. It contains no Agent-loop policy.

Approval and question blockers remain separate typed interactions. `requestInteraction(...)` suspends working execution into `waiting`; `resolveInteraction(...)` validates/clears the blocker and returns to outcome-neutral `idle`. Approval/denial/answer/skip does not itself decide whether execution resumes or ends.

## 6. History, projection and bounded work

`ConversationHistorySource` is an intentionally synchronous, globally addressable hot-read contract. Remote DB/API access sits outside it:

```text
remote storage/API
  ↓ async fetch/prefetch
host/provider cache
  ↓ synchronous local range
ConversationHistorySource
  ↓
SessionKernel / ConversationSessionRuntime
```

`ConversationSessionRuntime` keeps a bounded hot segment (reference ~2,048 messages) and projects keyed RenderUnits. Projection caching is bounded; neighbor shifts project only incoming slices; far jumps rebase one bounded window.

High-frequency append paths are explicit:

- reasoning — one stable thinking unit;
- Markdown — mutable parser-aligned tail only;
- terminal — one stable terminal unit.

Delegation status changes are structural updates to one changed Message/Block, never a recursive projection of child history. Presentation state remains rebuildable/disposable.

Markdown chunking and HTML rendering share one Marked GFM parser configuration so lists, tables, blockquotes and fences remain semantically atomic.

## 7. Semantic viewport vs physical rendering

Application position is semantic:

```text
committed reader index
+ exact messages-after
+ committed RenderUnit anchor/offset
+ follow-tail intent
+ atVisualBottom observation
```

The physical adapter owns DOM measurement, scroll handles, ResizeObserver, virtualizer convergence and responsive reflow. Requested navigation commits only after the physical target resolves.

Plan expansion, terminal growth, delegation row changes, media loading or CSS reflow can change row height without redefining reader/Turn/Step identity.

## 8. Optional Vue reference adapter and CSS

`src/engine/vue/**` demonstrates one physical integration using Vue/Virtua. It is not part of the framework-neutral semantic model.

The public Vue surface provides `ConversationViewport`, `RenderUnitView`, per-viewport `RendererRegistry` and `createDefaultRendererRegistry`. Built-in reference renderers include Markdown, reasoning, code, diff, tool, media, Plan, Terminal and Delegation.

CSS is adapter implementation, not Engine semantics:

- `engine.css` — reference viewport/composer/blocker geometry;
- `renderers.css` — existing renderer visuals/containment;
- `workbench-renderers.css` — Plan/Terminal/Delegation reference visuals.

All are scoped under `[data-conversation-engine].conversation-shell`; none may reset `html`, `body` or `#app`. Demo CSS alone owns the host page.

No canonical or RenderUnit contract may contain CSS class, color, width, panel placement or physical scroll state.

## 9. Public API policy

`src/engine/index.ts` exports framework-neutral semantic contracts and core composition objects, including ResourceRef, PlanItem, ToolPresentationIntent, AgentRunRef and AgentRunMode. It intentionally excludes Vue/Demo implementation and runtime tuning/telemetry such as `WINDOW_MESSAGES`, `SHIFT_MESSAGES`, `SessionUiSnapshot` and `ShiftPlan`.

`src/engine/vue/index.ts` exposes intended Vue composition rather than internal node seats or process-global renderer mutation helpers.

The repository builds a Vite Demo/Pages application with npm publication disabled. The Engine is source-level reusable/extraction-ready; package distribution remains a separate future release concern.

## 10. Demo: executable proof, not architecture source of truth

The default coding-agent scenario demonstrates one realistic Turn:

```text
visible Plan
→ reasoning + rich streaming GFM
→ resource-aware filesystem call/result
→ next model Step
→ resource-aware search call/result
→ next model Step
→ one foreground delegated review already completed
→ two background child audits still running
→ parent advances into shell call + live Terminal
→ background child statuses independently become completed
→ next model Step
→ final synthesis + ResourceRef diff/code + artifacts
→ completed Plan
```

Tool calls/results are standalone canonical records; terminal output is a live role:tool record; delegated child work is one `delegation` block with stable per-child identities. Child detailed traces are deliberately absent from the parent record.

The separate million-message session remains a pure projection/viewport stress test. It intentionally does not reuse workbench orchestration so its evidence remains interpretable.

Other scenarios cover typed blockers, failure/resume, background execution during viewport eviction, resource-aware changes, multimodal artifacts, TTS/ASR and responsive content.

Diagnostics are Demo-owned observability. They may read Engine evidence and expose synthetic controls, but those controls never become Engine APIs.

## 11. Explicit Engine non-goals

Do not add the following to this rendering Engine merely because Agent workbenches use them:

- Project/repository/worktree lifecycle;
- Agent/model routing or child-agent scheduling/concurrency;
- child provider selection, permissions, resume/interrupt/disposal semantics;
- Agent Teams/shared-task/member-messaging semantics;
- permission/allowlist evaluation;
- MCP/skills registry;
- process/background-job manager;
- editor/resource/child-session opening behavior;
- preview server lifecycle;
- Changes/Artifacts/Preview panel layout;
- sidebar/tab/drawer/workspace navigation;
- durable cloud sync or provider retry policy.

If a future feature needs one of these, integrate it through host/external adapters and add only the minimum stable renderable semantic evidence to the Engine.

## 12. Verification contract

A release must prove architecture and behavior together:

- Engine never imports Demo and framework-neutral code never imports Vue/DOM;
- canonical workbench semantics contain no layout/style/orchestration fields;
- Plan remains distinct from Step;
- ToolCategory remains distinct from ToolPresentationIntent;
- ResourceRef carries identity/location only, not host actions;
- one `delegation` block covers single/multiple foreground/background child refs;
- child run status never redefines parent SessionStatus/Turn outcome;
- child detailed traces are not recursively copied into parent canonical state;
- terminal append patches one stable RenderUnit and preserves unrelated siblings;
- session/blocker/outcome/history invariants remain unchanged;
- realistic Demo data enters only through canonical Message/Block mutations;
- Demo proves parent progress while background child statuses remain independently live;
- 1M history keeps hot state/cache/DOM bounded;
- exact Latest/reader/anchor behavior survives variable-height workbench content;
- optional Vue CSS stays host-scoped;
- local production and deployed Pages run the same full Chromium suite.

The exact `main` SHA is released only when unit/architecture tests, strict build, local Chromium, Pages deployment and deployed-site Chromium are all Green.
