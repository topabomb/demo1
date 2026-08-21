# Agent Conversation Framework — Reference Architecture

Status: **candidate template; executable verification is defined in `verification.md`.**

`demo1` is a reference architecture for Agent conversation clients that must combine very long histories, asynchronous resumable execution, heterogeneous content, streaming output and unstable physical layout. The reusable result is not “Vue + Virtua”; it is a set of ownership and identity contracts whose normal hot-path cost is:

> **O(changed + hot + visible), independent of total history and cold-session count.**

DeepSeek Harness informed several identity/replay/publication rules. The adapted lessons and explicit non-goals are documented in [`deepseek-harness-design-lessons.md`](deepseek-harness-design-lessons.md). This document contains only the resulting `demo1` decisions.

---

## 1. Scope

The template targets clients that need:

- 1,000,000+ addressable logical messages/events without eager framework state;
- many independent sessions, including background-running, blocked, failed-last-turn and completed/resumable sessions;
- one Turn containing reasoning, Markdown, tool calls/results, code, diff, images, HTML/artifacts and future content types;
- streaming replies whose height changes continuously;
- exact reader / Latest / follow semantics independent of scrollbar approximation;
- desktop/tablet/mobile reflow without losing semantic position;
- replaceable backend protocols, UI framework, virtualizer and product theme.

It is **not** an Agent loop, persistence engine, network protocol, plugin runtime or generic component library. A production project supplies its own durable backend/runtime ports.

---

## 2. Four state lifetimes

| State class | Examples | Lifetime rule |
|---|---|---|
| **Durable domain** | canonical history, execution, queue/blockers, Turn outcome, usage/context | Must remain correct with zero mounted viewports. |
| **Session interaction memory** | reader/anchor/follow checkpoint, draft, touched disclosure preferences | Small, session-scoped, survives Recent switching/hot eviction. |
| **Rebuildable presentation** | ~2K hot window, ProjectionEngine LRU, keyed RenderUnits, page estimates | Disposable; reconstruct from canonical state. |
| **Ephemeral physical** | Virtua measurements, DOM, ResizeObserver samples, Markdown/Shiki caches | Mounted/render lifetime only. |

Critical invariant:

> **Running SessionKernel ≠ hot ConversationSessionRuntime ≠ mounted viewport.**

Background Agents continue while only active/recent sessions allocate heavyweight presentation state.

---

## 3. Dependency direction

```text
Provider / DB / remote Agent runtime
            │
            ▼
1. Backend / Runtime Ports
            │ canonical history + normalized live mutations
            ▼
2. Canonical Conversation Model
   LogicalMessage + ContentBlock[]
            │
            ├──────────────► 3. Session + Workspace Kernel
            │                execution · blockers · usage · routing
            ▼
4. Projection Runtime
   ContentProjectorRegistry
   + bounded ProjectionEngine
   + keyed RenderUnit store
            ▼
5. Semantic Viewport Policy
   reader · Latest · anchor · follow
            ▼
6. Physical List Adapter
   DOM measurements · Virtua · ResizeObserver
            ▼
7. Renderer + Product Adapter
```

Rules:

1. `model/` imports no session, presentation, Vue, DOM or virtualizer code.
2. Session/domain code depends on canonical model and ports, never renderer components.
3. Presentation consumes canonical content and emits rebuildable renderer-ready nodes.
4. Viewport policy consumes stable IDs, logical indexes and geometry, not Markdown/tool semantics or CSS values.
5. Vue/Virtua/renderers are outer adapters.
6. Synthetic generators and diagnostics are demo-only.

`src/core/types.ts` and `src/presentation/content-model.ts` are compatibility barrels, not recommended public API.

---

## 4. Canonical identity: Message → Turn → Step → Block

Provider-native payloads are normalized before presentation:

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

Identity meanings:

- **Message** — one addressable canonical history record.
- **Turn** — one user-level interaction lifecycle.
- **Step** — one model-request coordinate inside a Turn when the runtime exposes it. A Turn may contain several Steps; older/simple adapters may only know Turn.
- **Block** — one stable semantic contribution inside a Message (`reasoning`, `markdown`, `tool-call`, `tool-result`, etc.).

The demo execution currently models one Step per newly submitted Turn and gives its user/assistant messages the same `stepId`. Historical adapters are not forced to invent unavailable Step IDs.

Synthetic `kind/seed/intensity/content` fields are optional compatibility metadata only. Production adapters should provide canonical blocks and producer-owned identity.

### Stable business correlation

Related durable records must share a producer-owned stable ID. For example:

```text
tool-call.callId == tool-result.callId
```

Never correlate by DOM adjacency, message ordinal, or “latest unfinished tool”. This rule applies to any future job/review/deliverable lifecycle.

---

## 5. ContentBlock extension contract

`ContentBlockMap` is the semantic renderer vocabulary. Built-ins include:

```text
text · markdown · reasoning · code · image · html
· tool-call · tool-result · diff
```

A normal single-message content extension should require only:

1. add a semantic `ContentBlock` type;
2. register `ContentBlock → bounded RenderUnit[]` projection;
3. register a renderer;
4. define containment/responsive behavior;
5. add unit/browser fixtures.

It must not require changes to SessionKernel, paging or semantic viewport policy.

### When a ContentBlock is not enough

Do **not** introduce a generic cross-event node engine pre-emptively. Add a keyed ConversationNode assembler only when one real visual/business row spans multiple durable records, such as:

- long-running review/job progress;
- terminal/task lifecycle;
- deliverable creation → updates → completion;
- retry/continuation chain;
- subagent task state.

That future assembler must obey:

- stable business key on every contributing record;
- current-event matching without full-window scan;
- deterministic replay/fold;
- prepend stability for unrelated keyed nodes;
- pending updates remain pending if their start is not loaded;
- renderer-ready output only;
- semantic event order independent from UI publication cadence.

---

## 6. SessionKernel: durable/live business semantics

`ConversationSessionKernel` owns facts that remain correct without UI:

- execution: `idle | working | waiting | interrupted`;
- last settled Turn outcome: completed/aborted/blocked/error/max-tokens/interrupted;
- approval/question blocker;
- queued follow-ups;
- unread attention;
- canonical appended Turns;
- provider-neutral token/cache/context accounting;
- Turn/Step counts and failure metadata.

A failed Turn is history, not a permanent unusable session state: `execution=idle + lastTurn=error` is resumable.

### Two publication channels

Business mutation order and UI refresh cadence are intentionally separate:

```text
SessionKernel mutation
 ├─ subscribeEvents(event)   # every semantic mutation, producer order
 └─ subscribe(listener)      # coalesced summary/workspace refresh
```

Hot incremental presentation consumes `subscribeEvents`; it must never infer incremental work from a batched `lastEvent` snapshot. Workspace/product summary consumers use the coalesced subscription.

Streaming ingress is independently animation-frame coalesced by the execution controller, so semantic order is preserved without forcing one Vue render per raw token/chunk.

---

## 7. Workspace lifetime

The workspace owns lightweight kernels/execution controllers independently from hot presentation runtimes.

```text
many SessionKernels / executions
             │
             └── hot runtime LRU (<= 3 in this demo)
                       │
                       └── one mounted active viewport
```

Evicting a hot runtime destroys only rebuildable projection/measurement state. It does not stop an Agent, discard blockers/queue/outcomes or reset usage.

---

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

Renderers therefore never need to scan Session/history or decode business location from opaque payload/DOM order.

### Required economics

- only the hot logical segment is projected;
- ProjectionEngine cache is bounded;
- cache hits reuse stable immutable RenderUnit collections;
- keyed node patch does not publish order when membership/order is unchanged;
- neighboring history shift projects only the incoming slice;
- far jump rebases one bounded hot window;
- streaming Markdown re-chunks only mutable tail + delta;
- Markdown/highlight/fold caches are renderer-local and bounded.

If profiling later proves that locating one message inside the ~2K hot array is material, add a bounded message-span index. Do not add a global reactive history index pre-emptively.

---

## 9. Semantic viewport

The application coordinate is semantic, not scrollbar-derived:

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

Physical scrollbar remainder may help detect whether the adapter reached the bottom, but cannot define logical position.

### Explicit navigation

A programmatic jump is not committed simply because Virtua has temporarily mounted the target. The target must remain visible through stable measurement frames before its semantic anchor becomes the committed reflow coordinate.

### Responsive/composer reflow

A physical layout change is a transaction:

```text
capture semantic intent (anchor | tail pin)
        ↓
CSS/product/composer reflow
        ↓
virtualizer + DOM measurements settle
        ↓
restore the same semantic intent
```

ResizeObserver is a physical notification source; it does not invent semantic intent.

---

## 10. Physical list correctness

The measured virtualizer wrapper is geometry-pure:

```text
margin-block: 0
padding-block: 0
```

Product spacing lives inside the row/NodeSeat. This prevents the virtualizer from measuring one height while CSS paints another.

For tail correctness after composer or grid reflow, bottom detection reads the **actual scroll container** (`scrollHeight`, `scrollTop`, `clientHeight`) because a virtualizer's cached `viewportSize` can lag one layout. Tail pinning scrolls beyond the computed maximum and lets the browser clamp the real scroll container.

Renderer containment rules:

- tables/code own internal overflow;
- images reserve intrinsic aspect ratio before load;
- sanitized HTML cannot execute scripts;
- disclosures own local presentation state;
- no renderer may expand page inline size unexpectedly.

---

## 11. Renderer/Product boundary

Renderer selection is registry-driven. Renderer state may include bounded presentation preferences such as touched disclosure state, but not canonical Agent facts.

Product CSS is split conceptually:

- `virtua-layout.css` — measured-geometry integration;
- `renderer-content.css` — renderer containment;
- `product-ux.css` / `responsive-ux.css` — replaceable product presentation.

Conversation algorithms do not read product widths, colors, gaps or breakpoints.

---

## 12. DeepSeek Harness influence — final decisions

The template adopts these Harness-derived invariants:

1. durable/model facts are upstream of UI;
2. Turn and Step are distinct semantic coordinates;
3. every related update has stable business identity;
4. every semantic change is applied in order;
5. publication cadence is independent from mutation order;
6. renderer-ready nodes prevent Session/history scans inside components;
7. replay/prepend/live identity laws are mandatory for any future cross-event row;
8. a Definition/Provider/Consumer seam is useful only when a real capability has multiple implementations.

It deliberately does **not** adopt Cordis, a general plugin/service graph, profiles/bundles, a host Agent loop or a second browser persistence log. Those solve broader runtime composition problems outside this template's scope.

---

## 13. Verification contract

The framework claim is falsifiable. Pull requests/main must pass:

```text
frozen dependency install
unit / semantic tests
typecheck + production build
full Chromium product/stress suite
```

Only validated `main` may deploy Pages. The deployed public URL then runs the same full Chromium suite.

Important deterministic bounds include:

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

See [`verification.md`](verification.md) for the complete matrix.

---

## 14. Extraction guidance

Before publishing this repository as a standalone library:

1. move synthetic generation and legacy block fallback under demo/fixtures;
2. remove synthetic compatibility metadata from the extracted canonical public type;
3. move presentation-store ports out of domain/session compatibility barrels;
4. introduce real transport/persistence adapters only when a backend exists;
5. split the large Vue viewport into physical-list adapter and product/composer integration when a second UI shell/virtualizer appears;
6. introduce cross-event ConversationNode assembly only with the first real cross-event business scenario.

The main risk is not insufficient abstraction. It is allowing demo compatibility or physical-list behavior to become implicit business semantics.
