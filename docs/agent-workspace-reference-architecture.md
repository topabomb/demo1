# Agent Workspace Reference Architecture

Status: **candidate reference architecture under executable verification**.

This is the single design source of truth for `demo1`. The goal is not a Vue/Virtua trick and not a CodeNomad/DSH clone. The target is a reusable **Agent Conversation Presentation Framework** for workspaces that need:

- very long heterogeneous histories (1,000,000+ logical messages/events);
- many independent asynchronous/resumable sessions;
- reasoning, tools, Markdown, code, diff, images, HTML/artifacts and future render types;
- streaming output and dynamic-height content;
- stable reader/Latest/anchor semantics;
- replaceable framework, virtualizer, layout and product styling;
- durable execution/usage/blocker state that does not depend on a mounted viewport.

The core principle is:

> **Provider protocol, durable session state, semantic content, presentation projection, semantic viewport, physical virtualization and product rendering are different ownership boundaries.**

Normal hot-path work should scale with **changed + hot + visible** content, not total historical size.

---

## 1. Four lifecycles, seven contracts

```text
Provider / DSH / OpenCode / remote runtime
                 │
                 ▼
┌──────────────────────────────────────────────┐
│ 1. Backend Adapter                          │ protocol lifetime
│ paging · cursors · event normalization       │
└───────────────────┬──────────────────────────┘
                    │ canonical messages/events
                    ▼
┌──────────────────────────────────────────────┐
│ 2. SessionKernel / Execution Registry        │ session lifetime
│ run · queue · blockers · turns · usage       │
└───────────────────┬──────────────────────────┘
                    │ LogicalMessage + ContentBlock[]
                    ▼
┌──────────────────────────────────────────────┐
│ 3. Content Projector Registry                │ presentation semantics
│ ContentBlock → bounded stable RenderUnit[]   │
└───────────────────┬──────────────────────────┘
                    ▼
┌──────────────────────────────────────────────┐
│ 4. Hot Projection Runtime                    │ hot semantic lifetime
│ bounded segment · order + keyed nodes        │
└───────────────────┬──────────────────────────┘
                    ▼
┌──────────────────────────────────────────────┐
│ 5. Semantic Viewport Policy                  │ interaction lifetime
│ reader · Latest · anchor · follow · restore  │
└───────────────────┬──────────────────────────┘
                    ▼
┌──────────────────────────────────────────────┐
│ 6. Physical List / Framework Adapter         │ mounted lifetime
│ measurement · ResizeObserver · DOM samples   │
└───────────────────┬──────────────────────────┘
                    ▼
┌──────────────────────────────────────────────┐
│ 7. Renderer Registry + Product UI / CSS      │ replaceable presentation
│ Vue/React/Solid components · layout · theme  │
└──────────────────────────────────────────────┘
```

The reusable architecture is 1–5 plus the small contracts between 5–7. Vue, Virtua and the dark reference UI are implementations, not architectural requirements.

### Ownership matrix

| Concern | Owner | Survives viewport eviction? | Framework reactive? |
|---|---|---:|---:|
| Provider protocol/cursors | Backend Adapter | yes | no |
| Canonical turns/messages | SessionKernel / backend history | yes | no |
| Current execution | SessionKernel + ExecutionController | yes | no |
| Queue / approval / question | SessionKernel | yes | no |
| Last Turn result/failure | SessionKernel | yes | no |
| Token/cache/context projection | SessionKernel | yes | no |
| `ContentBlock[]` semantics | canonical message model | yes | no |
| ~2K projected history | Hot Runtime | rebuildable | no deep reactivity |
| `order + keyed RenderUnit nodes` | Projection Store | rebuildable | key-level bridge only |
| reader/anchor/follow/draft | semantic snapshot | yes | atomic snapshot only |
| height/measurement cache | physical adapter | no | implementation detail |
| mounted DOM | physical adapter | no | visible only |
| component registry | frontend renderer layer | n/a | small registry |
| colors/sidebar width/breakpoints | product CSS | n/a | no semantic effect |

**Invariant:** N running Agent sessions do not imply N heavyweight runtimes or N mounted viewports.

---

## 2. Canonical content is heterogeneous and extensible

A real assistant message is not `message.kind = markdown`. One Turn may contain reasoning, text, several tool calls/results, Markdown, code, a diff and an image. Therefore the portable model is:

```ts
interface LogicalMessage {
  id: string
  index: number
  turnId: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  blocks?: readonly ContentBlock[]
  revision?: number
  live?: boolean
}

interface ContentBlockMap {
  text: ...
  markdown: ...
  reasoning: ...
  code: ...
  image: ...
  html: ...
  'tool-call': ...
  'tool-result': ...
  diff: ...
}
```

`ContentBlockMap` is intentionally declaration-mergeable. A product may add `citation`, `terminal-session`, `file-tree`, `chart`, `artifact`, `subagent`, etc. without changing SessionKernel, paging, viewport policy or virtualizer code.

Legacy backends that expose one `kind` per message are normalized into blocks at the adapter/presentation boundary; new adapters should emit canonical blocks directly.

### Stable block identity

Every block needs a stable ID within its message. The projector derives RenderUnit IDs from:

```text
Session + Message + ContentBlock + bounded chunk index
```

Identity must represent semantics, not current DOM position.

---

## 3. Two registries, not one component switch

“Extensible renderer” means two independent extension surfaces.

### 3.1 Content Projector Registry

```text
ContentBlock.type
      ↓
ContentProjectorRegistry
      ↓
bounded RenderUnit[]
```

The projector owns:

- semantic block → physical presentation decomposition;
- stable IDs/revisions;
- size estimates;
- bounded chunking for huge Markdown/code/diff;
- renderer ID selection;
- fallback for unknown semantic blocks.

It is framework-free.

### 3.2 Frontend Renderer Registry

```text
RenderUnit.kind
      ↓
RendererRegistry
      ↓
Vue / React / Solid component
```

The renderer owns actual DOM/visual output and local disclosure state. Replacing a Markdown component or adding a `citation` component must not modify the conversation store or scroll policy.

### Extension checklist

To add a new semantic output such as `citation`:

1. extend `ContentBlockMap`;
2. register a semantic projector producing bounded stable RenderUnits;
3. register a frontend renderer for its renderer ID;
4. define its containment/responsive contract;
5. add canonical fixture + unit + browser tests.

No SessionKernel/SegmentManager/Virtua changes should be necessary.

---

## 4. Renderer contracts and bounded presentation

A virtualizer cannot solve an individual 100K-pixel message. Presentation projection must bound physical units first.

| Semantic block | Projection rule | Renderer rule | Narrow-screen behavior |
|---|---|---|---|
| text | one bounded unit | plain semantic text | wrap |
| Markdown | fence-safe ~6K chunks | GFM + sanitization + LRU | prose reflow; table/pre scroll internally |
| reasoning | disclosure unit | collapsed by default | remeasure on toggle |
| code | ~80-line chunks | Shiki worker + bounded cache | horizontal internal scroll |
| diff | ~72-line chunks | collapsible diff | horizontal internal scroll |
| image | intrinsic dimensions | reserve aspect ratio before load | `max-width:100%` |
| HTML/artifact | bounded semantic unit | DOMPurify | contained/internal overflow |
| tool call/result | structured disclosure | input/output independent from list | contained JSON/pre |
| unknown | safe fallback | diagnostic representation | wrap/contain |

### Renderer geometry invariant

A renderer may change height asynchronously, but must remain contained in the available inline size and report its final height through normal layout/ResizeObserver. It must not mutate semantic reader state directly.

---

## 5. Markdown is a first-class streaming problem

Parsing an ever-growing assistant response from byte 0 on every token/frame creates cost proportional to the total current answer. The reference path instead uses:

```text
live Markdown source
      ↓
fence-safe block chunker (~6K target)
      ↓
settled prefix chunks + mutable tail
      ↓
content-derived chunk revision
      ↓
bounded Markdown HTML LRU
```

Important properties:

- a fenced code block is never cut between opener and closer;
- appending to the tail does not change IDs/revisions of already settled prefix chunks;
- keyed projection therefore only publishes changed tail nodes;
- DOMPurify runs before mounting HTML generated from Markdown;
- raw `<script>` does not survive;
- GFM table/task-list/fence/blockquote/long-document cases are executable fixtures.

For production workloads with very expensive Markdown parsing, the same contract can move parsing to a worker without changing SessionKernel or viewport semantics.

---

## 6. DSH-aligned session semantics

A resumable Agent session cannot be represented by one overloaded `status` string.

### Live execution

```text
idle | working | waiting | interrupted
```

### Last settled Turn result

```text
completed | aborted | blocked | error | max-tokens | interrupted
```

This is historical outcome, not permanent session state. `lastTurn=error(PROVIDER_TIMEOUT)` with `execution=idle` remains resumable.

### Human blockers

```text
approval | question
```

Blockers belong to SessionKernel and survive Recent switching and hot-runtime eviction.

### Attention

Unread and queued follow-ups belong to workspace/session routing, not the mounted conversation.

This matches the useful DSH separation principle: Turn lifecycle, step lifecycle, content/tool events and Turn-end reason are distinct concepts even when the actual wire protocol differs.

---

## 7. Durable usage/cache/context projections

Usage is session/Turn data, never a fold over the current 2K hot window.

```ts
interface TokenUsage {
  inputTokens: number        // uncached prompt input
  cacheReadTokens: number
  cacheWriteTokens: number
  outputTokens: number
  reasoningTokens: number
}
```

```text
billed input = input + cacheRead + cacheWrite
cache hit %  = cacheRead / billed input
```

SessionKernel also owns context occupancy, turns/steps, TTFT/run duration when available, last failure code and last Turn reason. A real adapter should prefer provider-reported usage; the lab estimates values only to prove ownership and update paths.

---

## 8. Long-history and keyed hot projection

Do not materialize one million messages in framework state.

The reference keeps roughly 2,048 logical messages hot and shifts neighboring history in slices of 512. Only incoming messages are projected; retained RenderUnit object identities are reused.

The DSH-inspired presentation store is:

```text
order: NodeId[]
nodes: Map<NodeId, RenderUnit>
```

A stream delta patches one keyed node. It does not invalidate sibling seats or publish list order when membership/order is unchanged.

Global navigation uses page/segment metadata and a page-level Fenwick height index. The frontend intentionally does not maintain a million-entry height tree.

---

## 9. Semantic viewport is application truth

```text
mounted DOM != visible DOM != committed semantic viewport
```

Virtualizers may mount measurement probes and temporary rows. The application owns:

- `reader`: last committed visible logical message;
- exact `messagesAfter = logicalCount - 1 - reader`;
- Latest visibility;
- semantic anchor `{ RenderUnitId, offsetPx }`;
- follow-tail intent;
- restoration policy.

Physical scroll coordinates are adapter inputs, not persisted application semantics.

### Follow-tail

Model output and user scroll are independent inputs. An upward user intent must immediately own the viewport; programmatic tail-follow cannot steal it back. Latest may re-enable follow only after the true logical/physical end commits.

### Composer resize

The composer is a separate layout row, not an overlay. Height changes resize the physical viewport. If pinned, re-pin the measured end. If reading history, restore the same semantic anchor.

---

## 10. Responsive layout is remeasurement, not a state transition

Changing desktop → tablet → phone can reflow every visible Markdown/tool row. It must not change session state or logical reader semantics.

```text
saved committed semantic anchor
       ↓
product width/breakpoint changes
       ↓
renderer reflow + physical remeasurement
       ↓
restore same semantic anchor
```

Reference product layouts:

```text
Desktop: sidebar | conversation | optional diagnostics
Tablet:  sidebar | conversation; diagnostics overlay
Phone:   conversation + session drawer + diagnostics overlay
```

The phone layout never removes access to Recent sessions; it moves the sidebar into a drawer.

### Responsive acceptance

- no page-level horizontal overflow;
- Markdown table/code scroll inside their renderer;
- code/diff/tool/HTML remain contained;
- images keep intrinsic aspect ratio and never exceed the row width;
- row non-overlap remains true after reflow;
- semantic navigation/Latest/session switching remains valid.

---

## 11. CSS is not the algorithm

The reference implementation has three presentation CSS layers.

### `virtua-layout.css` — non-negotiable physical integration

Only geometry requirements:

- conversation shell/scroll stage can shrink (`min-width/min-height:0`);
- physical list fills the viewport;
- virtualizer-owned measured wrapper has **zero vertical margin/padding**.

The lab previously measured **14.015625px row overlap** from `7px + 7px` padding on that wrapper. Product spacing therefore belongs inside the measured child (`NodeSeat`).

### `renderer-content.css` — renderer containment

Markdown tables/pre, code, diff, tool JSON, image and HTML containment. This file can be restyled but the containment contract must remain.

### `product-ux.css` + `responsive-ux.css` — replaceable product design

Sidebar width, content width, row gap, composer limits, colors, icons, desktop/tablet/mobile layout and drawer behavior. Semantic algorithms do not read these values.

---

## 12. Runtime fixture injection is part of the proof

Static generated history is insufficient proof. The lab can append at runtime:

- `+1 mixed turn`;
- `+5 mixed turns`;
- `Markdown compatibility gallery`.

These controls do **not** inject DOM cards. They append canonical messages through SessionKernel, then traverse the exact production path:

```text
SessionKernel
→ LogicalMessage + ContentBlock[]
→ Content Projector Registry
→ keyed hot projection
→ semantic viewport / Virtua
→ Renderer Registry
```

The deterministic five-Turn fixture covers reasoning, Markdown, tool call/result, code, diff, image and sanitized HTML.

---

## 13. Failure-derived invariants

The lab keeps failures as design evidence:

| Failure | Root cause | Permanent invariant |
|---|---|---|
| running sessions broke hot-runtime limit | execution owned heavyweight runtime | SessionKernel/execution outlives disposable viewport runtime |
| completed history could not continue | history and execution were conflated | every historical session remains resumable |
| failed session looked permanently dead | one status represented several dimensions | live execution and last Turn outcome are separate |
| token totals changed with viewport | stats derived from hot rows | usage/cache/context are durable projections |
| 14.015625px card overlap | vertical padding on measured Virtua wrapper | virtualizer-owned wrapper is geometry-pure |
| repeatable +1023 restore drift | reader treated as center of 2048 window | semantic reader is authoritative; cold restore window ends around reader |
| false composer anchor | Virtua measurement probe treated as visible row | anchors come only from committed semantic viewport |
| old row missing after slow Pages switch | DOM residency used as persistence proof | canonical addressability, not DOM presence, proves persistence |
| fenced Markdown split incorrectly | closing fence evaluated before chunk flush | Markdown chunker evaluates boundary using pre-line fence state |
| whole long Markdown reparsed during stream | one mutable giant Markdown unit | settled chunks keep stable revisions; only tail changes |
| phone sidebar disappeared | responsive CSS removed a product capability | narrow layout moves Recent to a drawer, not out of the product |

---

## 14. Reference implementation map

```text
src/conversation/
  session-kernel.ts            durable session/execution semantics
  session-runtime.ts           disposable hot projection runtime
  keyed-node-store.ts          stable order + keyed node subscriptions

src/presentation/
  content-model.ts             extensible ContentBlockMap
  projector-registry.ts        semantic block → RenderUnit registry
  markdown-chunks.ts           streaming-safe Markdown segmentation
  demo-fixtures.ts             canonical runtime proof fixtures

src/viewport/
  contracts.ts                 framework-neutral viewport policy

src/components/
  ConversationViewport.vue     Virtua/Vue physical adapter
  ConversationNodeSeat.vue     key-level Vue subscription bridge
  renderers/registry.ts        frontend renderer registry
  renderers/*                  reference renderers

src/virtua-layout.css          tiny physical geometry contract
src/renderer-content.css       renderer containment contract
src/product-ux.css             replaceable desktop product theme
src/responsive-ux.css          replaceable responsive product adapter
```

A production extraction can split these into packages such as:

```text
agent-conversation-core
agent-conversation-presentation
agent-conversation-viewport
agent-conversation-vue
agent-conversation-renderers
```

---

## 15. Template adoption checklist

A new Agent UI adopting this architecture should be able to answer **yes** to all of the following:

1. Can backend/provider shapes be replaced without touching UI renderers?
2. Can a session keep running with zero mounted viewports?
3. Can running sessions exceed the number of hot conversation runtimes?
4. Can a historical failed/completed session start a new Turn?
5. Can one message contain multiple heterogeneous semantic blocks?
6. Can a new semantic block/renderer be registered without editing SessionKernel or scroll code?
7. Can a 100K-character answer be projected into bounded stable units?
8. Does streaming update only changed keyed nodes?
9. Are usage/cache/context totals independent of the hot window?
10. Is semantic reader/Latest independent of scrollbar approximations?
11. Can composer and responsive layout changes preserve semantic position?
12. Can desktop/tablet/phone layouts change without page-level overflow or row overlap?
13. Can runtime-injected mixed turns traverse the same canonical path as real messages?
14. Are local production and deployed Pages tested with the same browser suite?

If any answer is no, the implementation is still an application-specific demo rather than the intended reusable framework.
