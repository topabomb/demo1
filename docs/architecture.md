# Agent Conversation Engine Architecture

This repository is an executable reference implementation for long-running Agent conversation clients. It deliberately contains two products with different responsibilities:

- **Engine** — reusable conversation/session/presentation/viewport machinery;
- **Demo** — a realistic Agent workspace that consumes the Engine, plus synthetic stress and verification infrastructure.

The design target is:

> Normal UI work scales with **changed + hot + visible** state, not total conversation history.

The Engine is not an Agent planner, persistence server, provider SDK or general plugin framework. Those systems connect through narrow ports and normalize output into the Engine model. The Demo may simulate an Agent loop; the Engine must not contain that script.

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
    ├── live-run-script.ts      declarative Agent-loop / stress scenario data
    ├── stream-controller.ts    Demo execution orchestration/timing/accounting
    ├── synthetic.ts            lazy deep-history stress source
    ├── history-adapter.ts      Demo history composition
    ├── scenarios.ts            renderer/E2E verification suites
    ├── workspace-runtime.ts    Demo workspace + hot-runtime LRU composition
    ├── components/             workspace / diagnostics / architecture UI
    └── styles/                 Demo-owned host styling
```

The dependency law is one-way: **Demo may consume Engine; Engine never consumes Demo**. Architecture tests enforce this mechanically.

`src/engine/index.ts` is framework-neutral. Vue-specific integration remains under `engine/vue`, so non-Vue consumers do not inherit browser or Vue dependencies.

The Demo may know that it is demonstrating an Agent loop, release investigation, multimodal handoff or million-message stress test. The Engine may not.

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
- **Step** — a producer-owned model/tool-loop coordinate when available;
- **Block** — one stable semantic contribution inside a Message.

A Turn is explicitly **not** assumed to equal one assistant Message or one DOM card. A real Agent runtime may append several canonical records while preserving one `turnId`:

```text
user request                 turn A / step 0
assistant stream             turn A / step 1
assistant tool call          turn A / step 1
tool result                  turn A / step 1
assistant stream             turn A / step 2
assistant tool call          turn A / step 2
tool result                  turn A / step 2
assistant final synthesis    turn A / step 3+
```

The exact provider event sequence is adapter policy. The Engine only preserves the normalized identities and records.

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

`ToolCategory` is a provider-neutral presentation/routing hint (`filesystem`, `search`, `shell`, `image-generation`, `tts`, `asr`, extensions). It does not define Agent orchestration policy.

Do not add a generic cross-event graph until a real durable feature requires several records to assemble into one business object.

## 3. SessionKernel owns durable session truth

`ConversationSessionKernel` owns facts that must remain correct with **zero mounted UI**:

- canonical history and appended messages;
- current execution and last Turn outcome;
- queue and approval/question blockers;
- foreground/unread attention;
- normalized usage/context accounting;
- failure metadata and Turn/Step counts.

It does not invent provider output, tool sequences, default reasoning, completion copy, fake cache behavior or Demo scenarios.

Turn/Step accounting follows append-ordered canonical transitions, not API-call boundaries. Appending an assistant record, a tool result and another assistant record under the same `turnId` therefore remains one Turn. A new `stepId` increments Step accounting when the producer supplies stable Step coordinates.

Adapters mutate canonical messages through narrow Kernel APIs. Ordered semantic events and coalesced reactive publication remain separate concerns:

```text
semantic mutation
├─ subscribeEvents(event)    every ordered mutation
└─ subscribe(listener)       coalesced summary/workspace refresh
```

## 4. Execution port and multi-Step continuation

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

An execution adapter may start on one assistant record and later append another assistant record in the same Turn after a tool result. `ConversationSessionKernel.continueExecutionAt(nextAssistantIndex)` moves the already-running execution target without resetting the Turn-level lifecycle/timing. It validates only the generic invariant that the new execution target is an assistant record.

It does **not** decide when to call a tool, which tool to call, how many Steps exist, or what the next model prompt should contain. Those decisions stay in the provider/Agent adapter. The Demo's scripted loop is therefore entirely under `demo/**`.

Playback rate, pause/resume test controls, synthetic token estimates, scripted Demo output and ingress counters also stay outside the Engine.

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
- a structural Message change may legitimately reproject that one changed Message;
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

A logical Message may also project to several physical RenderUnits. Semantic navigation targets logical history coordinates; it does not promise that every RenderUnit for a large Message is simultaneously mounted.

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

The generic Tool renderer reads canonical `category`, `callId`, status/progress and input/output. It can visually distinguish tool categories without knowing why the Agent chose that tool.

CSS ownership is equally strict:

- `engine/vue/engine.css` — host-scoped shell, viewport and composer geometry;
- `engine/vue/renderers.css` — host-scoped renderer visuals/containment;
- `demo/styles/*` — workspace, diagnostics and architecture-page styling.

Engine styles never target `html`, `body` or `#app`. Browser tests inject hostile host-global CSS and require Engine geometry and containment to survive.

## 9. Demo: realistic Agent loop first, stress proof separate

The public Demo should look and behave like a plausible Agent workspace. It must not make users operate a test harness to discover the Engine's capabilities.

The default `Agent loop investigation` intentionally demonstrates a single user-level Turn progressing through multiple canonical Steps:

```text
Step 1  reasoning + rich streaming Markdown
        → filesystem tool call/result
Step 2  new assistant record + rich streaming Markdown
        → search tool call/result
Step 3  new assistant record + rich streaming Markdown
        → shell verification call/result
Step 4  final synthesis
        → diff + code + verification artifacts
```

The Demo controller owns the timing, fake tool inputs/results and decision to advance to another Step. Each tool result is canonical history, and the next model Step is appended through the same Kernel path a real runtime adapter would use. No renderer receives a Demo-only node shape.

The Markdown stream deliberately includes GFM tables, task lists, nested lists, blockquotes, fenced code, inline code and repeated growing sections. This exercises parser-aligned chunking, dynamic height measurement and incremental projection while the Turn remains live.

Other preset conversations replace only a small recent tail with realistic canonical tasks while keeping lazy synthetic deep history underneath: transport refactoring, approval/question blockers, multimodal handoff, responsive artifacts and recoverable provider failure.

### Million-message stress is a separate responsibility

`Million-message streaming stress` exists to prove a different Engine property: 1,000,000+ addressable records with bounded hot projection, bounded DOM, exact history navigation and pure streaming-Markdown incremental work. It intentionally does not run the multi-Step tool script.

Separating these scenarios avoids two bad compromises:

- the product Demo does not default to a benchmark/control surface;
- projection performance measurements are not polluted by expected structural tool/message transitions.

### Session diagnostics

`Session diagnostics` is intentionally kept in the public Demo as an **observability surface**, closed by default. It is Demo-owned and must not become Engine/session truth.

High-value diagnostics include:

- exact global history navigation and bounded window loading;
- live producer cadence and pause/resume;
- active canonical Turn/Step and tool call/category correlation;
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

- one canonical Turn advancing across multiple model/tool Steps;
- filesystem/search/shell tool categories with stable call/result IDs;
- complex GFM continuing to stream between tool phases;
- separate 1,000,000-message stress with bounded DOM/hot state and incremental Markdown projection;
- async measurement with no row overlap;
- far jump, prepend, exact Latest and anchor stability;
- queue/blockers/failure recovery/background execution;
- responsive/mobile reflow and composer growth;
- multimodal tool/artifact correlation and HTML sanitization;
- hostile host CSS isolation;
- realistic public workspace plus accessible Session diagnostics.

The exact `main` SHA is a release only when unit/architecture tests, strict build, local Chromium, Pages deployment and deployed-site Chromium are all Green.

## 11. Product adaptation

When adapting this repository:

**Keep** the canonical model, SessionKernel lifecycle, projection/runtime boundaries, semantic viewport rules and contract tests.

**Replace** Demo history/execution/scenario/workspace data with real backend/provider/product implementations.

**Extend** through ContentBlock/projector/renderer registration and narrow provider ports.

The project deliberately favors a small number of strong boundaries over abstraction-by-file-count. A module should exist because it owns a stable semantic responsibility or replaceable implementation seam, not merely to make another file shorter.
