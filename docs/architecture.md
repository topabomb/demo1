# Agent Conversation Engine Architecture

This repository is an executable reference implementation for building long-running Agent conversation clients. It is intentionally split into a reusable **Engine** and an executable **Demo**.

The design target is simple:

> Normal UI work scales with **changed + hot + visible** state, not with total conversation history.

The project is not an Agent loop, persistence server, provider SDK or plugin framework. Those systems connect through narrow ports and normalize their output into the Engine model.

## 1. Ownership

```text
src/
├── engine/                     reusable implementation
│   ├── core/                   small indexing / notification primitives
│   ├── model/                  canonical Message / Block model
│   ├── conversation/           session lifecycle and backend/execution ports
│   ├── presentation/           ContentBlock -> keyed RenderUnit projection
│   ├── viewport/               semantic reader / Latest / anchor contracts
│   ├── runtime/                bounded hot-session composition
│   ├── vue/                    Vue + Virtua reference adapter
│   │   ├── renderers/          renderer registry and renderer components
│   │   ├── engine.css          shell / viewport / composer geometry
│   │   └── renderers.css       renderer visuals and containment
│   └── workers/                replaceable worker implementation
└── demo/                       executable proof only
    ├── components/             workspace shell and diagnostics
    ├── styles/                 host/demo styling
    ├── synthetic.ts            lazy large-history source
    ├── scenarios.ts            canonical heterogeneous fixtures
    ├── stream-controller.ts    synthetic execution/provider behavior
    └── workspace-runtime.ts    demo composition + hot-runtime LRU
```

The dependency law is one-way: **Demo may consume Engine; Engine never consumes Demo**. `tests/architecture-boundaries.test.ts` makes this executable rather than relying on convention.

`src/engine/index.ts` is the framework-neutral public surface. Vue-specific integration remains under `engine/vue` so non-Vue consumers do not inherit browser/UI dependencies.

## 2. Canonical conversation model

Provider/runtime-specific events are normalized before presentation:

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

Identity has four levels:

- **Message** — one addressable history record.
- **Turn** — one user-level interaction lifecycle.
- **Step** — one model-request coordinate inside a Turn when the producer exposes it.
- **Block** — one stable semantic contribution inside a Message.

`ContentBlock` is the renderer vocabulary: Markdown, reasoning, code, tool call/result, diff, attachments, audio, HTML and other registered semantic types.

A normal new content type should require only:

1. extend `ContentBlockMap`;
2. register its projection into bounded `RenderUnit[]`;
3. register a renderer;
4. define containment/responsive behavior;
5. add unit and browser fixtures.

It should not require changes to history segmentation, SessionKernel or viewport policy.

### Stable business correlation

Related records use producer-owned IDs, never UI adjacency:

```text
tool-call.callId == tool-result.callId
artifact.provenance.toolCallId == producing callId
```

The same rule should be used for future jobs, subagents, reviews or deliverables that span multiple records.

A generic cross-event node engine is deliberately absent. Add an assembler only when a real feature needs several durable records to become one business row, and require stable keys plus deterministic replay/prepend/append behavior.

## 3. SessionKernel: durable session truth

`ConversationSessionKernel` owns state that must remain correct with **zero mounted UI**:

- canonical history/appended messages;
- live execution state and last Turn outcome;
- queue and approval/question blockers;
- unread/foreground attention;
- provider-normalized usage/context numbers;
- failure metadata and Turn/Step counts.

It does **not** invent provider policy. The Kernel does not decide that every model has a reasoning block, generate answer text, estimate provider token/cache usage, or manufacture synthetic completion messages.

Provider/runtime adapters create and mutate canonical content, then publish it through narrow Kernel mutation APIs. The Demo's synthetic behavior therefore lives in `demo/stream-controller.ts`.

Two notification paths are intentionally different:

```text
semantic mutation
├─ subscribeEvents(event)    every ordered mutation
└─ subscribe(listener)       coalesced summary/workspace refresh
```

Business order is never sacrificed merely because reactive/UI publication can be batched.

## 4. Execution port

The reusable execution controller describes product semantics only:

```ts
interface ConversationExecutionController {
  readonly running: boolean
  submit(prompt: string): 'started' | 'queued' | 'blocked'
  abort(): void
  resolveInteraction(approved: boolean): void
  dispose?(): void
}
```

Playback rate, pause/resume controls, fake token accounting, ingress counters and synthetic text generation are Demo/provider concerns, not Engine API.

This keeps the template usable with SSE/WebSocket runtimes, local model loops, remote agents or persisted history without pretending every backend behaves like the benchmark Demo.

## 5. Projection and bounded work

Canonical history is not turned into one giant reactive tree. `ConversationSessionRuntime` keeps a bounded hot logical segment (about 2,048 messages in the reference configuration) and derives keyed `RenderUnit` records through `ProjectionEngine`.

A `RenderUnit` carries stable Message/Turn/Step/Block location plus renderer-ready payload. Renderers do not scan Session/history to rediscover business identity.

Important properties:

- only the hot segment is projected;
- projection cache is bounded;
- stable IDs preserve unrelated rows during one-Block updates;
- neighbor shifts project only the incoming slice;
- far jumps replace one bounded window;
- streaming reasoning/Markdown can patch the mutable Block path incrementally;
- presentation state is rebuildable from canonical state.

## 6. Four state lifetimes

| Lifetime | Examples | Rule |
|---|---|---|
| Durable domain | history, execution, blockers, outcome, usage/context | correct without a viewport |
| Session interaction | reader, anchor, follow state, draft, disclosure memory | small and session-scoped |
| Rebuildable presentation | hot segment, projection cache, keyed RenderUnits | bounded and disposable |
| Ephemeral physical | DOM, Virtua measurements, ResizeObserver samples | mounted-adapter lifetime only |

A running SessionKernel is therefore not the same thing as a hot `ConversationSessionRuntime`, and neither is the same thing as a mounted viewport. The Demo proves this with more running kernels than its three-runtime hot LRU.

## 7. Semantic viewport vs physical list

Application position is semantic, not a scrollbar guess:

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

The Vue/Virtua adapter owns physical navigation through one cohesive `ViewportNavigationController`: mounted-row sampling, user scroll intent, anchor restoration, tail pinning, latest-wins navigation and measurement convergence.

A requested jump does not become the committed reader until the physical adapter has stably reached it. Responsive layout and composer resizing follow the same transaction:

```text
capture semantic anchor/tail intent
→ reflow / measure
→ restore the same semantic intent
→ commit
```

This separation is the main reason virtualizer replacement is possible without rewriting conversation semantics.

## 8. Vue adapter and CSS boundary

`ConversationViewport.vue` is a reference integration, not the owner of product state. It renders the Engine runtime and exposes small product slots for header/composer chrome instead of hard-coding provider/model/search controls.

CSS has three clear responsibilities:

- `engine/vue/engine.css` — host-scoped shell, viewport, composer and geometry rules;
- `engine/vue/renderers.css` — host-scoped renderer visuals/containment;
- `demo/styles/*` — host page, workspace, diagnostics and architecture-page styling.

Engine styles never target `html`, `body` or `#app`. Browser tests inject hostile host-global styles after Engine styles and require geometry/overflow invariants to survive.

Renderer/virtualizer correctness rules include:

- virtualizer-owned row wrappers keep zero block margin/padding;
- tables/code own internal horizontal overflow;
- images reserve bounded geometry;
- sanitized HTML cannot execute active content;
- disclosure/media/composer reflow must not overlap adjacent rows;
- product spacing belongs inside measured row content, not on virtualizer wrappers.

## 9. Demo as executable contract

The Demo exists to prove Engine behavior, not to define Engine APIs. It covers the common Agent conversation forms that motivated the abstraction:

- very large heterogeneous history;
- streaming reasoning and Markdown with changing height;
- user image/file/audio attachments, single and multiple;
- tool call/result correlation;
- image-generation calls plus generated artifacts and provenance;
- TTS and ASR execution/artifacts;
- code, diff, HTML and Markdown compatibility cases;
- queue, approval/question blockers, failure/resume and background execution;
- far jump, prepend, Latest/follow semantics and session eviction/restore;
- desktop/mobile reflow and hostile host CSS.

Fixtures enter through normal canonical history and projection paths. There is no renderer-only shortcut for Demo scenarios.

## 10. Template guidance

When adapting this repository to a product:

**Keep** the canonical model, SessionKernel lifecycle, projection/runtime boundaries, semantic viewport rules and the tests that protect those contracts.

**Replace** `demo/history-adapter.ts`, `demo/stream-controller.ts`, seeded fixtures/workspace data and any Demo chrome with real backend/provider/product implementations.

**Extend** through ContentBlock/projector/renderer registration and narrow provider ports. Do not add a generic plugin/service graph simply because the project may grow.

The project deliberately favors a small number of strong boundaries over many abstraction layers. A new file/module should represent a stable semantic responsibility or replaceable implementation seam, not merely reduce line count.
