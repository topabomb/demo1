# Agent Workbench Rendering Engine Lab

A provider-neutral **front-end rendering Engine + executable Demo host** for long-running Agent workbenches: very long histories, multi-step tool loops, plans, resource references, delegated runs, streaming terminal output, rich Markdown/media and dynamic virtualization.

- Live demo: https://topabomb.github.io/demo1/
- Architecture view: https://topabomb.github.io/demo1/#architecture
- Architecture contract: [`docs/architecture.md`](docs/architecture.md)
- Verification/release contract: [`docs/verification.md`](docs/verification.md)

The performance target remains:

> normal UI work scales with **changed + hot + visible** state, not total history.

The scope is deliberately narrower than a full Agent product: **the framework-neutral Engine describes what happened and what can be rendered; it does not decide how a workbench lays out panels, opens files, schedules agents, evaluates permissions or runs tools.**

## Responsibility boundary

```text
Provider / Agent runtime / persistence / network
        │ normalize + cache
        ▼
src/engine/** framework-neutral core
  canonical semantics · SessionKernel · projection
  semantic viewport policy
        │
        ├── src/engine/vue/** optional reference adapter/renderers
        │
        ▲ consume
src/demo/**
  workspace/LRU · realistic scenarios · synthetic playback
  stress history · diagnostics · architecture page
```

External adapters own provider decoding, Agent/model/tool orchestration, retries, permission policy, durable persistence, async DB/network IO and recovery strategy. The Demo owns multi-session product composition and scripted evidence. `engine/**` never imports `demo/**`; architecture tests enforce the dependency direction.

The **framework-neutral Engine core is layout- and style-agnostic**. Vue components and CSS are reference physical adapters: they may measure and display semantic units, but their geometry or visual choices never enter canonical contracts or projection identity.

## Canonical rendering semantics

Provider/runtime data is normalized into stable `LogicalMessage` records:

```text
LogicalMessage
├─ message id / global index
├─ turnId
├─ stepId?          actual producer-owned execution coordinate
├─ role
└─ ContentBlock[]   semantic renderable content
```

One Turn can contain many assistant/tool records and model Steps. DOM adjacency is never identity.

### Stable identities

- **Message** — one globally addressable history record.
- **Turn** — one user-level interaction lifecycle.
- **Step** — actual producer-owned model/tool-loop coordinate.
- **Block** — stable semantic content inside a Message.
- **callId** — producer-owned tool call/result correlation.
- **ResourceRef** — host-neutral file/URL/artifact identity, optionally with a source range.
- **AgentRunRef** — reference to delegated work already reported by an external Agent runtime.

A `ResourceRef` can identify `src/engine/runtime/session-runtime.ts:120` without saying whether a host should open VS Code, a browser, a drawer or nothing. Navigation is a host concern.

### Plan is not Step

`plan` is explicit canonical content:

```ts
interface PlanItem {
  id: string
  text: string
  status: 'pending' | 'in-progress' | 'completed' | 'blocked' | 'cancelled'
}
```

Plan items describe intended/progress work. `stepId` describes execution that actually occurred. They remain independent because one plan item may require many model/tool Steps, and execution can diverge from a plan.

### Tool capability is not presentation intent

`ToolCategory` answers **what capability ran** (`filesystem`, `search`, `shell`, ...). `ToolPresentationIntent` answers **how the activity is best understood** (`generic`, `resources`, `changes`, `terminal`). It is still renderer-neutral metadata: it does not contain panel placement, dimensions, colors, host actions or permission rules.

Tool call/result remain separate canonical records correlated by `callId`; `resources` may point at files, URLs or artifacts relevant to the activity.

### Streaming terminal is a first-class semantic block

Long shell output is not forced through `tool-result.output: unknown`. A `terminal` block carries command/cwd/output/status/exit code, and append-only output uses a dedicated `append-terminal` semantic patch.

`ProjectionEngine.appendTerminalDelta(...)` replaces one stable terminal `RenderUnit` while unrelated tool/result siblings retain identity. This preserves the same incremental principle already used by live reasoning and Markdown.

### Delegated Agent runs are references, not orchestration

`agent-run` can display a producer-reported delegated run with `runId`, title, agent, status, optional child-session reference and summary. The Engine never spawns, schedules, cancels or selects that Agent. Those operations remain external runtime responsibilities.

## Session and history contracts

`ConversationSessionKernel` owns runtime session truth: normalized messages, live execution status, blockers, queue, explicit active assistant coordinate, settled Turn outcomes and normalized accounting. It is not a persistence server.

`SessionStatus` and `lastTurnReason` are separate. `idle` means no execution is currently running; it never implies completion. `waiting` exists iff one typed user interaction is pending. `requestInteraction(...)` and `resolveInteraction(...)` suspend/clear the blocker without inventing a Turn outcome; the execution adapter explicitly decides whether to resume, change strategy or call `finishExecution(...)`.

A rehydrated working session may supply `activeAssistantIndex`; the Engine never guesses the newest history row is active.

`ConversationHistorySource` is intentionally synchronous and locally addressable. Async DB/API fetch, prefetch and caching stay outside the render hot path and expose available ranges through this interface.

## Bounded presentation and semantic viewport

Canonical history is never a million-row component tree. `ConversationSessionRuntime` keeps a bounded hot segment, projects keyed `RenderUnit`s and lets the physical adapter mount only visible/overscan rows.

Normal navigation/reflow rules are semantic:

- exact reader position and messages-after count;
- stable committed anchor/offset;
- follow-tail intent separate from visual-bottom measurement;
- requested jumps commit only after the physical target resolves.

Responsive reflow, disclosure expansion, terminal growth and media measurement may change physical height without redefining Turn/Step/reader identity.

Markdown chunking and HTML rendering share the same Marked GFM parser contract. Lists, tables, blockquotes and fences remain atomic; append-only Markdown reparses only its mutable tail.

## Public API and optional Vue adapter

`src/engine/index.ts` is the framework-neutral surface. It exports semantic contracts such as `ResourceRef`, `PlanItem`, `ToolPresentationIntent`, `AgentRunRef`, `ContentBlock`, `SessionKernel`, projection and viewport contracts while excluding Demo controls and runtime tuning telemetry.

`src/engine/vue/index.ts` is an optional reference UI adapter exposing `ConversationViewport`, `RenderUnitView`, per-viewport `RendererRegistry` and `createDefaultRendererRegistry`.

Reference renderers now include Plan, Terminal and delegated Agent run visuals in addition to Markdown, reasoning, code, diff, tool, media and attachments. Products may replace these renderers without changing canonical history.

This repository is a Vite Demo/Pages application with package publication disabled (`"private": true`). The Engine is source-level reusable/extraction-ready; this repo does not claim a published npm package.

## What the Demo proves

The default **coding-agent rendering task** is intentionally close to a real development workbench rather than a renderer gallery:

```text
visible plan
→ reasoning + rich streaming GFM
→ filesystem read with ResourceRef evidence
→ next model Step
→ code search with multiple ResourceRefs
→ next model Step + delegated reviewer AgentRunRef
→ shell verification call
→ live terminal stream: unit → build → Chromium
→ final synthesis + resource-aware diff + code + artifacts
→ plan completed
```

Every item uses the same canonical Message/Block/projection pipeline. There are no fake tabs, inactive preview buttons or placeholder “future features”. Tool timing and fake provider output remain Demo-only.

The separate **Million-message streaming stress** session keeps one responsibility: prove 1,000,000+ addressable records, bounded hot projection/cache/DOM, far navigation and incremental rich Markdown without contaminating the measurement with scripted workbench transitions.

Other Recent sessions cover typed approval/question blockers, failure/resume, background execution during viewport eviction, resource-aware code/diff, multimodal uploads, generated image artifacts, TTS/ASR and responsive content.

### Session diagnostics

Diagnostics remain Demo-owned observability. They combine Demo controls/telemetry with read-only Engine evidence such as logical/hot/DOM scale, projection full/incremental work, reader state, Turn/Step/tool identity, blockers, queue and normalized accounting. Diagnostics never become a second Engine API.

## Explicit non-goals

The rendering Engine does **not** own:

- Project/repository/worktree lifecycle;
- model/Agent selection or routing;
- subagent scheduling;
- permission rule evaluation / allowlists;
- MCP/skills registries;
- editor/resource opening actions;
- Changes/Artifacts/Preview panel layout;
- tabs, sidebars, drawers or workspace navigation;
- preview-server/background-job lifecycle;
- durable sync or provider retries.

There is intentionally **no core `PresentationSurface` abstraction** today. A host can derive any panel or layout from canonical semantics. A multi-surface projection contract should be introduced only if a real reusable rendering requirement proves that the same canonical content must independently project into multiple semantic streams.

## CSS ownership

CSS belongs to the optional Vue/reference layer, never to framework-neutral semantics:

- `src/engine/vue/engine.css` — reference viewport/composer/blocker geometry;
- `src/engine/vue/renderers.css` — existing renderer visuals/containment;
- `src/engine/vue/workbench-renderers.css` — Plan/Terminal/AgentRun reference visuals;
- `src/demo/styles/*` — host workspace, diagnostics and architecture page.

All Engine Vue styles are rooted at `[data-conversation-engine].conversation-shell`; only Demo styles may reset `html`, `body` or `#app`.

## Develop and verify

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:e2e
```

A release is accepted only when the exact `main` SHA passes unit/architecture tests, strict build, local full Chromium, Pages deployment and the same full Chromium suite against the deployed Pages URL.
