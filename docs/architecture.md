# Agent Workbench Rendering Engine Architecture

`demo1` is an executable reference for **front-end conversation/session rendering infrastructure** shared by long-running coding, research and office Agent workbenches. It separates three responsibilities:

1. **External adapters** — provider protocol, Agent/model/tool/child orchestration, enterprise connectors/authentication, permission policy, real external side effects, durable persistence, async IO and recovery policy.
2. **Framework-neutral Engine core (`src/engine/**`, excluding Vue)** — canonical history semantics, explicit renderable session truth, bounded projection and semantic viewport policy.
3. **Demo host (`src/demo/**`)** — multi-session product composition/navigation, realistic scripted coding/office/lifecycle tasks and child transcripts, synthetic histories/playback, diagnostics and the public architecture page.

The performance target is:

> Normal UI work scales with **changed + hot + visible** state, not total history.

The Engine is intentionally smaller than a workbench product. It is not an Agent runtime, connector SDK, workflow scheduler, office automation layer, editor integration, permission system, child-Agent scheduler, recovery-policy engine, session-tree router or layout framework.

## 1. Dependency and ownership law

```text
Provider / Agent runtime / connectors / persistence / network
        │ normalize + cache + explicit session state
        ▼
┌──────────────────────────────────────┐
│ Framework-neutral Engine core        │
│ history semantics · SessionKernel    │
│ projection · semantic viewport       │
└──────────────────────────────────────┘
        │
        ├── optional Vue adapter/renderers
        │
        ▲ consume
┌──────────────────────────────────────┐
│ Demo host                            │
│ workspace/navigation · scenarios     │
│ playback · stress · diagnostics      │
└──────────────────────────────────────┘
```

`src/engine/**` never imports `src/demo/**`. Framework-neutral modules do not depend on Vue, DOM, Virtua or CSS. `src/engine/vue/**` is an optional physical adapter and cannot define canonical/session identity.

External adapters own SSE/WebSocket/provider decoding, model/tool loops, delegated-child scheduling/concurrency, model/provider selection, app authentication, mail/calendar/document connectors, actual external writes, retries/backoff, fallback choice, durable persistence, async fetch/cache fill and provider-specific accounting.

The Demo owns Recent metadata, active-session routing, parent/child workspace relationships, hot-runtime LRU, fake 1M history, playback timing, scripted source/tool/child evidence, fake office actions, lifecycle/recovery scenarios, diagnostics shortcuts and browser performance counters.

## 2. Identity and state layers

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

Identity levels are distinct:

- **Message** — globally addressable history record;
- **Turn** — one user-level interaction lifecycle;
- **Step** — actual producer-owned model/tool execution coordinate;
- **Block** — stable semantic content inside a Message;
- **callId** — producer-owned tool call/result correlation;
- **ResourceRef** — stable host-neutral file/URL/artifact identity;
- **AgentRunRef** — stable parent-facing delegated-child identity/status reference;
- **Session state** — current status/blocker/queue/accounting/current WorkPlan, explicitly supplied rather than inferred from history position.

DOM adjacency, virtual-row order, renderer type, connector name, “latest unfinished row”, and panel placement are never business identity.

## 3. Stable semantic primitives

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

### 3.2 Historical Plan snapshot, execution Step and current WorkPlan are distinct

`PlanItem` reports intended/progress work through `pending | in-progress | completed | blocked | cancelled`. `stepId` reports execution that actually happened. One Plan item may span many Steps; execution can diverge from a Plan.

A canonical `plan` block is a **replayable historical snapshot**. It answers “what plan did the producer publish at this point in the conversation?” It is not automatically authoritative current session state.

The Engine therefore also exposes:

```ts
type WorkPlan = ContentBlockMap['plan']

interface ConversationDescriptor {
  activePlan?: WorkPlan | null
}
```

This does **not** introduce a second todo model: `WorkPlan` aliases the exact same Plan block data shape. `ConversationSessionKernel.setActivePlan(...)` is an explicit producer/session mutation. The Kernel never searches latest history, mounted rows or DOM to infer it.

A real adapter may normalize one provider event into both:

1. a canonical `plan` snapshot for replay/history; and
2. the same value as current `activePlan` for session chrome.

The Demo does exactly this from producer mutation events, not from viewport state. This prevents the common failure mode where the chat shows one plan while the status area guesses another state from child/runtime activity.

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

### 3.4 Terminal is a streaming primitive

A terminal block carries command, cwd ResourceRef, output, status, exit code and duration. Append-only output emits `{ kind: 'append-terminal', blockId, delta }`; `ProjectionEngine.appendTerminalDelta(...)` replaces only the stable terminal RenderUnit.

Starting, killing, retrying or attaching to a process remains execution-adapter policy.

### 3.5 Delegated children: stable refs, independent traces

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

One plural `delegation` block covers one synchronous child, one detached child, several parallel children, or a mixed batch. `mode` is a producer-reported relationship to parent flow, not a scheduling instruction.

`childSessionId` is a stable semantic address only. Parent history does **not** recursively embed child `LogicalMessage[]`; child reasoning/tools/nested delegations remain in the independent child session/thread. Child status never redefines parent SessionStatus or Turn outcome.

A failed child is likewise only a child-run fact. It does not imply “retry”, “abort parent” or “parent failed”. Those consequences belong to the Agent runtime. This allows one parent Turn to finish successfully after an explicit fallback while preserving the failed child as honest evidence.

The Engine never starts, resumes, interrupts, disposes, retries, routes models for, assigns permissions to, or navigates to a child.

### 3.6 Child-session tree/navigation is Host state

A real workbench still needs to open those child conversations. That does not require a core session-tree abstraction.

The Demo keeps:

```text
childSessionId in parent AgentRunRef       Engine semantic address
                    │
                    ▼
DemoWorkspaceRuntime.hasSession(id)
DemoWorkspaceRuntime.parentSessionId(id)   Host relationship/navigation state
                    │
                    ▼
activate child session / return parent     Host action
```

The child transcripts are normal independent `ConversationSessionKernel` / `ConversationSessionRuntime` instances. They are directly addressable but can be omitted from the normal Recent list. The parent never copies their messages.

This preserves two independent responsibilities:

- **Engine:** child reference remains stable and renderer-neutral;
- **Host:** workspace topology, visibility, breadcrumbs, activation and return navigation.

## 4. Deliberate non-abstraction: no core PresentationSurface

There is intentionally **no core PresentationSurface** for conversation, changes, artifacts, preview, composer status, left/right panels, tabs or drawers.

A host may derive layout from canonical/session semantics. Encoding placement in core would couple reusable state to one product shell.

**Semantic renderability is Engine responsibility; application layout and style are not.**

## 5. SessionKernel is runtime truth, not workflow execution

`ConversationSessionKernel` owns normalized history access, appended/overridden messages, current live status, explicit active assistant coordinate, explicit current WorkPlan, queue, typed blockers, foreground/unread attention, last settled Turn outcome/failure, accounting and Turn/Step counters.

`SessionStatus`, `activePlan`, and `lastTurnReason` are independent facts:

- `idle` means no execution is running, not “completed”;
- `waiting` exists iff one `pendingInteraction` exists;
- `activePlan` is current producer-owned work state and may exist in working, waiting or idle sessions;
- outcomes are written only by explicit `finishExecution(...)`;
- restored working sessions use explicit `activeAssistantIndex`, never inferred history order;
- restored current work uses explicit `activePlan`, never inferred from the newest Plan block.

Approval/question blockers are typed session facts. `requestInteraction(...)` moves working→waiting; `resolveInteraction(...)` validates and clears the blocker and returns to outcome-neutral idle. It does **not** interpret “approved” as “send email”, “answer” as “resume this exact provider request”, or either resolution as a workflow transition. The external execution adapter owns that consequence.

Likewise, an interrupted terminal or Turn and a failed tool/child are explicit evidence. Engine state does not encode retry count, retryability, backoff, fallback source, whether the parent should abort, or whether a later user instruction resumes/branches/starts a new Turn.

## 6. Optional Vue adapter: current-task strip is presentation, not semantics

`src/engine/vue/**` demonstrates physical Vue/Virtua integration. It is not part of the framework-neutral model.

`ActivePlanStrip` accepts `WorkPlan | null` and demonstrates a common UI:

```text
☷  current in-progress/blocked/pending item      2/4  ⌃
                hover / click
                     ↓
           full Plan item list + statuses
```

The current-item selection is a **pure projection of explicit `activePlan`**, not a history lookup. Its location above the composer, use of `<details>`, hover disclosure, typography and sizing are optional Vue adapter choices. A host may render the same WorkPlan in a status bar, side panel or nowhere.

Built-in reference renderers still include Markdown, reasoning, code, diff, tool, media, Plan, Terminal and Delegation. The active strip is session chrome rather than a new canonical ContentBlock.

## 7. Office/knowledge-work Demo mapping

Current enterprise Agent products commonly combine work-context retrieval, research, plans/progress, artifact generation, meeting/email follow-up and approval before actions. `demo1` demonstrates those **rendering consequences** without importing product/runtime policy.

### Executive briefing

```text
mail + calendar + documents + web ResourceRefs
→ source-bearing tool call/result
→ WorkPlan + historical Plan snapshot
→ foreground synthesis + background specialists
→ decision-oriented Markdown
→ DOCX / PPTX / XLSX artifacts
```

### Meeting follow-up

```text
meeting transcript + mail thread + brief ResourceRefs
→ context tool result
→ WorkPlan + historical Plan snapshot
→ staged productivity call
→ blocked Plan item + PendingApproval
```

Approve/Deny clears the generic blocker. A real adapter decides whether to send mail or create a calendar event.

Connector schemas/auth, recipient resolution, document APIs, scheduled workflows and app-specific confirmation policy remain outside core.

### Agent lifecycle / resilience mapping

The lifecycle scenarios deliberately reuse existing Engine facts rather than adding “workflow state” types.

**Clarification** uses `PendingQuestion` + `InteractionResolution`. Answering clears the blocker; the runtime decides how to incorporate the answer and when to start/continue execution.

**Partial delegated failure** uses ordinary `AgentRunStatus:'failed'`, completed sibling runs, normal fallback tool evidence and a completed parent session/WorkPlan. The Demo chooses a cached source after a CRM failure. The Engine does not know that this is a “fallback”, does not evaluate source freshness and does not decide whether parent success is acceptable.

**Interrupt + steer** keeps the first terminal as `interrupted` with exit code `130`, then records the user’s changed direction as a different Turn with its own Plan/tools/result. Old evidence is not rewritten and current state does not infer a continuation policy from the previous Turn.

The critical distinctions are therefore:

- **failure evidence ≠ retry/fallback policy**;
- **child failure ≠ parent failure**;
- **pending question resolution ≠ provider continuation policy**;
- **interrupted Turn ≠ future Turn policy**.

No `RetryPolicy`, `FallbackPolicy`, `ResumePolicy` or scenario-specific state belongs in the framework-neutral Engine.

## 8. History, projection and bounded work

`ConversationHistorySource` is a synchronous globally addressable hot-read contract. Async DB/API/connector access sits outside it:

```text
remote API / connector
  ↓ async fetch/prefetch
host/provider cache
  ↓ synchronous local range
ConversationHistorySource
  ↓
SessionKernel / ConversationSessionRuntime
```

`ConversationSessionRuntime` keeps a bounded hot segment (~2,048 messages in the reference implementation) and keyed RenderUnits. Neighbor shifts project only incoming slices; far jumps rebase one hot window.

High-frequency paths remain explicit: reasoning, Markdown and terminal deltas patch changed stable units. Delegation status changes reproject one parent block. `activePlan` is independent session state and does not require scanning/reprojecting total history.

## 9. Semantic viewport vs physical rendering

Application position is semantic: committed reader, exact messages-after, committed RenderUnit anchor/offset, follow-tail intent and visual-bottom observation.

The physical adapter owns DOM measurement, ResizeObserver, virtualizer convergence and responsive reflow. Plan disclosure, active-plan popover, terminal growth, delegation changes, office artifacts and media may change physical height without redefining reader/Turn/Step identity.

## 10. Demo is executable proof, not architecture source of truth

The coding-Agent scenario demonstrates:

```text
explicit current WorkPlan + Plan snapshot
→ resource-aware tools
→ foreground/background child refs
→ parent continues streaming terminal
→ child statuses settle
→ click child ref and inspect independent child transcript
→ return to parent
→ final diff/code/artifacts
→ current WorkPlan + historical Plan both complete
```

The office scenarios add executive briefing and meeting follow-up/approval. Lifecycle scenarios add typed clarification followed by continued execution, partial child failure with an explicit host/runtime fallback, and a user-interrupted Turn followed by a newly steered Turn. The million-message scenario remains a pure projection/viewport stress proof.

Diagnostics are Demo-owned observability. Their shortcuts switch/jump to existing evidence; they do not define Engine replay/navigation/scenario APIs.

## 11. Public API policy

`src/engine/index.ts` exports framework-neutral semantics and core composition objects, including `WorkPlan`. It intentionally excludes Vue/Demo implementation, `parentSessionId`, session-tree navigation, recovery policies, office-provider concepts and runtime tuning telemetry.

`src/engine/vue/index.ts` exports optional physical composition including `ActivePlanStrip`. This does not make composer placement part of the neutral API.

The repository is a Vite Demo/Pages application with package publishing disabled. The Engine is source-level reusable/extraction-ready; package distribution remains separate.

## 12. Explicit Engine non-goals

Do not add these merely because Agent products use them:

- project/repository/worktree lifecycle;
- Agent/model routing or child scheduling/concurrency;
- child provider selection, permissions, resume/interrupt/disposal;
- retry budgets, backoff, fallback-source selection or automatic recovery policy;
- parent/child workspace tree, breadcrumbs, activation or return navigation;
- enterprise connector/auth protocols;
- mail/calendar/document external action execution;
- scheduled/recurring workflow orchestration;
- permission/allowlist evaluation;
- MCP/skills registry;
- process/background-job manager;
- editor/resource opening behavior;
- composer/status-strip placement or interaction design;
- Changes/Artifacts/Preview panel layout;
- sidebar/tab/drawer/workspace navigation;
- durable cloud sync or provider retry policy.