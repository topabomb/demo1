# Agent Conversation Engine Architecture

This repository is an executable reference implementation for long-running Agent conversation clients. It deliberately contains two products with different responsibilities:

- **Engine** — reusable conversation/session/presentation/viewport machinery;
- **Demo** — a realistic Agent workspace that consumes the Engine, plus synthetic stress and verification infrastructure.

The design target is:

> Normal UI work scales with **changed + hot + visible** state, not total conversation history.

The project is not an Agent loop, persistence server, provider SDK or general plugin framework. Those systems connect through narrow ports and normalize output into the Engine model.

## 1. Ownership and dependency direction

```text
src/
├── engine/                     reusable implementation
│   ├── core/                   small indexing / notification primitives
│   ├── model/                  canonical Message / ContentBlock model
│   ├── conversation/           session lifecycle and backend/execution ports
│   ├── presentation/           ContentBlock -> keyed RenderUnit projection
│   ├── viewport/               semantic reader / Latest / anchor contracts
│   ├── runtime/                bounded hot-session composition
│   ├── vue/                    Vue + Virtua reference adapter
│   │   ├── renderers/          renderer registry and components
│   │   ├── engine.css          shell / viewport / composer geometry
│   │   └── renderers.css       renderer visuals and containment
│   └── workers/                replaceable worker implementation
└── demo/                       executable scenario application
    ├── session-scenarios.ts    realistic canonical recent-tail scenarios
    ├── live-run-script.ts      mixed-content live Agent turn script
    ├── synthetic.ts            lazy deep-history stress source
    ├── history-adapter.ts      Demo history composition
    ├── stream-controller.ts    Demo execution timing/accounting
    ├── scenarios.ts            renderer/E2E verification suites
    ├── workspace-runtime.ts    Demo workspace + hot-runtime LRU composition
    ├── components/             workspace / diagnostics / architecture UI
    └── styles/                 Demo-owned host styling
```

The dependency law is one-way: **Demo may consume Engine; Engine never consumes Demo**. Architecture tests enforce this mechanically.

`src/engine/index.ts` is framework-neutral. Vue-specific integration remains under `engine/vue`, so non-Vue consumers do not inherit browser or Vue dependencies.

The Demo may know that it is demonstrating a release investigation, a multimodal handoff or a stress test. The Engine may not.

## 2. Canonical conversation model

Provider/runtime events are normalized before presentation:

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

Identity has four useful levels:

- **Message** — one addressable history record;
- **Turn** — one user-level interaction lifecycle;
- **Step** — a producer-owned model/request coordinate when available;
- **Block** — one stable semantic contribution inside a Message.

`ContentBlock` is the renderer vocabulary: Markdown, reasoning, code, tool call/result, diff, attachments, audio, HTML and registered extensions.

A normal content extension should require only:

1. extend `ContentBlockMap`;
2. register projection into bounded `RenderUnit[]`;
3. register its renderer;
4. define containment/responsive behavior;
5. add unit/browser evidence.

It should not require changes to history segmentation, SessionKernel or viewport policy.

### Stable business correlation

Related records use producer-owned IDs, never UI adjacency:

```text
tool-call.callId == tool-result.callId
artifact.provenance.toolCallId == producing callId
```

Do not add a generic cross-event graph until a real durable feature requires several records to assemble into one business object.

## 3. SessionKernel owns durable session truth

`ConversationSessionKernel` owns facts that must remain correct with **zero mounted UI**:

- canonical history and appended messages;
- current execution and last Turn outcome;
- queue and approval/question blockers;
- foreground/unread attention;
- normalized usage/context accounting;
- failure metadata and Turn/Step counts.

It does not invent provider output, default reasoning, completion copy, fake cache behavior or Demo scenarios.

Adapters mutate canonical messages through narrow Kernel APIs. Ordered semantic events and coalesced reactive publication remain separate concerns:

```text
semantic mutation
├─ subscribeEvents(event)    every ordered mutation
└─ subscribe(listener)       coalesced summary/workspace refresh
```

## 4. Execution port

The reusable execution controller describes user-facing execution semantics only:

```ts
interface ConversationExecutionController {
  readonly running: boolean
  submit(prompt: string): 'started' | 'queued' | 'blocked'
  abort(): void
  resolveInteraction(approved: boolean): void
  dispose?(): void
}
```

Playback rate, pause/resume test controls, synthetic token estimates, scripted Demo output and ingress counters stay outside the Engine.

This keeps the same Engine usable with SSE/WebSocket runtimes, local model loops, remote agents or persisted history.

## 5. Projection and bounded work

Canonical history never becomes one giant reactive component tree. `ConversationSessionRuntime` keeps a bounded hot segment (about 2,048 logical messages in the reference configuration) and derives keyed `RenderUnit` records through `ProjectionEngine`.

Important properties:

- only the hot segment is projected;
- projection memoization is bounded;
- stable IDs preserve unrelated rows during Block updates;
- neighbor shifts project only the incoming slice;
- far jumps rebase one bounded window;
- reasoning and Markdown append paths patch incrementally;
- settled Markdown prefix units remain stable when the live tail gains another chunk;
- presentation state is rebuildable from canonical history.

Markdown chunking is semantic rather than line-heuristic: the splitter uses the same `marked` GFM lexer contract as HTML rendering and may split only between top-level parser blocks. Lists, tables, blockquotes and fences remain atomic even with internal blank lines; an oversized atomic block is preferable to changing rendered meaning.

A million-message conversation is therefore a history-addressing problem, not a million-component rendering problem.

## 6. Four state lifetimes

| Lifetime | Examples | Rule |
|---|---|---|
| Durable domain | history, execution, blockers, outcome, usage/context | correct without a viewport |
| Session interaction | reader, anchor, follow, draft, disclosure preference | small and session-scoped |
| Rebuildable presentation | hot segment, projection cache, keyed RenderUnits | bounded and disposable |
| Ephemeral physical | DOM, Virtua measurements, ResizeObserver samples | mounted-adapter lifetime only |

A running SessionKernel is not the same lifetime as a hot `ConversationSessionRuntime`, and neither is the same as a mounted viewport. The Demo intentionally runs more kernels than its three-runtime presentation LRU.

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

The Vue/Virtua adapter owns physical navigation through `ViewportNavigationController`: mounted-row sampling, user intent, anchor restoration, tail pinning, latest-wins navigation and measurement convergence.

A requested jump becomes reader state only after the physical target is stably committed. Responsive reflow and composer resizing use the same transaction:

```text
capture semantic anchor / tail intent
→ physical reflow and measurement
→ restore the semantic coordinate
→ commit
```

This boundary makes the virtualizer replaceable without redefining conversation semantics.

## 8. Vue adapter, renderer registry and CSS boundary

`ConversationViewport.vue` is the reference UI adapter, not product state. Its built-in header owns the conversation title and execution status; product chrome enters through narrow slots. Internal session identifiers and observability metadata are not hard-coded into the Engine header and belong in the Demo's diagnostics surface or another host adapter.

Renderer policy has two explicit seams:

```text
ContentBlock -> RenderUnit     framework-neutral projector registry
RenderUnit -> Vue component   Vue renderer registry
```

Renderer registries may be instantiated per viewport; products are not forced to mutate one process-global renderer map.

CSS ownership is equally strict:

- `engine/vue/engine.css` — host-scoped shell, viewport and composer geometry;
- `engine/vue/renderers.css` — host-scoped renderer visuals/containment;
- `demo/styles/*` — workspace, diagnostics, scenario and architecture-page styling.

Engine styles never target `html`, `body` or `#app`. Browser tests inject hostile host-global CSS and require Engine geometry and containment to survive.

## 9. Demo: realistic scenario first, verification second

The public Demo should look and behave like a plausible Agent workspace. It must not make users operate a test harness to discover the Engine's capabilities.

Preset conversations therefore replace only a small recent tail with realistic canonical tasks while keeping lazy synthetic deep history underneath. Examples include:

- a 1,000,000-message release regression investigation that continues in the background;
- transport refactoring with reasoning, tool execution, diff and code;
- a production edit paused on approval;
- a protocol decision paused on a user question;
- multimodal image/PDF/audio handoff with ASR correlation;
- responsive artifact review;
- recoverable long-context/provider failure.

The default live turn grows through the normal canonical path:

```text
reasoning
→ rich streaming Markdown
→ tool call/result
→ diff
→ code
→ media artifacts
```

The Markdown stream itself includes tables, fenced code, task lists and blockquotes so variable-height rich layout is exercised while the turn is still changing.

No renderer receives a Demo-only node shape.

### Session diagnostics

`Session diagnostics` is intentionally kept in the public Demo as an **observability surface**, closed by default. It is Demo-owned and must not become Engine/session truth.

High-value diagnostics include:

- exact global history navigation and bounded window loading;
- live producer cadence and pause/resume;
- canonical renderer verification suites;
- logical vs hot vs RenderUnit vs mounted-DOM scale;
- running SessionKernels vs hot runtimes;
- queue, blockers and exact messages-after;
- projection cache/full/incremental work;
- token/cache/context accounting;
- FPS, frame p95, long tasks and heap.

Low-value implementation counters such as virtual epochs, renderer counts, individual renderer-cache sizes or Fenwick leaf counts stay out of the public panel.

## 10. Verification contract

The same full Chromium suite runs against the local production build and the deployed GitHub Pages site. It verifies behavior, not screenshots alone:

- bounded DOM/hot state at 1,000,000+ messages;
- mixed live rendering and rich Markdown structures;
- async measurement with no row overlap;
- far jump, prepend, exact Latest and anchor stability;
- queue/blockers/failure recovery/background execution;
- responsive/mobile reflow and composer growth;
- tool/artifact correlation and HTML sanitization;
- hostile host CSS isolation;
- realistic public workspace plus accessible Session diagnostics.

The exact `main` SHA is a release only when unit/architecture tests, strict build, local Chromium, Pages deployment and deployed-site Chromium are all Green.

## 11. Product adaptation

When adapting this repository:

**Keep** the canonical model, SessionKernel lifecycle, projection/runtime boundaries, semantic viewport rules and contract tests.

**Replace** Demo history/execution/scenario/workspace data with real backend/provider/product implementations.

**Extend** through ContentBlock/projector/renderer registration and narrow provider ports.

The project deliberately favors a small number of strong boundaries over abstraction-by-file-count. A module should exist because it owns a stable semantic responsibility or replaceable implementation seam, not merely to make another file shorter.