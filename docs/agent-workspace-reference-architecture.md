# Agent Conversation Framework — Reference Architecture

This repository is an executable reference architecture for Agent conversation clients that combine very long histories, resumable asynchronous execution, heterogeneous content, streaming output and unstable physical layout.

The normal hot-path target is:

> **O(changed + hot + visible), independent of total history and cold-session count.**

The reusable result is a set of ownership, identity, projection and viewport contracts. Vue, Virtua and the synthetic lab are replaceable adapters.

## 1. Scope and non-goals

The framework targets:

- 1,000,000+ addressable logical messages without eager UI state;
- many independent running/blocked/failed/completed-resumable sessions;
- heterogeneous Blocks inside stable Message/Turn/Step coordinates;
- streaming replies whose physical height changes continuously;
- exact reader / Latest / follow semantics independent of scrollbar approximation;
- desktop/tablet/mobile reflow without losing semantic position;
- replaceable backend protocols, execution adapters, renderer UI and virtualizer.

It is **not** an Agent loop, provider SDK, persistence engine, network protocol, plugin runtime or generic service framework. Production products provide their own backend/execution adapters.

## 2. Physical ownership is part of the architecture

Source ownership is intentionally binary:

```text
src/
├── engine/
│   ├── core/
│   ├── model/
│   ├── conversation/
│   ├── presentation/
│   ├── viewport/
│   ├── runtime/
│   ├── vue/
│   │   ├── renderers/
│   │   ├── viewport-navigation-controller.ts
│   │   ├── engine.css
│   │   └── renderers.css
│   └── workers/
└── demo/
    ├── components/
    ├── styles/
    ├── vue/
    ├── history-adapter.ts
    ├── scenarios.ts
    ├── synthetic.ts
    ├── stream-controller.ts
    ├── workspace-fixtures.ts
    └── workspace-runtime.ts
```

Rules:

1. `engine/**` is reusable implementation and may never import `demo/**`.
2. `demo/**` is an executable proof and may consume Engine APIs.
3. Legacy parallel roots such as top-level `src/model`, `src/runtime`, `src/components` or `src/styles` must not reappear.
4. `src/engine/index.ts` is the framework-neutral public surface; Vue adapter APIs live under `engine/vue` rather than in that barrel.
5. Synthetic history, fixture packs, playback rates, relative session age and demo telemetry are not Engine semantics.
6. Product/model chrome is supplied through the Vue adapter slots; the Engine does not ship fake provider/search/attachment controls.

`tests/architecture-boundaries.test.ts` enforces these rules.

## 3. Dependency direction

```text
Provider / DB / remote Agent runtime
            │
            ▼
1. Backend / Execution Ports
            │ canonical history + normalized live mutations/accounting
            ▼
2. Canonical Conversation Model
            │ LogicalMessage + ContentBlock[]
            ▼
3. Session Kernel
            │ ordered semantic events
            ▼
4. Projection Runtime
            │ bounded keyed RenderUnits
            ▼
5. Semantic Viewport Policy
            │ reader · Latest · anchor · follow
            ▼
6. Physical List Adapter
            │ DOM measurements / virtualizer
            ▼
7. Renderer / Product Adapter
```

Internal dependency rules are deliberately small:

- `core/` contains framework-neutral indexing/notifier primitives;
- `model/` owns canonical content and pure canonical mutations;
- `conversation/` owns session facts, lifecycle storage and normalized execution ports;
- `presentation/` consumes canonical content and emits renderer-ready nodes;
- `viewport/` consumes IDs/indexes plus geometry, never renderer semantics;
- `runtime/` composes kernel + bounded presentation + semantic reader memory;
- `vue/` owns the physical Vue/Virtua adapter and renderer registry.

## 4. Four state lifetimes

| State class | Examples | Lifetime rule |
|---|---|---|
| **Durable domain** | canonical history, execution, queue/blockers, Turn outcome, normalized usage/context | Correct with zero mounted viewports. |
| **Session interaction memory** | reader/anchor/follow checkpoint, draft, disclosure preferences | Small, session-scoped, survives Recent switching/hot eviction. |
| **Rebuildable presentation** | ~2K hot segment, projection LRU, keyed RenderUnits | Disposable; reconstruct from canonical state. |
| **Ephemeral physical** | DOM row count, virtualizer measurements, ResizeObserver samples, renderer caches | Mounted/render lifetime only. |

Critical invariant:

> **running SessionKernel ≠ hot ConversationSessionRuntime ≠ mounted viewport**

Background execution may continue while heavyweight presentation state is evicted. Physical telemetry such as mounted DOM rows never writes back into domain/runtime snapshots.

## 5. Canonical identity: Message → Turn → Step → Block

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

- **Message** — one addressable canonical history record.
- **Turn** — one user-level interaction lifecycle.
- **Step** — one model-request coordinate within a Turn when available.
- **Block** — one stable semantic contribution inside a Message.

Adapters are not forced to invent unavailable Step IDs. New producers should preserve the real Step coordinate when they have it.

### Stable business correlation

Related durable records share a producer-owned stable business ID:

```text
tool-call.callId == tool-result.callId
artifact.provenance.toolCallId == producing callId
```

Never correlate by DOM adjacency, message ordinal or “latest unfinished item”. The same law applies to future jobs, reviews, deliverables and subagent lifecycles.

## 6. Content extension contract

`ContentBlockMap` is the semantic renderer vocabulary. A normal single-message extension requires only:

1. add a semantic ContentBlock type;
2. register `ContentBlock → bounded RenderUnit[]` projection;
3. register a renderer;
4. define containment/responsive behavior;
5. add unit/browser fixtures.

It must not require changes to SessionKernel, history segmentation or semantic viewport policy.

Introduce a keyed cross-event assembler only when one real business row truly spans multiple durable records. Such an assembler must have a stable business key, deterministic replay/fold, append/prepend/replay equivalence, no full-window scan on the append path and renderer-ready output. Do not add a generic node/plugin engine before a real scenario requires one.

## 7. SessionKernel: store facts, never invent provider behavior

`ConversationSessionKernel` owns facts that remain valid without UI:

- execution state and last settled Turn outcome;
- approval/question blockers and queued follow-ups;
- unread attention;
- canonical appended/replaced messages;
- provider-normalized token/cache/context accounting;
- Turn/Step counts and failure metadata.

It deliberately does **not** decide that every request has a reasoning block, create an answer block, estimate tokens/cache billing, or inject strings such as “Completed” / “Stopped by user”. Those are provider/execution-adapter policy.

The narrow mutation/lifecycle surface is therefore semantic:

```text
appendCanonicalMessages(...)
replaceCanonicalMessage(index, message, optionalIncrementalPatch)
startExecution(currentAssistantIndex?)
finishExecution(reason, failure?)
setAccounting(providerNormalizedUsage, context)
```

Canonical block mutation helpers live in `model/message-mutations.ts`; they mutate structure/content but do not estimate billing semantics.

Business mutation order and UI publication cadence are separate:

```text
SessionKernel mutation
 ├─ subscribeEvents(event)   # every semantic event, producer order
 └─ subscribe(listener)      # coalesced summary/workspace refresh
```

`ConversationSessionRuntime` consumes the ordered feed and increments a generic `eventRevision` for UI snapshots. That revision means “semantic state changed”; it does not encode a demo streaming rate or provider transport counter.

A failed Turn is history, not a permanently failed session. `idle + lastTurn=error` remains resumable.

## 8. Execution boundary and Demo playback

The reusable execution port remains small:

```ts
interface ConversationExecutionController {
  readonly running: boolean
  submit(prompt: string): 'started' | 'queued' | 'blocked'
  abort(): void
  resolveInteraction(approved: boolean): void
  dispose?(): void
}
```

The synthetic lab owns the behavior needed to exercise that port: it creates the demo user/reasoning/answer blocks, estimates demo token/cache numbers, produces synthetic deltas, implements rate/pause/resume and exposes ingress/publish counters. All of that lives in `demo/stream-controller.ts`.

A production adapter can instead map real provider events and real provider usage into the same canonical/session APIs without pretending to be the synthetic benchmark.

## 9. Workspace and hot-runtime lifetime

The Demo workspace owns lightweight kernels/execution controllers independently from presentation runtimes:

```text
many kernels / executions
          │
          └── hot runtime LRU (<= 3 in the demo)
                     │
                     └── one mounted active viewport
```

Static seeded-session definitions and display metadata such as relative age live in `demo/workspace-fixtures.ts`, not Engine contracts. Evicting a hot runtime discards rebuildable projection/measurement state only; it must not stop execution, discard blockers/queue/outcomes or reset usage.

## 10. Projection runtime

Projection converts canonical semantics into bounded renderer-ready nodes:

```ts
interface RenderUnit {
  id: string
  messageId: string
  messageIndex: number
  turnId: string
  stepId?: string
  blockId: string
  kind: string
  revision: number
  estimatePx: number
  payload: Record<string, unknown>
}
```

Required economics:

- only the hot logical segment is projected;
- projection cache is bounded;
- cache hits preserve stable immutable RenderUnit collections;
- keyed patch does not republish order when membership/order is unchanged;
- neighbor shift projects only the incoming slice;
- far jump rebases one bounded window;
- streaming Markdown re-chunks only mutable tail + delta;
- renderer caches remain local and bounded.

Renderers never scan Session/history to reconstruct business identity.

## 11. Semantic viewport vs physical navigation

Application position is semantic:

```text
reader logical index
+ exact messages-after
+ committed RenderUnit anchor + offset
+ follow-tail intent
+ atVisualBottom
```

`Latest` is exact:

```text
messagesAfter = logicalCount - 1 - committedReader
```

Scrollbar remainder is physical evidence only; it does not define logical position.

The Vue/Virtua adapter has one cohesive `ViewportNavigationController`. It owns only physical/navigation mechanics:

- user-scroll intent window and direction;
- mounted-row sampling;
- committed anchor capture/restore;
- stable tail pinning against the real scroll container;
- latest-wins navigation revision;
- jump visibility/measurement convergence.

`ConversationViewport.vue` remains the generic renderer/composer adapter and delegates those mechanics to the controller. Mounted-row telemetry is emitted to the Demo rather than stored in `ConversationSessionRuntime`. Debug jump input is likewise Demo-local state.

Responsive/composer reflow is a transaction:

```text
capture semantic anchor or tail intent
→ physical reflow
→ measurements settle
→ restore the same semantic intent
```

ResizeObserver reports physical change; it never invents application intent.

## 12. Vue product seam and CSS correctness

The reusable viewport owns only real, functional conversation controls: status, stop, pending-interaction resolution, composer/send, Latest and the rendered content. Product chrome is injected through narrow Vue slots:

```text
header-context
header-actions
viewport-overlay
composer-tools
```

The public Demo uses those seams for the synthetic-playback label and architecture diagnostics. The Engine itself contains no fake model selector, fake search action or fake attachment button.

Virtualizer-owned wrappers are geometry-pure: no block margin/padding that the virtualizer fails to measure. Tail correctness after composer/product reflow reads the actual scroll container rather than assuming cached virtualizer geometry is current.

Style ownership follows responsibility:

- `src/engine/vue/engine.css` — Engine design tokens, shell, virtualizer and composer geometry;
- `src/engine/vue/renderers.css` — renderer/content visuals and containment;
- `src/demo/styles/demo.css` — product lab, session navigation, diagnostics and the only global page reset;
- `src/demo/styles/architecture.css` — standalone architecture page.

Both Engine stylesheets remain rooted at `[data-conversation-engine].conversation-shell`. Demo may override documented custom properties, including mobile header leading space, without Engine CSS knowing a sidebar exists.

Browser CI injects hostile host-global element styles **after** Engine styles and verifies geometry/overflow invariants still hold.

## 13. File-size and fragmentation policy

The goal is not fewer files. A file should exist when it owns a stable algorithm, semantic contract or renderer extension seam.

Therefore these remain intentionally separate:

- Fenwick tree, page-height index, segment manager and notifier;
- canonical model vs session lifecycle;
- projector registry vs projection cache/store;
- renderer-per-kind modules.

The CSS split is intentionally only two Engine files because shell/viewport/composer geometry and renderer visuals are different ownership domains. It is not a per-component stylesheet explosion.

Do not create a generic “manager/service/plugin” layer merely to reduce line count.

## 14. DeepSeek Harness influence

The template adopts only scene-relevant invariants from DeepSeek Harness:

1. durable/model facts upstream of UI;
2. Turn and Step as distinct semantic coordinates;
3. stable business identity for related events;
4. deterministic event application order;
5. publication cadence independent from mutation order;
6. renderer-ready keyed nodes rather than Session scans;
7. replay/prepend/append laws for any future cross-event row;
8. Definition/Provider/Consumer seams only where multiple real implementations exist.

It deliberately does **not** adopt Cordis, a general plugin/service graph, host Agent loop or second browser persistence log.

## 15. Verification contract

Every pull request and `main` candidate must pass:

```text
frozen dependency install
unit + architecture tests
strict Vue/TypeScript typecheck
production build
full local Chromium suite
```

Only validated `main` deploys Pages. The deployed public URL then runs the same full Chromium suite.

Deterministic bounds include:

```text
logical history             >= 1,000,000
hot logical window          ~2,048 messages
projection cache            <= 4,096 entries
hot runtimes                <= 3
mounted DOM                 < 180 rows
semantic anchor drift       < 4 px
adjacent row overlap        <= 1 px tolerance
virtual wrapper block gap   exactly 0 px
```

See [`verification.md`](verification.md) for the executable matrix and [`agent-workspace-scenario-contracts.md`](agent-workspace-scenario-contracts.md) for scenario semantics.
