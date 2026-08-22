# Agent Workbench Rendering Engine Architecture

`demo1` is an executable reference for **front-end rendering infrastructure** shared by long-running coding, research and office Agent workbenches. It separates three responsibilities:

1. **External adapters** — provider protocol, Agent/model/tool/child orchestration, enterprise connectors/authentication, permission policy, real external side effects, durable persistence, async IO and recovery.
2. **Framework-neutral Engine core (`src/engine/**`, excluding Vue)** — canonical renderable semantics, runtime session truth, bounded projection and semantic viewport policy.
3. **Demo host (`src/demo/**`)** — multi-session product composition, realistic scripted coding/office tasks, synthetic histories/playback, diagnostics and the public architecture page.

The performance target is:

> Normal UI work scales with **changed + hot + visible** state, not total history.

The Engine is intentionally smaller than a workbench product. It is not an Agent runtime, connector SDK, workflow scheduler, office automation layer, editor integration, permission system, child-Agent scheduler or layout framework.

## 1. Dependency and ownership law

```text
Provider / Agent runtime / connectors / persistence / network
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

`src/engine/**` never imports `src/demo/**`. Framework-neutral modules do not depend on Vue, DOM, Virtua or CSS. `src/engine/vue/**` is an optional physical adapter and cannot define canonical identity.

External adapters own SSE/WebSocket/provider decoding, model/tool loops, delegated-child scheduling/concurrency, model/provider selection, app authentication, mail/calendar/document connectors, actual external writes, retries, durable persistence, async fetch/cache fill and provider-specific accounting.

The Demo owns Recent-session metadata, active-session routing, hot-runtime LRU, fake 1M history, playback timing, scripted source/tool/child evidence, fake office actions, diagnostics shortcuts and browser performance counters.

## 2. Canonical identity model

Provider/runtime events normalize into stable records:

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

Identity levels are distinct:

- **Message** — globally addressable history record;
- **Turn** — one user-level interaction lifecycle;
- **Step** — actual producer-owned model/tool execution coordinate;
- **Block** — stable semantic content inside a Message;
- **callId** — producer-owned tool call/result correlation;
- **ResourceRef** — stable host-neutral file/URL/artifact identity;
- **AgentRunRef** — stable parent-facing delegated-child identity/status reference.

DOM adjacency, virtual-row order, renderer type, connector name and “latest unfinished row” are never business identity.

## 3. Stable rendering primitives

The Engine keeps only concepts that survive across coding, research and office clients.

### 3.1 ResourceRef: identity, not navigation or connector policy

```ts
interface ResourceRef {
  id: string
  kind: 'file' | 'url' | 'artifact'
  uri: string
  label?: string
  range?: ResourceRange
}
```

A ResourceRef answers **what resource and where**. It does not say whether the host opens VS Code, a browser, Gmail, Outlook, Drive, a drawer or nothing. Security, authentication and routing remain host/external-adapter concerns.

The same identity is reused by code, diff, attachments and tool activity. Office Demo sources such as a mail thread, meeting and workbook are simply URL ResourceRefs; this deliberately avoids provider-specific core contracts.

### 3.2 Plan is not execution Step

`PlanItem` reports intended/progress work through `pending | in-progress | completed | blocked | cancelled`. `stepId` reports execution that actually happened. One Plan item may span many Steps; execution can diverge from a Plan.

The Engine renders producer-reported Plan state and never generates or schedules it.

### 3.3 Tool category is not presentation intent

`ToolCategory` names a capability family (`filesystem`, `search`, `shell`, `productivity`, or another producer-defined category). `ToolPresentationIntent` is a renderer-neutral interpretation:

```ts
type ToolPresentationIntent =
  | { kind: 'generic' }
  | { kind: 'resources'; resources: readonly ResourceRef[] }
  | { kind: 'changes'; resources?: readonly ResourceRef[] }
  | { kind: 'terminal'; command?: string; cwd?: ResourceRef }
```

Presentation intent never contains panel/side/width/color/component IDs, connector routing, host actions or permission rules. Tool call/result stay separate canonical records linked by `callId`.

This generic contract is enough for coding reads/searches and office work-context retrieval. The Engine does not need `GmailTool`, `CalendarResult` or `MicrosoftGraphAction` types.

### 3.4 Terminal is a streaming primitive

A terminal block carries command, cwd ResourceRef, output, status, exit code and duration. Append-only output emits `{ kind: 'append-terminal', blockId, delta }`; `ProjectionEngine.appendTerminalDelta(...)` replaces only the stable terminal RenderUnit.

Starting, killing, retrying or attaching to a process remains execution-adapter policy.

### 3.5 Delegated children: one batch, stable refs, separate traces

```ts
type AgentRunMode = 'foreground' | 'background'
type AgentRunStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'interrupted'

interface AgentRunRef {
  runId: string
  title: string
  agent?: string
  mode: AgentRunMode
  status: AgentRunStatus
  childSessionId?: string
  summary?: string
}
```

One plural `delegation` block covers one synchronous/foreground child, one detached child, several parallel children, or a mixed batch. `mode` is a producer-reported relationship to parent flow, not a scheduling instruction.

`childSessionId` is only an address. Parent history does **not** recursively embed child `LogicalMessage[]`; child reasoning/tools/nested delegations remain in the child session/thread. Child status never redefines parent SessionStatus or Turn outcome.

The Engine never starts, resumes, interrupts, disposes, routes models for or assigns permissions to a child.

## 4. Deliberate non-abstraction: no core PresentationSurface

There is intentionally **no core PresentationSurface** for conversation, changes, artifacts, preview, left/right panels, tabs or drawers.

A host may derive any layout from canonical resources/diffs/artifacts/plans/delegation refs. Encoding placement in core would couple reusable rendering semantics to one product shell.

**Semantic renderability is Engine responsibility; application layout and style are not.**

## 5. SessionKernel is runtime truth, not workflow execution

`ConversationSessionKernel` owns normalized history access, appended/overridden messages, current live status, explicit active assistant coordinate, queue, typed blockers, foreground/unread attention, last settled Turn outcome/failure, accounting and Turn/Step counters.

`SessionStatus` and `lastTurnReason` are independent:

- `idle` means no execution is running, not “completed”;
- `waiting` exists iff one `pendingInteraction` exists;
- outcomes are written only by explicit `finishExecution(...)`;
- restored working sessions use explicit `activeAssistantIndex`, never inferred history order.

Approval/question blockers are typed session facts. `requestInteraction(...)` moves working→waiting; `resolveInteraction(...)` validates and clears the blocker and returns to outcome-neutral idle. It does **not** interpret “approved” as “send email”, “create meeting”, “edit file” or “resume model”. The external execution adapter owns that consequence.

This distinction is central to the office Demo: a staged follow-up + calendar review can be visibly waiting for approval without turning the rendering Engine into an office action runtime.

## 6. Office/knowledge-work Demo mapping

Current enterprise Agent products commonly combine work-context retrieval, deep research, plans/progress, artifact generation, meeting/email follow-up and approval before actions. `demo1` demonstrates those **rendering consequences** without importing the product/runtime layer.

### 6.1 Executive briefing

Demo-owned synthetic producers publish:

```text
mail thread ResourceRef
calendar event ResourceRef
KPI document ResourceRef
external web ResourceRef
        ↓
generic search tool call/result
        ↓
Plan + delegation (foreground synthesis + background specialists)
        ↓
decision-oriented Markdown
        ↓
DOCX / PPTX / XLSX artifact ResourceRefs
```

No connector protocol enters Engine. A real host may fetch the same kind of evidence from Google Workspace, Microsoft 365, Slack, Notion or another system and normalize it to these contracts.

### 6.2 Meeting follow-up approval

Demo-owned synthetic producers publish:

```text
meeting transcript + mail thread + brief ResourceRefs
        ↓
resource-aware context tool result
        ↓
Plan + draft
        ↓
staged productivity tool call
        ↓
PendingApproval
```

The final send/schedule Plan item is `blocked` while the session is `waiting`. Approve/Deny clears the generic blocker. A real external adapter decides whether to send the mail or create the calendar event. The Demo does not claim an external side effect happened.

### 6.3 What does not move into Engine

Even when an office product needs them, the following stay outside core:

- Gmail/Outlook/Calendar/Drive/Teams/SharePoint connector schemas and auth;
- recipient/contact resolution;
- email send/draft/forward semantics;
- calendar availability/invite/update semantics;
- Word/Docs/Sheets/Slides editing APIs;
- scheduled or recurring Agent workflows;
- app-specific confirmation policy;
- organization search and permissions.

Only stable renderable evidence should cross the boundary.

## 7. History, projection and bounded work

`ConversationHistorySource` is a synchronous globally addressable hot-read contract. Async DB/API/connector access sits outside it:

```text
remote API / enterprise connector
  ↓ async fetch/prefetch
host/provider cache
  ↓ synchronous local range
ConversationHistorySource
  ↓
SessionKernel / ConversationSessionRuntime
```

`ConversationSessionRuntime` keeps a bounded hot segment (~2,048 messages in the reference implementation) and keyed RenderUnits. Neighbor shifts project only incoming slices; far jumps rebase one hot window.

High-frequency append paths remain explicit:

- reasoning — one stable thinking unit;
- Markdown — mutable parser-aligned tail;
- terminal — one stable terminal unit.

Delegation status updates reproject one parent block, never child history recursively. Presentation is rebuildable/disposable.

## 8. Semantic viewport vs physical rendering

Application position is semantic:

```text
committed reader index
+ exact messages-after
+ committed RenderUnit anchor/offset
+ follow-tail intent
+ visual-bottom observation
```

The physical adapter owns DOM measurement, ResizeObserver, virtualizer convergence and responsive reflow. Plan expansion, terminal growth, delegation changes, office artifact rows and media loading may change physical height without redefining reader/Turn/Step identity.

## 9. Optional Vue adapter and CSS

`src/engine/vue/**` demonstrates one physical Vue/Virtua integration. It is not part of the framework-neutral model.

Built-in reference renderers include Markdown, reasoning, code, diff, tool, media, Plan, Terminal and Delegation. Office scenarios intentionally reuse those renderers; there is no special “office renderer”.

CSS is adapter implementation:

- `engine.css` — reference viewport/composer/blocker geometry;
- `renderers.css` — renderer visuals/containment;
- `workbench-renderers.css` — Plan/Terminal/Delegation visuals.

All Engine Vue styles are scoped under `[data-conversation-engine].conversation-shell`; Demo CSS alone owns the host page.

## 10. Demo is executable proof, not architecture source of truth

The default coding-Agent scenario demonstrates Plan → resource-aware tools → foreground/background children → streaming terminal → final diff/code/artifacts.

The office scenarios add:

- **Executive briefing** — cross-source ResourceRefs, parallel specialist delegation, decision brief, DOCX/PPTX/XLSX artifacts;
- **Meeting follow-up** — transcript/mail/document evidence, owners/dates, draft, blocked send/schedule Plan item and session approval.

The separate million-message scenario remains a pure projection/viewport stress proof.

Diagnostics are Demo-owned observability. Their **Restart / Plan / Delegation / Terminal / Final / Executive briefing / Meeting approval** shortcuts switch or jump to existing Demo evidence. They do not define Engine replay, scenario, navigation or connector APIs.

## 11. Public API policy

`src/engine/index.ts` exports framework-neutral semantics and core composition objects. It intentionally excludes Vue/Demo implementation, office-provider concepts and runtime tuning/telemetry such as `SessionUiSnapshot`, `ShiftPlan`, `WINDOW_MESSAGES` and `SHIFT_MESSAGES`.

The repository is a Vite Demo/Pages application with package publishing disabled. The Engine is source-level reusable/extraction-ready; package distribution remains separate.

## 12. Explicit Engine non-goals

Do not add these merely because Agent products use them:

- project/repository/worktree lifecycle;
- Agent/model routing or child scheduling/concurrency;
- child provider selection, permissions, resume/interrupt/disposal;
- enterprise connector/auth protocols;
- mail/calendar/document external action execution;
- scheduled/recurring workflow orchestration;
- permission/allowlist evaluation;
- MCP/skills registry;
- process/background-job manager;
- editor/resource/child-session opening behavior;
- Changes/Artifacts/Preview panel layout;
- sidebar/tab/drawer/workspace navigation;
- durable cloud sync or provider retry policy.

If a future feature needs one of these, integrate it through host/external adapters and add only the minimum stable renderable evidence to Engine.

## 13. Verification contract

A release must prove architecture and behavior together:

- Engine never imports Demo and framework-neutral code never imports Vue/DOM;
- canonical semantics contain no layout/style/orchestration/connector fields;
- Plan remains distinct from Step;
- ToolCategory remains distinct from ToolPresentationIntent;
- ResourceRef carries identity/location only;
- delegation covers foreground/background child refs without child trace recursion;
- child status never redefines parent state;
- terminal append patches one stable RenderUnit;
- office scenarios reuse ResourceRef/tool/delegation/attachments/PendingApproval rather than new provider-specific Engine concepts;
- external office side effects remain outside Engine;
- realistic Demo data enters only through canonical Message/Block mutations;
- Diagnostics shortcuts remain Demo-owned;
- 1M history keeps hot state/cache/DOM bounded;
- semantic viewport survives variable-height workbench content;
- optional Vue CSS stays host-scoped;
- local production and deployed Pages run the same full Chromium suite.

The exact `main` SHA is released only when unit/architecture tests, strict build, local Chromium, Pages deployment and deployed-site Chromium are all Green.
