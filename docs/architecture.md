# Agent Conversation Engine Architecture

`demo1` is an executable reference for long-running Agent conversation clients. The repository deliberately separates three responsibilities:

1. **External adapters** — provider protocol, Agent orchestration, durable persistence, async network/database IO and recovery policy.
2. **Engine (`src/engine/**`)** — provider-neutral conversation/session semantics, bounded presentation, semantic viewport policy and a Vue reference surface.
3. **Demo host (`src/demo/**`)** — multi-session workspace composition, synthetic histories/playback, scenarios, diagnostics and the public architecture page.

The core performance target is:

> Normal UI work scales with **changed + hot + visible** state, not total history.

The Engine is intentionally smaller than the Demo. It is not an Agent runtime, provider SDK, persistence server, workspace manager or general plugin framework.

## 1. Dependency and ownership law

```text
Provider / persistence / network
        │ normalize + cache
        ▼
┌─────────────────────────────────────┐
│              Engine                 │
│ canonical model · SessionKernel     │
│ projection · semantic viewport      │
│ Vue reference adapter · renderers   │
└─────────────────────────────────────┘
        ▲
        │ consume
┌─────────────────────────────────────┐
│             Demo host               │
│ workspace/LRU · scenarios ·         │
│ synthetic playback · diagnostics    │
└─────────────────────────────────────┘
```

`src/engine/**` never imports `src/demo/**`. The Engine also contains no provider-specific orchestration. Architecture tests enforce the source dependency direction.

### What belongs outside Engine

External/provider adapters own:

- SSE/WebSocket/provider event decoding;
- model/tool loop decisions;
- retry/recovery/provider request lifecycle;
- durable conversation persistence;
- async database/network fetching and cache fill;
- provider-specific billing/cache interpretation before normalized accounting is written to Engine.

The Demo owns:

- the list of Recent sessions and relative ages;
- active-session routing;
- the three-hot-runtime LRU policy;
- fake 1M history generation;
- scripted Agent-loop behavior and playback rate;
- renderer compatibility fixtures;
- Session diagnostics and browser performance counters.

None of those become implicit Engine services merely because the Demo exercises them.

## 2. Canonical conversation model

Provider/runtime data is normalized before presentation:

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

Identity levels are explicit:

- **Message** — one globally addressable history record;
- **Turn** — one user-level interaction lifecycle;
- **Step** — optional producer-owned model/tool-loop coordinate;
- **Block** — stable semantic content inside a Message;
- **callId** — producer-owned correlation between tool call/result;
- **artifact provenance** — explicit link from generated media/files to a producing call where applicable.

DOM adjacency, “latest unfinished row” and renderer order are never business identity.

### Turn is not one assistant card

One Turn can contain several canonical records:

```text
user request             turn A / step 0
assistant model output   turn A / step 1
assistant tool call      turn A / step 1
tool result              turn A / step 1
assistant model output   turn A / step 2
assistant tool call      turn A / step 2
tool result              turn A / step 2
assistant synthesis      turn A / step 3+
```

The Engine preserves these coordinates. It does not decide when another model Step or tool invocation occurs.

## 3. SessionKernel: runtime session truth, not persistence

`ConversationSessionKernel` owns facts that must remain correct without a mounted viewport:

- canonical history access plus appended/overridden normalized messages;
- live execution status and explicit active assistant coordinate;
- queue payloads for the current runtime session;
- approval/question blockers;
- foreground/unread attention;
- last Turn outcome/failure;
- normalized token/context accounting;
- Turn/Step counters.

It does **not** imply durable persistence. A host that requires restart-safe queue/blocker/execution recovery must persist and restore those facts explicitly through its own storage/runtime adapter.

### No inferred execution target

A restored descriptor may provide:

```ts
activeAssistantIndex?: number | null
```

If a session is `working` and this coordinate is absent, the Kernel keeps `currentAssistantIndex === null`. It never guesses that the last history record must be the active assistant record. The producer/host owns recovery truth.

`continueExecutionAt(index)` has one narrow responsibility: move an already-running execution to another canonical assistant record without resetting Turn timing. It contains no Agent-loop policy.

## 4. Blocker contract

Approval and user questions are different semantic interactions:

```ts
type InteractionResolution =
  | { kind: 'approval'; approved: boolean }
  | { kind: 'question'; answer: string | null }
```

A question is therefore not reduced to a fake “approved” boolean. `answer: null` means explicit skip/cancel in the reference contract; an actual answer carries user data to the execution adapter.

`SessionKernel.resolveInteraction()` validates that the resolution kind matches the pending blocker and clears session blocker state. What the provider/Agent does with that resolution remains execution-adapter policy.

## 5. History source and async IO boundary

The hot Engine contract is intentionally synchronous:

```ts
interface ConversationHistorySource {
  readonly sessionId: string
  readonly count: number
  loadRange(start: number, count: number): readonly LogicalMessage[]
}
```

This is a **locally addressable history source**, not a promise that the Engine performs database/network paging.

A real remote integration should look like:

```text
remote DB / API
    ↓ async fetch/prefetch
host/provider cache
    ↓ synchronous addressable reads
ConversationHistorySource
    ↓
SessionKernel / ConversationSessionRuntime
```

Keeping async IO outside the render hot path avoids mixing network lifecycle with semantic reader/virtualizer state. Products may choose any cache, persistence or prefetch strategy as long as the Engine-facing source can satisfy the requested local range.

## 6. Projection and bounded presentation

`ConversationSessionRuntime` keeps a bounded hot segment (reference configuration: about 2,048 logical messages) and derives keyed `RenderUnit`s through `ProjectionEngine`.

Important properties:

- only the hot segment is projected;
- projection memoization is bounded;
- stable IDs preserve unrelated rows during Block updates;
- neighbor shifts project only the incoming slice;
- far jumps rebase one bounded window;
- reasoning and Markdown append paths patch incrementally;
- presentation state is rebuildable and disposable.

### Markdown correctness

Markdown chunking and HTML rendering share the same Marked GFM parser options. Splitting may happen only between top-level parser blocks. Lists, tables, blockquotes and fenced code remain semantically atomic even when they contain internal blank lines.

For append-only streaming, the projector re-processes the mutable Markdown tail plus the delta; settled prefix RenderUnits retain identity.

## 7. Semantic viewport vs physical list

Application position is semantic:

```text
committed reader index
+ exact messages-after
+ committed RenderUnit anchor / offset
+ follow-tail intent
+ atVisualBottom
```

`Latest` is exact:

```text
messagesAfter = logicalCount - 1 - committedReader
```

The Vue/Virtua layer owns physical measurements, scroll handles, ResizeObserver and convergence. Requested navigation becomes committed reader state only after the physical target has stably resolved.

This separation makes the virtualizer replaceable and prevents measurement probes, responsive reflow or composer growth from redefining conversation state.

## 8. Vue reference surface

`ConversationViewport.vue` is a reference conversation UI adapter, not a headless domain service. It combines:

- Engine runtime/projection state;
- semantic navigation policy;
- a generic `ConversationExecutionController` command port;
- Virtua physical list integration;
- composer and typed blocker UI;
- renderer resolution.

Its generic execution prop is named `execution`; streaming cadence is not part of this API.

Products can provide a per-viewport `RendererRegistry`. The public Vue entry intentionally exposes the registry class/factory rather than process-global mutation helpers. Internal defaults remain an implementation convenience for the built-in surface.

Engine CSS is host-scoped under `[data-conversation-engine].conversation-shell`:

- `engine.css` — shell, viewport, composer and blocker geometry;
- `renderers.css` — renderer visuals and containment.

Only Demo CSS may reset or style `html`, `body` or `#app`.

## 9. Public API policy

`src/engine/index.ts` is the framework-neutral public surface. It exports stable semantic contracts and core composition objects, but intentionally does **not** export runtime tuning/telemetry such as:

- `WINDOW_MESSAGES` / `SHIFT_MESSAGES`;
- `SessionUiSnapshot`;
- `ShiftPlan`;
- Demo playback counters.

Those remain directly importable implementation modules inside this repository where tests/reference adapters need them, but they are not promised as stable framework-level contracts.

Likewise, `src/engine/vue/index.ts` exposes the intended Vue composition surface rather than internal `ConversationNodeSeat` or global renderer mutation helpers.

## 10. Demo: executable proof, not architecture source of truth

The default `Agent loop investigation` demonstrates one Turn progressing through:

```text
reasoning + rich streaming Markdown
→ filesystem tool call/result
→ next model Step
→ search tool call/result
→ next model Step
→ shell verification call/result
→ final synthesis + diff + code + artifacts
```

Tool call/result are separate canonical history records linked by `callId`.

The separate `Million-message streaming stress` conversation has one job: prove that 1,000,000+ addressable messages, continuous rich Markdown, history browsing and physical virtualization stay bounded. It does not reuse the multi-step tool script, so stress evidence is easier to interpret.

Other Demo sessions cover:

- approval blockers;
- actual typed question answers;
- failure/resume;
- background execution while viewports are evicted;
- multimodal attachments and ASR/audio;
- code/diff/HTML/media renderers;
- responsive/mobile reflow.

### Session diagnostics

Diagnostics are explicitly **Demo-owned observability**. They mix two categories that must not be confused:

- **Demo controls/telemetry** — playback rate, pause/resume, ingress/publish counts, fixture injection;
- **Engine evidence** — logical/hot/DOM scale, projection work, reader state, Turn/Step/tool identity, queue/blockers and normalized accounting.

Diagnostics may inspect Engine state, but its synthetic controls do not become Engine APIs.

## 11. Distribution status

This repository currently has `"private": true` and a Vite application build used for the executable Demo/Pages site. The Engine is **source-level reusable and extraction-ready**, but the repository does not claim to publish an npm package today.

If package distribution becomes a requirement, add a dedicated library build/export map, package-level CSS entry points and consumer smoke tests as a separate release concern. Do not distort Engine responsibilities merely to simulate package maturity that does not yet exist.

## 12. Verification contract

A release must prove architecture and behavior together:

- Engine never imports Demo;
- neutral public API does not leak Demo/Vue/tuning details;
- working-session restore never guesses active history position;
- approval and question resolutions remain typed;
- async IO responsibility stays outside `ConversationHistorySource`;
- multi-step Demo data enters through canonical Message/Block paths;
- 1M history keeps hot state and mounted DOM bounded;
- Markdown append remains incremental after structural changes settle;
- exact Latest/reader/anchor behavior survives navigation and responsive reflow;
- Engine CSS survives hostile host-global styling;
- local production and deployed Pages run the same Chromium suite.

The exact `main` SHA is a release only when unit/architecture tests, strict build, local Chromium, Pages deployment and deployed-site Chromium are all Green.
