# Agent Conversation Framework — Reference Architecture

Status: **candidate template under executable local + GitHub Pages verification**.

`demo1` started as a million-message virtual-list experiment. That problem was too narrow. A real Agent workspace must also handle asynchronous resumable sessions, streaming output, heterogeneous content, tool/reasoning disclosure, variable-height composers, responsive reflow, exact navigation semantics and session-level usage/blocker state.

The reusable result is therefore not “Vue + Virtua”. It is a framework contract whose normal hot-path cost should scale with **changed + hot + visible** content, not total history or number of cold sessions.

---

## 1. Goals and non-goals

The template is intended for Agent UIs that need:

- 1,000,000+ addressable logical messages/events without eager framework state;
- many independent sessions, including background-running, blocked, failed-last-turn and completed/resumable sessions;
- one message containing reasoning, Markdown, tools, code, diff, images, HTML/artifacts and future content types;
- streaming replies whose height keeps changing;
- exact reader/Latest/follow semantics independent of scrollbar approximations;
- desktop/tablet/mobile layouts without breaking semantic position or renderer containment;
- replaceable backend protocols, frontend framework, virtualizer and product theme.

It is **not** a persistence engine, network protocol, generic component library or claim that a browser should materialize one million objects/DOM nodes. Production projects supply their own storage/history and execution ports.

---

## 2. Four state lifetimes

The most important store question is not “Pinia, Redux or a Map?”. It is **what truth does this state own, and when is it safe to discard?**

| State class | Examples | Lifetime / rule |
|---|---|---|
| **Durable domain state** | canonical history, execution, queued prompts, approval/question blocker, last Turn outcome, usage/context | Must remain correct with zero mounted viewports. The demo keeps this in lightweight objects; production may persist it remotely/locally. |
| **Session interaction memory** | semantic reader/anchor/follow checkpoint, input draft, user-touched disclosure preference | Small and session-scoped; survives Recent switching and hot-runtime eviction; not canonical history. |
| **Rebuildable presentation state** | hot logical segment, `ProjectionEngine` cache, keyed `RenderUnit` store, page-height estimates | Disposable. Rebuild from canonical state. Never becomes the source of truth. |
| **Ephemeral physical state** | measured row heights, Virtua state, mounted DOM, ResizeObserver samples, Markdown/Shiki output caches | Mounted/render lifetime only. Bounded and safe to discard. |

This gives one critical invariant:

> **Running SessionKernel ≠ hot Projection Runtime ≠ mounted viewport.**

Ten sessions may continue executing while only the active/recent three allocate heavyweight presentation state.

`SessionViewMemory` and `SemanticViewportSnapshot` are deliberately separate concepts. The current demo keeps them together operationally for compatibility, but the public contract distinguishes semantic viewport coordinates from product state such as drafts.

---

## 3. Seven contracts and dependency direction

```text
Provider / DB / remote runtime
          │
          ▼
1. Backend / Runtime Ports
          │ canonical history + normalized execution events
          ▼
2. Canonical Conversation Model
   LogicalMessage + ContentBlock[]
          │
          ├──────────────────────► 3. Session + Workspace Kernel
          │                        execution · blockers · usage · routing
          │
          ▼
4. Projection Runtime
   ContentProjectorRegistry
   + bounded ProjectionEngine LRU
   + keyed RenderUnit store
          │
          ▼
5. Semantic Viewport Policy
   reader · Latest · anchor · follow · restore
          │
          ▼
6. Physical List / Framework Adapter
   measurements · DOM samples · ResizeObserver
          │
          ▼
7. Renderer + Product Adapter
   components · containment · responsive layout · theme
```

Dependency rules:

1. `model/` imports no session, presentation, Vue, DOM or virtualizer code.
2. Session/domain code depends on the canonical model and ports, never on `RenderUnit` or renderer components.
3. Presentation depends on canonical content and emits rebuildable `RenderUnit`s.
4. Viewport policy consumes stable IDs, logical indexes and geometry, not Markdown/tool semantics or CSS values.
5. Vue/Virtua/renderers are outer adapters. Replacing them cannot require changes to canonical/session rules.
6. Demo generators/diagnostics are outside the framework contract.

`src/core/types.ts` and `src/presentation/content-model.ts` remain compatibility barrels only; new template code should import canonical types from `src/model/` and presentation types from `src/presentation/`.

---

## 4. Canonical conversation model

Backend payloads are not UI components. Normalize provider-specific events into a small semantic vocabulary first.

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

A single assistant message may legitimately be:

```text
reasoning
+ markdown
+ tool-call
+ tool-result
+ markdown
+ code
+ diff
+ image
```

`ContentBlockMap` is declaration-mergeable. A product can add `citation`, `terminal-session`, `file-tree`, `chart`, `artifact`, `subagent`, etc. without editing SessionKernel, paging or viewport policy.

Every block needs a stable semantic ID within its message. Render identity derives from:

```text
session/message identity + ContentBlock ID + bounded chunk index
```

Never from DOM position.

---

## 5. Session and workspace kernel

SessionKernel owns **domain facts**, not presentation:

- current execution: `idle | working | waiting | interrupted`;
- last settled Turn result: `completed | aborted | blocked | error | max-tokens | interrupted`;
- approval/question blocker;
- queued follow-ups;
- unread attention;
- canonical appended Turns;
- provider-neutral token/cache/context accounting;
- Turn/step counts and failure metadata.

A failed last Turn is history, not a permanent session state. `execution=idle + lastTurn=error` remains resumable.

The workspace owns many lightweight kernels and execution controllers. A separate hot-runtime LRU controls expensive projection state. Therefore background execution can continue after its viewport/projection is evicted.

### Usage ownership

Usage is never folded from the current hot window:

```ts
interface TokenUsage {
  inputTokens: number
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

Real adapters should prefer provider-reported numbers. The demo estimates values only to exercise ownership/update paths.

---

## 6. Projection Runtime: semantic content is not a component tree

Projection has three responsibilities that belong together because they share the same rebuildable hot lifetime:

```text
ContentProjectorRegistry
        ↓
ProjectionEngine (bounded message LRU)
        ↓
order: RenderUnitId[] + nodes: Map<id, RenderUnit>
```

### 6.1 Projector Registry

`ContentBlock → bounded RenderUnit[]` owns:

- semantic decomposition;
- stable IDs/revisions;
- renderer ID selection;
- size estimates;
- bounded chunking for very large content;
- safe unknown-block fallback.

It is framework-free.

### 6.2 ProjectionEngine

The engine adds bounded memoization per hot runtime. Unchanged message revisions return the same `RenderUnit` objects. This matters during history refresh/neighbor shifts and prevents unnecessary sibling invalidation.

Default reference bound:

```text
hot logical window        ≈ 2,048 messages
projection message LRU    ≤ 4,096 entries
neighbor shift            = 512 messages
```

The cache is **not persistence**. Evicting it must never lose canonical content.

### 6.3 Keyed presentation store

The DSH-inspired shape is intentionally simple:

```text
order: NodeId[]
nodes: Map<NodeId, RenderUnit>
```

A content delta patches affected node subscriptions. The order list changes only when presentation membership/order changes. Vue seats subscribe at key granularity rather than deep-reacting to the whole hot window.

---

## 7. Streaming efficiency: make the semantic patch explicit

Stable DOM keys alone are insufficient. If every model delta still calls `splitMarkdown(fullGrowingSource)`, projection CPU grows with total answer length even though only one row repaints.

The reference kernel therefore emits a semantic append patch:

```ts
{
  kind: 'content',
  messageIndex,
  contentPatch: {
    kind: 'append-markdown',
    blockId: 'answer',
    delta
  }
}
```

`ProjectionEngine.appendMarkdownDelta()` then re-chunks only:

```text
previous mutable Markdown tail + new delta
```

Settled prefix chunks retain object identity and content-derived revision.

Normal streaming path:

```text
provider chunks
    ↓ coalesced UI publication
SessionKernel canonical append
    ↓ append-markdown semantic patch
ProjectionEngine mutable-tail patch
    ↓ changed RenderUnits only
Keyed store patch
    ↓ visible seat only
Markdown render cache / DOM
```

Target complexity:

```text
stream append ≈ O(delta + mutable tail)
```

rather than `O(total current answer)` per UI publish.

The Diagnostics panel exposes `projection cache`, `projection hits`, `full projects` and `incremental patches`; E2E requires incremental patches to rise during streaming while full projects do not rise per publish.

---

## 8. Renderer protocol and bounded physical units

A list virtualizer cannot solve one 100K-pixel row. Projection must bound individual physical units first.

| Block | Projection | Renderer / containment |
|---|---|---|
| text | one normal unit | wrap; no page overflow |
| Markdown | fence-safe ~6K target chunks | GFM + DOMPurify + bounded HTML LRU; table/pre scroll internally |
| reasoning | one disclosure unit | collapsed by default; dynamic height remeasured |
| code | ~80-line units | Shiki worker/cache; horizontal internal scroll |
| diff | ~72-line units | collapsible; horizontal internal scroll |
| image | intrinsic dimensions | reserve aspect ratio before load; `max-width:100%` |
| HTML/artifact | bounded semantic unit | DOMPurify; contained output; scripts never execute |
| tool call/result | structured disclosure | input/output/status local; JSON/pre contained |
| unknown | safe fallback | diagnostic representation, never crash the list |

Adding a new semantic output requires only:

1. extend `ContentBlockMap`;
2. register its semantic projector;
3. register frontend renderer component;
4. define containment/responsive behavior;
5. add canonical unit + browser fixtures.

If SessionKernel or semantic viewport needs modification for a new renderer, the boundary is probably wrong.

### Renderer preference memory

Reasoning/tool/code disclosure must survive virtual unmount/remount, but untouched million-message history must allocate no UI state. The reference stores only **user-touched** disclosures and bounds that map to 2,048 LRU entries. Renderer state is presentation preference, not canonical history.

---

## 9. Long-history strategy

Do not create a million-item reactive `Message[]` and assume DOM virtualization fixes it.

The reference uses:

- deterministic/cold history port;
- ~2,048-message active semantic window;
- 512-message neighboring shifts;
- retained RenderUnit object reuse;
- page-level aggregate height index rather than a million-entry frontend height tree;
- far jump by rebasing around the target, not scrolling through history.

Expected hot operations:

| Operation | Target work |
|---|---:|
| stream delta | `O(delta + mutable tail + changed units)` |
| normal render | `O(visible + overscan)` |
| history shift | `O(incoming 512 slice)` |
| far jump | `O(hot window)`, independent of distance |
| hot session switch | approximately `O(1)` semantic reuse + mounted view |
| cold runtime rehydrate | `O(hot window)` |
| exact Latest count | `O(1)` |
| responsive reflow | `O(mounted measurements)`, no history scan |

The exact numeric budgets are tuning values, not universal constants. **Boundedness and dependency on hot/visible work are the contract.**

---

## 10. Semantic viewport is application truth

```text
mounted DOM != visible DOM != committed semantic viewport
```

Virtualizers may mount measurement probes, overscan rows and temporary nodes. Persisting raw `scrollTop` is also insufficient when content above the reader changes height.

The framework therefore owns:

```text
reader: logical message index
messagesAfter = logicalCount - 1 - reader
anchor: { RenderUnitId, offsetPx }
followTail: semantic intent
atVisualBottom: committed end state
```

`Latest` is derived from logical reader state, not tiny scrollbar remainder.

### Anchor selection

A candidate must be:

1. semantically committed near the current reader;
2. physically intersecting the viewport;
3. the eligible row whose leading edge is nearest the viewport leading edge.

Choosing the earliest-starting intersecting row caused a real ~575px drift when a giant Markdown row began far above the viewport.

### Layout reflow transaction

Layout-induced virtualizer scroll events must not overwrite the stable anchor before reconciliation. The adapter keeps a frozen committed coordinate across:

```text
product width/composer change
       ↓
renderer + virtualizer remeasurement
       ↓
restore same semantic anchor
```

Only explicit user/programmatic navigation commits a new anchor. Physical scroll generated by reflow is observation noise.

---

## 11. Composer and responsive layout

The composer is a grid/layout row, not an overlay over conversation history. Its intrinsic height changes viewport size.

- at logical tail → re-pin measured end;
- reading history → preserve frozen semantic anchor.

Responsive behavior follows the same policy:

```text
Desktop: Recent | Conversation | optional Diagnostics
Tablet:  Recent | Conversation + diagnostics overlay
Phone:   Conversation + Recent drawer + diagnostics overlay
```

Responsive acceptance:

- no document-level horizontal overflow;
- Markdown table/pre, code, diff, tool JSON contain their own overflow;
- image intrinsic ratio remains stable;
- Recent remains accessible on phone;
- adjacent measured rows do not overlap;
- semantic anchor survives width reflow;
- Latest/session switching remain logically exact.

CSS breakpoints, widths, row gaps and colors are **product policy**, not algorithm input.

---

## 12. CSS and physical integration boundary

Three categories are intentional:

### `virtua-layout.css`

Tiny non-negotiable physical integration:

- shell/stage may shrink (`min-width/min-height:0`);
- list fills stage;
- virtualizer-owned measured wrapper has zero vertical margin/padding.

The lab measured **14.015625px overlap** when 7px top + 7px bottom padding lived on that wrapper.

### `renderer-content.css`

Renderer containment: Markdown table/pre, code/diff/tool, image, HTML. Visual styling may change; containment cannot.

### `product-ux.css` + `responsive-ux.css`

Reference product theme/layout. Replaceable. No semantic algorithm reads their values.

---

## 13. Framework core, adapters and demo harness

A reusable template should be extractable without dragging the lab with it.

```text
Framework contracts / core
  src/model/conversation.ts
  src/conversation/contracts.ts
  src/conversation/session-kernel.ts
  src/conversation/session-semantics.ts
  src/presentation/render-unit.ts
  src/presentation/projector-registry.ts
  src/presentation/projection-engine.ts
  src/viewport/contracts.ts

Reference adapters
  src/conversation/*-adapter.ts
  src/components/ConversationViewport.vue   # Vue + Virtua
  src/components/renderers/*
  src/virtua-layout.css
  src/renderer-content.css

Demo / evidence harness
  synthetic source/controller
  deterministic mixed/Markdown fixtures
  diagnostics/performance panel
  reference product theme
  Playwright stress scenarios
```

A production package split could become:

```text
@agent-conversation/model
@agent-conversation/session
@agent-conversation/presentation
@agent-conversation/viewport
@agent-conversation/vue
@agent-conversation/renderers
```

The first four should have no Vue dependency.

---

## 14. Failure-derived invariants

Browser failures are architecture evidence, not noise to hide with looser tests.

| Failure | Root cause | Permanent correction |
|---|---|---|
| running sessions broke hot-runtime limit | execution owned heavyweight presentation runtime | execution kernel outlives disposable hot runtime |
| completed/failed history could not continue | history and execution state conflated | every historical session remains resumable |
| token totals changed with viewport | usage folded from hot rows | usage/context are session projections |
| 14.015625px row overlap | decoration on virtualizer measured wrapper | measured wrapper geometry-pure |
| repeatable +1023 restore drift | reader treated as center of 2048 window | semantic reader authoritative |
| false anchor | measurement probe treated as visible truth | semantic viewport filters physical rows |
| ~575px responsive drift | giant partially-visible row + layout scroll replaced anchor | nearest-edge committed anchor + frozen reflow transaction |
| DOM row disappeared after slow switch | residency mistaken for persistence | canonical addressability proves persistence |
| fenced Markdown split | closing fence evaluated in wrong order | boundary uses pre-line fence state |
| stable DOM but growing projection CPU | full Markdown re-scan per delta | append-markdown patch + mutable-tail ProjectionEngine |
| fold map could grow forever | renderer preference had no retention policy | touched-only bounded LRU |
| phone removed Recent | breakpoint removed capability | drawer preserves capability |

---

## 15. Executable template invariants

Reference targets currently exercised by the lab:

```text
logical history                 >= 1,000,000
working kernels scenario        >= 4
hot presentation runtimes       <= 3
hot logical window              ~2,048 messages
projection cache                <= 4,096 message entries
neighbor history shift          512 messages
mounted DOM                     < 180 rows
normal anchor drift             < 4 px
responsive anchor drift         < 6 px
adjacent row overlap            <= 1 px layout tolerance
virtual wrapper block spacing   exactly 0 px
stream projection               incremental patches grow; full projects do not grow per publish
```

FPS, heap and long-task numbers remain diagnostics because shared CI hardware is noisy. Deterministic bounded-work and semantic correctness are stronger cross-machine gates.

---

## 16. Adoption checklist

A project is using the framework rather than copying a demo only if it can answer **yes** to these questions:

1. Can provider/history/runtime adapters be replaced without changing renderers?
2. Can canonical model compile without Vue/DOM/virtualizer dependencies?
3. Can one message contain multiple heterogeneous semantic blocks?
4. Can a new block type be added without changing SessionKernel or viewport policy?
5. Can a session keep executing with zero mounted viewport and zero hot projection?
6. Can running sessions exceed hot-runtime count?
7. Are domain state, session interaction memory, rebuildable projection and physical caches distinguishable by lifetime?
8. Can a large historical jump happen without loading the skipped distance?
9. Does streaming avoid re-projecting settled content?
10. Does a keyed content update avoid invalidating unrelated row/order subscribers?
11. Are usage/cache/context totals independent of the hot window?
12. Is `Latest` exact from logical state rather than scrollbar geometry?
13. Can composer and responsive reflow preserve a semantic coordinate?
14. Are very large individual Markdown/code/diff outputs bounded before list virtualization?
15. Are renderer-local caches/preferences bounded and disposable?
16. Can the product theme/layout be replaced while semantic/geometry E2E gates remain green?
17. Do runtime-injected heterogeneous Turns traverse the same canonical path as real content?
18. Does the exact final source SHA pass both local-production and public-Pages Chromium gates?

If any answer is no, keep treating the implementation as an application-specific experiment rather than the reusable template.
