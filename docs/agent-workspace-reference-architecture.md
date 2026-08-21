# Agent Conversation Framework — Reference Architecture

This repository is an executable reference architecture for Agent conversation clients that combine very long histories, resumable asynchronous execution, heterogeneous content, streaming output and unstable physical layout.

The normal hot-path target is:

> **O(changed + hot + visible), independent of total history and cold-session count.**

The reusable result is a set of ownership, identity and viewport contracts. Vue, Virtua and the synthetic demo are replaceable adapters.

## 1. Scope and non-goals

The framework targets:

- 1,000,000+ addressable logical messages without eager UI state;
- many independent running/blocked/failed/completed-resumable sessions;
- heterogeneous Blocks inside stable Message/Turn/Step coordinates;
- streaming replies whose physical height changes continuously;
- exact reader / Latest / follow semantics independent of scrollbar approximation;
- desktop/tablet/mobile reflow without losing semantic position;
- replaceable backend protocols, renderer UI and virtualizer.

It is **not** an Agent loop, persistence engine, network protocol, plugin runtime or generic component framework. Production products provide their own backend/runtime adapters.

## 2. Dependency direction

```text
Provider / DB / remote Agent runtime
            │
            ▼
1. Backend / Runtime Ports
            │ canonical history + normalized live mutations
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

`src/engine/index.ts` is the framework-neutral public surface. The enforced rules are:

1. `model/` imports no session, presentation, Vue, DOM, demo or virtualizer code.
2. `conversation/` depends on canonical model and generic primitives only.
3. `presentation/` consumes canonical content and emits renderer-ready nodes.
4. `viewport/` consumes semantic IDs/indexes plus geometry, never renderer semantics.
5. `runtime/` composes kernel + bounded presentation + viewport state.
6. `vue/` and `components/` are frontend adapters.
7. `demo/` may depend inward on the engine; engine layers may never depend on demo code.
8. `core/` contains only framework-neutral primitives such as Fenwick/indexing/notifier helpers.

`tests/architecture-boundaries.test.ts` makes these rules executable.

## 3. Four state lifetimes

| State class | Examples | Lifetime rule |
|---|---|---|
| **Durable domain** | canonical history, execution, queue/blockers, Turn outcome, usage/context | Correct with zero mounted viewports. |
| **Session interaction memory** | reader/anchor/follow checkpoint, draft, disclosure preferences | Small, session-scoped, survives Recent switching/hot eviction. |
| **Rebuildable presentation** | ~2K hot segment, projection LRU, keyed RenderUnits | Disposable; reconstruct from canonical state. |
| **Ephemeral physical** | DOM, virtualizer measurements, ResizeObserver samples, renderer caches | Mounted/render lifetime only. |

Critical invariant:

> **running SessionKernel ≠ hot ConversationSessionRuntime ≠ mounted viewport**

Background sessions continue while heavyweight presentation state remains bounded.

## 4. Canonical identity: Message → Turn → Step → Block

A canonical record has stable producer/domain identity:

```ts
interface LogicalMessage {
  id: string
  index: number
  turnId: string
  stepId?: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  blocks?: readonly ContentBlock[]
  revision?: number
  live?: boolean
}
```

Meaning:

- **Message** — one addressable canonical history record.
- **Turn** — one user-level interaction lifecycle.
- **Step** — one model-request coordinate within a Turn when available.
- **Block** — one stable semantic contribution inside a Message.

Simple/older adapters are not forced to invent unavailable Step IDs. New demo turns currently use one Step per Turn.

### Stable business correlation

Related durable records must share a producer-owned stable business ID. Example:

```text
tool-call.callId == tool-result.callId
artifact.provenance.callId == producing callId
```

Never correlate by DOM adjacency, message ordinal or “latest unfinished item”. The same law applies to future jobs, reviews, deliverables or subagent lifecycles.

## 5. Content extension contract

`ContentBlockMap` is the semantic renderer vocabulary. A normal single-message extension requires only:

1. add a semantic ContentBlock type;
2. register `ContentBlock → bounded RenderUnit[]` projection;
3. register a renderer;
4. define containment/responsive behavior;
5. add unit/browser fixtures.

It must not require changes to SessionKernel, history segmentation or semantic viewport policy.

### When a ContentBlock is not enough

Introduce a keyed cross-event assembler only when one real business row spans multiple durable records, such as a long-running job/review, terminal lifecycle, deliverable or subagent task.

That assembler must obey:

- stable business key on every contributing record;
- deterministic replay/fold;
- append/prepend/replay equivalence;
- no full-window scan on the hot append path;
- pending updates remain pending if their start is not loaded;
- renderer-ready output only;
- semantic event order independent from UI publication cadence.

Do not add a generic node/plugin engine before such a scenario exists.

## 6. SessionKernel semantics and publication

`ConversationSessionKernel` owns facts that remain valid without UI:

- execution state;
- last settled Turn outcome;
- approval/question blockers;
- queued follow-ups;
- unread attention;
- canonical appended Turns/messages;
- provider-neutral token/cache/context accounting;
- Turn/Step counts and failure metadata.

A failed Turn is history, not a permanently failed session. `idle + lastTurn=error` remains resumable.

Business mutation order and UI publication cadence are intentionally separate:

```text
SessionKernel mutation
 ├─ subscribeEvents(event)   # every semantic event, producer order
 └─ subscribe(listener)      # coalesced summary/workspace refresh
```

Hot incremental presentation consumes the ordered event feed. Workspace/product summaries consume the coalesced channel. Streaming ingress may be animation-frame coalesced without changing semantic order.

## 7. Workspace and hot-runtime lifetime

The workspace owns lightweight kernels/execution controllers independently from presentation runtimes:

```text
many kernels / executions
          │
          └── hot runtime LRU (<= 3 in the demo)
                     │
                     └── one mounted active viewport
```

Evicting a runtime discards rebuildable projection/measurement state only. It must not stop execution, discard blockers/queue/outcomes or reset usage.

## 8. Projection runtime

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

## 9. Semantic viewport

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

A programmatic jump commits only after the target remains visible through stable measurement frames. Responsive/composer reflow is a transaction:

```text
capture semantic anchor or tail intent
→ physical reflow
→ measurements settle
→ restore the same semantic intent
```

ResizeObserver reports physical change; it never invents application intent.

## 10. Physical list and renderer correctness

Virtualizer-owned wrappers are geometry-pure: no block margin/padding that the virtualizer fails to measure. Tail correctness after composer/product reflow reads the actual scroll container (`scrollHeight`, `scrollTop`, `clientHeight`) rather than assuming cached virtualizer viewport geometry is current.

Renderer requirements:

- tables/code own internal overflow;
- images reserve intrinsic aspect ratio before load;
- sanitized HTML cannot execute active content;
- disclosures keep local bounded presentation state;
- no renderer expands page inline size unexpectedly;
- adjacent mounted rows do not overlap after async measurement/reflow.

## 11. CSS and host isolation

The final application CSS has one explicit boundary:

- `src/styles/engine.css` styles only from `[data-conversation-engine].conversation-shell` inward and owns conversation layout, composer, virtualizer integration and renderer containment;
- `src/styles/demo.css` owns the demo shell/diagnostics and is the only stylesheet permitted to target `html`, `body` or `#app`;
- `src/architecture.css` serves the standalone architecture view.

Legacy mixed CSS files were removed. Browser CI injects hostile host-global element styles **after** engine styles and verifies that engine geometry/overflow invariants still hold. Shadow DOM remains a possible future hard-isolation option, not a dependency of the default path.

## 12. DeepSeek Harness influence

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

## 13. Verification contract

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

See [`verification.md`](verification.md) for the complete executable matrix and [`agent-workspace-scenario-contracts.md`](agent-workspace-scenario-contracts.md) for scenario semantics.
