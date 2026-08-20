# Agent Long-Conversation Architecture Lab

Status: active implementation and validation on `feat/million-message-lab`.

## Background and target UX

This repository is not a generic virtual-list benchmark. It is a concrete architecture experiment for a CodeNomad/DSH-like Agent workspace where users keep many conversations in **Recent**, switch between them, inspect old history, expand thinking/tool details, and keep a current LLM response streaming while the conversation may already contain hundreds of thousands or millions of heterogeneous messages.

The target is **1,000,000 logical messages in one session** without eagerly materializing the history into framework state or DOM. The UI must remain product-like: sidebar Recent sessions, a single active conversation viewport, Markdown/code/diff/image/HTML/tool/thinking renderers, bottom-follow while the reader stays pinned, reliable escape when the reader scrolls upward, semantic viewport restore when switching sessions, a variable-height composer, and a floating **Latest** control with an exact count of logical messages after the reader.

Hard UX requirements:

- Recent contains multiple real, independently scoped conversations rather than decorative rows.
- A → B → A restores A's semantic reader position, draft and disclosure state without leaking B state.
- A running session can continue receiving model deltas while another session is visible or while its own reader is browsing old history.
- Thinking/tool/code/diff may change height after mount; virtualization must stay stable.
- The newest assistant response may grow continuously and is split into bounded RenderUnits instead of becoming one unbounded row.
- When the user leaves the bottom, a floating Latest button appears and shows the **exact** logical message count after the last visible logical message; clicking it returns directly to the true global tail and then disappears.
- The composer may grow from one line to roughly 180 px. It owns layout space and must resize the viewport rather than overlaying/stacking message cards.
- Composer resize at the tail keeps the reader pinned; composer resize in history preserves the same semantic top anchor within the same <4 px budget used for reverse prepend.
- Global jump and reverse-history prepend must work without creating a million-pixel DOM surface.
- Physical DOM, hot message state, renderer caches, and hot session runtimes remain bounded.

## Final architecture under test

```text
OpenCode / DSH / remote backend / synthetic lab
                  │
                  ▼
       ConversationHistoryAdapter
       (backend/protocol boundary)
                  │
                  ▼
          canonical LogicalMessage
                  │
                  ▼
             projector
     LogicalMessage → RenderUnit[]
                  │
                  ▼
       ConversationSessionRuntime
  2048-message semantic hot window
  512-message incremental shifts
  page-height Fenwick index
  async run + reader + draft state
                  │
                  ▼
      KeyedConversationProjection
        order: readonly NodeId[]
        nodes: Map<NodeId, RenderUnit>
                  │
        ┌─────────┴─────────┐
        │                   │
 order membership       one-node patch
 notification           notification
        │                   │
        ▼                   ▼
      Virtua           ConversationNodeSeat
 dynamic-height          key subscription
 virtualization               │
        └─────────┬───────────┘
                  ▼
          Vue renderer components
 markdown / thinking / tool / code / diff / image / html
```

Above the sessions is a framework-free `ConversationWorkspaceRuntime`. It keeps lightweight descriptors and semantic viewport snapshots for all Recent sessions, lazily creates heavy runtimes, and retains at most **3 hot session runtimes** by LRU. A running off-screen stream is intentionally pinned hot. Evicted sessions are reconstructed around their logical reader position; no DOM node or virtualizer object is persisted.

Vue is deliberately the projection layer, not the owner of Agent business state. `useWorkspaceRuntime()` is a thin revision bridge. The conversation runtime, workspace runtime, backend contract, stream controller, keyed projection and notifier are plain TypeScript and have no Vue/React/Solid dependency.

## DSH ideas deliberately adopted

The useful DSH lesson was not "use React". It was the render economics of a framework-free session model and a stable keyed conversation projection:

- raw/backend semantics are separated from UI nodes;
- order changes only when rows enter, leave or move;
- a streaming delta replaces one stable node instead of rebuilding the whole conversation projection;
- each rendered NodeSeat subscribes to exactly one node key;
- repeated mutations are microtask-batched before notifying the UI;
- session scope owns conversation state, so an off-screen session may continue processing events.

`KeyedConversationProjection` makes those properties executable. Unit tests assert that patching one streaming node does **not** publish the order or sibling node subscriptions, and twenty synchronous patches collapse into one node notification.

## Storage and bounded-state strategy

The 1M history is an addressable logical source, not one million Vue objects. The active session materializes only a 2048-message window. A neighboring shift is 512 messages.

A shift is incremental: only the newly entering 512 logical messages are loaded/projected; the retained ~1536 logical messages reuse the exact same RenderUnit objects. This preserves renderer and virtualizer identity while reducing CPU churn. A large random jump is different: it intentionally starts a new virtualizer epoch because old physical measurements have no useful relationship to a distant semantic window.

The page-level `PageHeightIndex` uses a Fenwick tree for global height estimates without maintaining a one-million-entry per-message prefix array. The global index is useful for navigation/diagnostics; the browser never receives one giant physical scroll element representing the entire logical history.

Per-session state is split by lifetime:

- **Persistent/lightweight:** descriptor plus semantic viewport snapshot (`logicalPosition`, stable `anchorUnitId`, `anchorOffsetPx`, `followTail`, `atVisualBottom`, `draftText`).
- **Hot/bounded:** 2048-message RenderUnit window, local height information, async stream state, projection nodes, virtualizer cache.
- **Sparse user state:** disclosure state is stored only for keys the user touched. RenderUnit IDs include the session scope, so identical logical indices in different sessions never share fold state.
- **Bounded renderer caches:** Shiki highlighting is done in a Worker with an LRU rather than on the UI thread or an unbounded global cache.

A production backend can replace `SyntheticHistoryAdapter` with OpenCode, DSH, IndexedDB/SQLite or network paging while preserving everything above the adapter contract.

## Rendering and streaming decisions

`Virtua` is the physical dynamic-height virtualizer. It is used only for the current hot projection, not for the entire 1M history. It supplies ResizeObserver-based measurement and start-shift semantics for reverse history.

Long/unbounded content is split before virtualization. A single logical assistant message can therefore own multiple stable RenderUnits. Synthetic live output rolls into another RenderUnit after roughly 6500 characters. This prevents the pathological case where "the last message" itself grows to tens of thousands of pixels.

Every live RenderUnit revision is retained by stable key, not just the newest chunk. This matters when a long response has already rolled over into several chunks and the reader leaves the viewport: all chunks can keep receiving/recovering session-scoped state and are recomposed when the reader returns to Latest.

Model ingress and UI publication are different rates. Synthetic model deltas can arrive at 5/20/60 Hz; publication is coalesced before the UI sees it. The stable list `order` is unchanged by normal token growth, so the parent list is not invalidated. Only the NodeSeat for the live RenderUnit updates.

Code syntax highlighting uses Shiki in a dedicated Web Worker. Markdown and HTML pass through DOMPurify. Images reserve dimensions up front to reduce late layout shifts.

## Async execution vs viewport navigation

This became a blocking requirement during browser testing. An Agent run and a viewport are different lifecycles:

```text
SessionRuntime
├─ execution / model stream       may continue off-screen
├─ live tail keyed revisions      may continue off-screen
└─ viewport/navigation
   ├─ global tail
   ├─ old history segment
   └─ unmounted because another Recent session is active
```

Therefore `jump(history)` and `A → B` never cancel or reset A's run. When A is revisited, its semantic viewport is restored. If the reader then presses Latest, the current tail projection is composed from the latest keyed live chunks accumulated while off-screen. Latest is navigation only; it does not start or stop the execution.

A running session is pinned in the hot-runtime set in this lab so the browser can continue consuming synthetic deltas. A production remote backend may use a lighter event/session cache, but the ownership rule remains the same: execution state is session-scoped, never component-scoped.

## Variable-height composer contract

The composer is a real grid row below the scroll viewport, never an absolute overlay. Its textarea auto-grows from about 56 px to 180 px and then scrolls internally. Resizing it changes the physical VList viewport height.

Two distinct semantics are required:

- **Pinned tail:** after the viewport shrinks/grows, Virtua is allowed to settle its measurement and the controller re-aligns the global tail. The final message remains visible and Latest stays hidden.
- **History:** the scroll viewport's top coordinate does not move. The same top semantic RenderUnit must remain at the same pixel Y (acceptance drift <4 px), while fewer/more rows become visible at the bottom.

The draft itself is session-scoped semantic state. A → B → A restores A's text and therefore its composer height without leaking B's draft.

## Latest semantics

`Latest` is intentionally based on logical semantics, not scrollbar approximation.

`currentLogicalPosition` means the **last logical message currently visible** in the viewport. At the true physical/global bottom the runtime explicitly normalizes it to `logicalCount - 1`, avoiding the common `Latest 1` ghost caused by a few pixels of virtualizer/scrollbar remainder.

```text
messagesAfter = logicalCount - 1 - currentLogicalPosition
```

The badge displays that exact integer. Switching sessions restores the session's semantic reader position and recomputes the number. Clicking Latest rebuilds/navigates to the tail hot segment when necessary, scrolls to the final RenderUnit of the final logical message, normalizes the reader to `logicalCount - 1`, and hides the control. It does not alter the Agent run lifecycle.

## Scroll/follow state machine

A streaming Agent conversation has two authorities that must never be confused:

1. **reader intent** — wheel/pointer input says whether the user wants control;
2. **observed physical scrolling** — offsets can also change because of programmatic follow or dynamic row measurement.

When pinned at the live tail, the first upward wheel gesture synchronously disables follow. That first transition is serialized through Virtua's public `scrollBy()` so a pending end-follow write or ResizeObserver correction cannot swallow it. During the intent window, explicit wheel direction is authoritative; stale programmatic offset direction is not allowed to re-enable follow.

When the reader is not at the logical tail, `messagesAfterCurrent` is derived from the last visible logical message, not a viewport-center probe.

## Approaches tried and rejected

### 1. Treating 1M history as framework/DOM state

Rejected by design. Virtualizing DOM alone is insufficient if one million message objects, derived lists or reactive dependencies remain hot.

### 2. TanStack Vue Virtual + fixed-length window replacement + manual anchor correction

An early implementation kept a fixed 2048-length array and replaced the semantic window in place. Because the physical virtualizer saw the same count, old measurement state could survive a completely different global window. Large jumps drifted and reverse prepend produced real anchor errors (observed around 113 px and later more than 600 px).

Manual `getBoundingClientRect → measure → scrollTop += delta` compensation was rejected rather than weakening the acceptance threshold. It mixed semantic window management with virtualizer physics and created competing sources of scroll truth.

### 3. Using physical offset direction as reader intent

Rejected. During streaming, a stale programmatic end-follow write can move the offset downward immediately after the user wheels upward. Treating that observed offset as authoritative can incorrectly restore follow mode. Explicit input direction and physical scroll observation are now separate concepts.

### 4. Framework-owned multi-session store

A temporary Vue-owned workspace store was created during exploration, then removed. It made the framework the owner of backend/runtime objects and did not realize the DSH-style projection boundary. The current workspace/session/projection layers are framework-free; Vue only bridges notifications to rendering.

### 5. Re-projecting all 2048 messages on every 512 shift

Functionally bounded but unnecessarily expensive and hostile to stable identity. The current session runtime projects only the entering 512 and reuses retained RenderUnit objects.

### 6. Coupling history navigation to the stream lifecycle

Rejected after async-session testing. A diagnostic `jump()` previously cleared live-tail/run state, which meant merely reading old history could destroy a running Agent execution. Navigation now modifies only the semantic hot viewport.

### 7. Deriving Latest from a center probe or raw scrollbar remainder

Rejected after reproducing a `Latest 1` ghost. The reader is the last visible logical message and is normalized to the final logical index at the true global bottom.

## Current technology choices

- Vue 3 for the product shell and renderer components.
- Virtua (`virtua/vue`) for dynamic-height physical virtualization.
- Plain TypeScript framework-free workspace/session/projection/store logic.
- `marked` + DOMPurify for Markdown/HTML handling.
- Shiki core + JavaScript regex engine inside a Web Worker for code highlighting.
- Fenwick tree page-height index for bounded global navigation metadata.
- Vitest for deterministic architecture tests.
- Playwright + real Chromium for UX/stress acceptance.
- GitHub Actions with pnpm store cache; system Chromium is used to avoid a repeated browser download.
- GitHub Pages for the public interactive proof.

## Acceptance tests

The experiment is only considered successful when all of the following are green in real Chromium **both against the local production candidate and against the actually deployed GitHub Pages URL**:

1. 1,000,000 logical messages remain addressable while mounted DOM stays below 180 rows.
2. The 2048-message hot window and hot-session runtime count remain bounded.
3. 60 Hz synthetic LLM ingress grows the current assistant response beyond one RenderUnit and remains pinned only while the reader wants follow.
4. Upward reader input immediately escapes follow; model output continues without stealing the viewport.
5. Global jump around message 500,000 works without loading the intervening history.
6. Reverse prepend of 512 messages preserves the same semantic RenderUnit within **< 4 px** viewport drift.
7. A running session continues streaming while its reader is in history and while another Recent session is active; multi-chunk live state is restored on return.
8. The floating Latest control is absent at a true tail, appears off-tail, shows exactly `logicalCount - 1 - lastVisibleLogicalMessage`, survives A → B → A restore, and disappears after returning to the true tail.
9. A growing composer never overlaps the VList/message cards. In history its semantic top anchor drifts <4 px; at the tail it remains pinned. Draft/height state is session-scoped.
10. Thinking/tool/code/diff/image/HTML renderers all work with real dynamic heights and sanitization/highlighting paths.
11. Recent session A → B → A preserves semantic reader position.
12. Disclosure and draft state are session-scoped; the same logical index in B does not inherit A's state.
13. More than three visited conversations still keep at most three heavy runtimes; an evicted session rehydrates around its semantic snapshot.
14. Unit tests, TypeScript, production Vite build, local Chromium E2E, GitHub Pages deployment, and the **same Chromium E2E suite against the deployed Pages URL** are all green.

## Progress and evidence

A green checkpoint at commit `b265836ece51c4b552afb1af3e61fc42fed575ae` / CI run #101 proved the pre-expanded suite:

- 16 unit tests passed;
- `vue-tsc --noEmit` and production Vite build passed;
- 3 Playwright Chromium scenarios passed in 16.1 s;
- the then-current public Pages probe passed.

That checkpoint is no longer sufficient for final acceptance because later UX review identified three blocking scenarios: async execution while navigating/switching, variable composer height, and exact Latest semantics. The suite has therefore been expanded to six browser scenarios, the deployed Pages workflow now runs the same Playwright suite after deployment, and runtime tests include multi-chunk async-tail recovery.

The public target is `https://topabomb.github.io/demo1/`.
