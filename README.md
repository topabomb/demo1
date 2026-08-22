# Agent Workbench Rendering Engine Lab

A provider-neutral **front-end rendering Engine + executable Demo host** for long-running Agent workbenches: very long histories, multi-step tool loops, plans, resource references, delegated child runs, streaming terminal output, office/research artifacts, rich Markdown/media and dynamic virtualization.

- Live demo: https://topabomb.github.io/demo1/
- Architecture view: https://topabomb.github.io/demo1/#architecture
- Architecture contract: [`docs/architecture.md`](docs/architecture.md)
- Verification/release contract: [`docs/verification.md`](docs/verification.md)

The performance target is:

> normal UI work scales with **changed + hot + visible** state, not total history.

The scope is deliberately narrower than a full Agent product: **the framework-neutral Engine describes what happened and what session state is currently renderable; it does not decide how a workbench lays out panels, opens resources or child sessions, connects enterprise apps, schedules agents, evaluates permissions or performs external actions.**

## Responsibility boundary

```text
Provider / Agent runtime / connectors / persistence / network
        │ normalize + cache + explicit live session state
        ▼
src/engine/** framework-neutral core
  canonical history · SessionKernel · projection
  semantic viewport policy
        │
        ├── src/engine/vue/** optional reference adapter/renderers
        │
        ▲ consume
src/demo/**
  workspace/session navigation · coding + office scenarios
  synthetic playback · stress history · diagnostics
```

External adapters own provider decoding, model/tool/child-Agent orchestration, child scheduling, app authentication/connectors, actual mail/calendar/document actions, retry policy, durable persistence and async IO. The Demo owns multi-session composition, scripted evidence, parent/child navigation, fake office sources/actions and inspection shortcuts. `engine/**` never imports `demo/**`; architecture tests enforce the dependency direction.

The **framework-neutral Engine core is layout- and style-agnostic**. Vue components and CSS are optional reference physical adapters: they may display semantic session state, but geometry, popovers and navigation choices never enter canonical contracts.

## Canonical rendering semantics

Provider/runtime data is normalized into stable `LogicalMessage` records:

```text
LogicalMessage
├─ message id / global index
├─ turnId
├─ stepId?          actual producer-owned execution coordinate
├─ role
└─ ContentBlock[]   replayable renderable history
```

One Turn can contain many assistant/tool records and model Steps. DOM adjacency is never identity.

Stable identities are deliberately small: Message, Turn, Step, Block, tool `callId`, `ResourceRef`, and delegated-child `AgentRunRef`. A ResourceRef identifies a file/URL/artifact and optional range; the host decides whether clicking it opens an editor, browser, enterprise app or nothing.

### Plan snapshot is not execution Step or current WorkPlan

A canonical `plan` block is a **history snapshot** of intended/progress work. `stepId` reports execution that actually occurred. One plan item may consume several model/tool Steps, and execution may diverge from the plan.

The session also has an explicit current `WorkPlan`:

```ts
type WorkPlan = ContentBlockMap['plan']

interface ConversationDescriptor {
  activePlan?: WorkPlan | null
}
```

This is intentionally **the same semantic shape**, not a second todo model. The producer/runtime explicitly updates `activePlan`; `ConversationSessionKernel` never scans the latest message, mounted rows or DOM to guess which historical Plan is current. A provider may publish a Plan snapshot and current WorkPlan from the same normalized event, which keeps conversation history and current status synchronized without conflating their lifecycles.

The optional Vue `ActivePlanStrip` demonstrates the common product pattern: one current task above the composer, progress count, and hover/click disclosure of the complete todo list. That placement/disclosure is physical adapter behavior, not framework-neutral Engine policy.

### Tool capability is not presentation intent

`ToolCategory` answers **what capability ran** (`filesystem`, `search`, `shell`, `productivity`, ...). `ToolPresentationIntent` answers **how the activity is best understood** (`generic`, `resources`, `changes`, `terminal`). It never carries panel placement, app routing, dimensions, colors, host actions or permission policy.

Tool call/result remain separate canonical records correlated by `callId`; `resources` can point to files, URLs or artifacts. That same neutral shape is sufficient for coding tools and office sources such as mail threads, meetings and documents without making Gmail/Outlook/Calendar concepts part of Engine.

### Streaming terminal is first-class

A `terminal` block carries command/cwd/output/status/exit code. Append-only output uses `append-terminal`; `ProjectionEngine.appendTerminalDelta(...)` updates one stable terminal RenderUnit while unrelated siblings retain identity.

### Child delegation is addressable, not recursively embedded

One parent `delegation` block contains one or more `AgentRunRef`s. `foreground` means the producer reports that parent flow waited for that child; `background` means parent flow may continue while it remains active. These are renderable observations, never scheduler commands.

Each child has stable `runId`, independent status, optional `childSessionId` and concise summary. `childSessionId` is a **semantic address only**. Parent history does **not** recursively embed child messages/tool traces, and the Engine does not own a session tree or an `openChildSession()` action.

The Demo now proves the real product behavior behind that reference: matching child IDs are independent conversation sessions with their own user prompt, reasoning, tool records and final answer. Clicking a delegation row is Demo/Host policy that activates that session; the child header can return to its parent. Hidden child sessions remain directly addressable without cluttering the normal Recent list.

This mirrors the durable boundary used by modern Agent clients: child work has independent context/transcript, while the parent keeps stable identity/status/summary and a navigable address.

## Session, history and bounded presentation

`ConversationSessionKernel` owns normalized runtime session truth: messages, live execution status, typed blockers, queue, explicit current WorkPlan, active assistant coordinate, explicit Turn outcome and accounting. It is not a persistence, scheduler or workspace-navigation server.

`SessionStatus` and `lastTurnReason` remain separate. `waiting` exists iff one typed pending interaction exists. `requestInteraction(...)` and `resolveInteraction(...)` expose the blocker lifecycle, while an external execution adapter decides what an approval actually causes.

`ConversationHistorySource` is a synchronous hot-read boundary. Async DB/API/connector fetch and cache fill remain outside it.

`ConversationSessionRuntime` keeps only a bounded hot history segment and keyed RenderUnits. Semantic reader/Latest/anchor state survives responsive reflow, expanding Plan/Delegation rows, media measurement and terminal growth. Session `activePlan` updates do not require a history scan or projection rebuild.

## What the Demo proves

### Coding Agent loop

The default scenario behaves like a real development Agent rather than a renderer gallery:

```text
current WorkPlan + historical Plan snapshot
→ resource-aware filesystem/search
→ foreground child review
→ two background child reviews remain running
→ parent continues shell + streaming Terminal
→ child refs settle independently
→ click child ref → independent child transcript → return parent
→ diff / code / artifacts / final synthesis
→ WorkPlan + historical Plan both completed
```

### Office / knowledge-work Agent

The Demo also covers two common enterprise Agent flows using **the same Engine primitives**, not office-specific core contracts.

**Monday executive briefing**

```text
mail + calendar + documents + web ResourceRefs
→ completed WorkPlan / Plan snapshot
→ source-bearing tool call/result
→ foreground synthesis + two specialist background runs
→ decision-oriented Markdown brief
→ DOCX + PPTX + XLSX artifact references
```

This demonstrates cross-source research, evidence traceability, parallel specialist work and office deliverables. The example sources are synthetic Demo data; real connectors/auth/fetch remain external-adapter responsibilities.

**Launch meeting follow-up**

```text
meeting transcript + email thread + launch brief
→ reconcile decisions / owners / dates
→ draft follow-up + Friday review
→ current WorkPlan item + Plan snapshot become blocked
→ staged productivity tool call
→ session PendingApproval
```

Approve/Deny demonstrates the **renderable approval boundary** only. The Engine clears typed interaction state; a real external adapter would perform or cancel the mail/calendar side effect. The Demo deliberately does not pretend to be Gmail, Outlook, Calendar or a workflow scheduler.

### Million-message stress and other evidence

The separate Million-message session proves 1,000,000+ addressable records, bounded hot projection/cache/DOM and far navigation independently from workbench orchestration. Other sessions cover typed questions/approvals, failure/resume, viewport eviction, multimodal inputs, generated artifacts, TTS/ASR and responsive content.

## Session diagnostics

Diagnostics are Demo-owned observability and include direct Demo scenario controls for Restart, Plan, Delegation, Terminal, Final, Executive briefing and Meeting approval.

The semantic buttons switch/jump to existing canonical evidence; Restart reconstructs the synthetic Demo host. None is an Engine replay/navigation/workflow API. Diagnostics also expose logical/hot/DOM scale, projection full/incremental work, reader state, Turn/Step/tool identity, blockers, queue and normalized accounting.

## Public API and optional Vue adapter

`src/engine/index.ts` is the framework-neutral surface. It exports neutral conversation/resource/plan/tool/delegation/session/projection/viewport contracts, including `WorkPlan`, while excluding Demo controls, session-tree navigation and runtime tuning telemetry.

`src/engine/vue/index.ts` is an optional reference UI adapter. `ActivePlanStrip` is a physical reference visualization; products may replace it and the Plan, Terminal, Delegation, tool, Markdown, media and artifact renderers without changing canonical or session semantics.

The repository is a Vite Demo/Pages application with `"private": true`; it does not claim a published npm package.

## Explicit non-goals

The rendering Engine does **not** own:

- project/repository/worktree lifecycle;
- model/Agent selection or child scheduling/concurrency;
- parent/child workspace trees, child-session activation or navigation history;
- child permissions, resume/interrupt or team messaging;
- Gmail/Outlook/Calendar/Drive/Teams/SharePoint connector contracts or authentication;
- mail sending, meeting creation, document editing or scheduled/recurring workflow execution;
- permission/allowlist evaluation;
- MCP/skills registries;
- editor/resource opening actions;
- Changes/Artifacts/Preview panel layout;
- tabs, sidebars, drawers or workspace navigation;
- process/background-job lifecycle;
- durable sync or provider retries.

There is intentionally **no core `PresentationSurface` abstraction**. Hosts derive product surfaces from canonical/session evidence.

## CSS ownership

CSS belongs to the optional Vue/reference layer, never framework-neutral semantics:

- `src/engine/vue/engine.css` — reference viewport/composer/blocker geometry;
- `src/engine/vue/renderers.css` — renderer visuals/containment;
- `src/engine/vue/workbench-renderers.css` — Plan/Terminal/Delegation visuals;
- scoped component CSS such as `ActivePlanStrip.vue` — optional reference physical presentation;
- `src/demo/styles/*` — host workspace, diagnostics and architecture page.

All Engine Vue styles remain host-contained; only Demo styles may reset the host page.

## Develop and verify

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:e2e
```

A release is accepted only when the exact `main` SHA passes unit/architecture tests, strict build, local full Chromium, Pages deployment and the same full Chromium suite against the deployed Pages URL.
