# Agent Long-Conversation Architecture Lab

Status: **ACCEPTED architecture proof** on `feat/million-message-lab`.

This document is the design record for the experiment. The Vue/Virtua application is a reference implementation used to prove the architecture; it is not the architecture itself. Final executable evidence is recorded in [`final-acceptance-evidence.md`](final-acceptance-evidence.md).

## 1. Problem and target UX

A real Agent workspace has several properties at the same time:

- one conversation may contain hundreds of thousands or millions of logical messages;
- message heights are unknown and may change after mount (Markdown, thinking, tool results, images, HTML, diff, syntax highlighting);
- the current assistant output may grow continuously;
- users switch between many Recent conversations;
- a conversation may continue running asynchronously while it is not visible;
- each conversation owns independent reader position, draft, disclosures and live state;
- the composer changes height and therefore changes the physical viewport;
- users expect exact “Latest / messages after” semantics, not a scrollbar approximation;
- the frontend must not depend on OpenCode, DSH, a provider protocol or one message schema.

The primary performance target is **1,000,000 logical messages** with bounded hot state and bounded physical DOM. The primary UX target is that the above interactions continue to behave like a normal CodeNomad/DSH-style Agent client.

## 2. Architecture claim

The central design rule is:

> **Long Agent conversations are four different lifecycles. Do not collapse them into one framework-owned message list.**

```text
Backend / provider / Agent runtime
             │
             ▼
┌───────────────────────────────┐
│ 1. ConversationBackend        │  backend lifetime
│ protocol translation + paging│
└──────────────┬────────────────┘
               ▼
       canonical events/messages
               │
               ▼
┌───────────────────────────────┐
│ 2. Conversation Engine        │  session lifetime
│ execution + logical history   │
│ live tail + semantic snapshot │
└──────────────┬────────────────┘
               ▼
┌───────────────────────────────┐
│ 3. Projection Store           │  hot semantic lifetime
│ bounded RenderUnits           │
│ order[] + nodes[stable key]   │
└──────────────┬────────────────┘
               ▼
┌───────────────────────────────┐
│ 4. Viewport Controller        │  mounted viewport lifetime
│ dynamic measure + scroll      │
│ anchor + follow + resize      │
└──────────────┬────────────────┘
               ▼
          framework UI
```

### Layer 1 — backend boundary

`ConversationBackend` is the only place allowed to know OpenCode, DSH, a remote API, IndexedDB/SQLite or the synthetic data source. It produces canonical logical data.

Current reference implementation: `SyntheticHistoryAdapter`.

### Layer 2 — session/execution lifetime

Execution belongs to a conversation session, not a Vue component. It may continue while:

- the user reads older history;
- another Recent conversation is active;
- the conversation viewport is completely unmounted.

The current lab exposes this through the framework-free `ConversationExecutionController` contract and `SyntheticStreamController` reference implementation.

### Layer 3 — semantic projection

Backend messages are not rendering rows. `LogicalMessage` is projected into one or more bounded `RenderUnit`s. A very long assistant answer, code block or diff may become multiple units.

`ConversationProjectionStore` exposes two separate channels:

```text
order: NodeId[]
             └─ changes only when membership/order changes

nodes: Map<NodeId, RenderUnit>
             └─ one streaming node can change independently
```

`KeyedConversationProjection` implements this model. This is the main idea borrowed from DSH: stable keyed presentation state outside React/Vue, with a NodeSeat subscribing to one key.

### Layer 4 — physical viewport

The virtualizer owns only the currently mounted physical coordinate system. It does not represent the whole million-message history.

Virtua is the current reference implementation for dynamic measurement. A far jump starts a new virtualizer epoch rather than trying to reuse unrelated physical measurements.

## 3. Workspace and store model

Recent is a real multi-session workspace, not decorative UI.

```text
ConversationWorkspaceRuntime
├─ lightweight Recent descriptors
├─ semantic ViewportSnapshot / session
├─ independent execution controller / session
└─ bounded hot viewport runtimes (LRU)
```

A semantic snapshot contains only data that is meaningful after DOM destruction:

```ts
{
  logicalPosition,
  anchorUnitId,
  anchorOffsetPx,
  followTail,
  atVisualBottom,
  draftText
}
```

It deliberately excludes Vue objects, DOM nodes, Virtua handles and provider protocol objects.

Current lab invariant: at most three heavy hot session runtimes. Cold sessions rehydrate around their semantic reader position.

Production refinement: asynchronous execution/live-tail state can be kept even lighter than the viewport runtime so many background runs do not force many heavyweight viewports to stay resident. The ownership boundary is already explicit; the lab currently keeps the single synthetic running session hot so its browser-side stream can continue.

## 4. Two coordinate systems, not one giant scroll surface

The logical history and browser scroll surface are different coordinate systems.

```text
logical conversation       0 … 999,999
            ↓
semantic hot window        ~2,048 logical messages
            ↓
RenderUnit projection      bounded rows for those messages
            ↓
physical Virtua viewport   usually tens of mounted DOM rows
```

Neighboring movement is 512 messages. Only the incoming slice is projected; retained RenderUnit objects keep identity.

A page-level Fenwick index supplies bounded global navigation metadata. The browser never receives a hundreds-of-millions-pixel element representing the full history.

### Reader position is not a window center

`ViewportSnapshot.logicalPosition` is the **last visible logical message**. It is authoritative semantic state, not a hint for how to center a hot page. A cold/reconstructed session therefore creates its initial bounded range **ending at that reader**. An explicit far jump may build a fresh centered range, because physical navigation will then move the requested target into view within that new virtualizer epoch.

This distinction was made executable after stress testing exposed a repeatable `+1023` error — exactly half of a 2048-message window minus one — when the semantic reader had accidentally been interpreted as a segment center during rehydration.

## 5. Rendering contract

A renderer is downstream of the projection boundary. The list does not know Markdown, tools or images.

Current renderer set:

- Markdown (`marked` + DOMPurify)
- thinking disclosure
- tool call/result disclosure
- code (Shiki in a Web Worker)
- diff
- image with reserved dimensions
- sanitized HTML
- text

### Critical geometry invariant

A virtual row owns all of its visual geometry. No child may escape the measured row border box with negative outer margins or similar cross-row tricks.

The user-visible failure that exposed this rule was adjacent thinking/tool cards visibly overlapping. The browser gate measured the overlap as `14.015625px`, matching the old `7px + 7px` vertical padding on the Virtua-owned wrapper.

The final ownership rule is stronger than “remove the negative margin”:

> **Virtualizer-owned wrappers are geometry-pure. Product spacing/decoration belongs inside the measured child content.**

Playwright has an explicit invariant:

```text
for every mounted adjacent row:
    next.top >= previous.bottom - 1px
```

This runs after disclosure expansion, async highlighting/measurement, composer resize and session remount.

## 6. Streaming and follow semantics

Model ingress rate and UI publication rate are separate. Synthetic ingress supports 5/20/60 Hz and publication is coalesced before rendering.

A normal token update changes one stable RenderUnit key, not list membership. Long live output rolls into another RenderUnit after roughly 6500 characters.

Reader intent and observed physical scrolling are also separate authorities:

- wheel/pointer input represents user intent;
- offsets may change because of user input, Virtua measurement or programmatic follow.

An upward gesture at the live tail disables follow before a pending measurement/end-follow update can reclaim the viewport.

## 7. Programmatic navigation semantics

A virtualizer can temporarily mount a row for measurement without having committed the requested physical navigation. Therefore **DOM presence is not a navigation-completion signal**.

The final acceptance model for Jump is:

```text
semantic target
      ↓
replace bounded projection / virtual epoch
      ↓
virtualizer may mount measurement probes
      ↓
programmatic physical scroll settles
      ↓
target is actually visible
      ↓
semantic reader converges around target
      ↓
Jump is complete
```

This rule avoids both arbitrary sleeps and false-positive completion while retaining a bounded centered window for explicit far navigation.

## 8. Latest semantics

`Latest` is a logical navigation control, not a scroll-position heuristic.

`currentLogicalPosition` means the last logical message currently visible.

```text
messagesAfter = logicalCount - 1 - currentLogicalPosition
```

At the true global/physical bottom the reader is normalized to `logicalCount - 1`, preventing a ghost `Latest 1` caused by tiny virtualizer remainders.

Clicking Latest navigates to the true tail and does **not** start or stop the Agent execution.

## 9. Variable-height composer contract

The composer is an independent grid row below the viewport. It grows from roughly 56px to 180px and then scrolls internally. It is never an overlay on top of messages.

Two semantics are required:

- at the tail: a composer resize re-pins the true measured end;
- in history: the same top semantic RenderUnit stays at the same pixel Y, with `<4px` drift.

Draft state is session-scoped and survives Recent switching.

## 10. What practice rejected

### Million-message framework state

Rejected. DOM virtualization is insufficient when the application still owns one million reactive objects or repeatedly scans the whole history.

### Backend message → Vue component

Rejected. It couples the product UI to OpenCode/DSH/provider wire semantics and prevents independent projection evolution.

### TanStack Vue + fixed-length whole-window replacement + manual anchor compensation

Rejected after real browser drift (roughly 113px and later >600px). A same-length list could retain measurements belonging to a completely different global segment. Manual `measure → rect → scrollTop correction` mixed semantic and physical responsibilities.

### Physical scroll direction as user intent

Rejected. Streaming measurement/programmatic follow can move the physical offset in the opposite direction immediately after an upward user gesture.

### Component-owned Agent execution

Rejected. History navigation or Recent switching must not reset a running Agent.

### Re-projecting all 2048 messages for every 512 shift

Rejected. Current shifts project only the entering slice and reuse retained RenderUnit objects.

### Center-probe / raw scrollbar Latest

Rejected after reproducing `Latest 1` at the true tail.

### Cross-row negative margins or decorated virtualizer wrappers

Rejected after a visible card-overlap failure. Virtualized rows must be independent measured boxes and the wrapper owned by the virtualizer must remain geometry-pure.

### DOM-presence-only Jump completion

Rejected after traces showed a target row could exist as a Virtua measurement probe while the viewport was still physically blank and the Reader remained at the segment boundary. Completion now requires visible target + semantic convergence.

## 11. Reference implementation mapping

| Architecture role | Reference implementation |
| --- | --- |
| Backend boundary | `ConversationBackend`, `SyntheticHistoryAdapter` |
| Async execution | `ConversationExecutionController`, `SyntheticStreamController` |
| Session engine | `ConversationSessionRuntime` |
| Workspace scope | `ConversationWorkspaceRuntime` |
| Projection | `ConversationProjectionStore`, `KeyedConversationProjection` |
| Per-node subscription | `ConversationNodeSeat.vue` |
| Physical virtualization | `virtua/vue` |
| Framework bridge | `useWorkspaceRuntime()` + Vue components |
| Rich rendering | renderer registry/components |
| Browser acceptance | Playwright Chromium |

Vue and Virtua are replaceable. The contracts and invariants above are the reusable result of the experiment.

## 12. Acceptance matrix

Final acceptance requires the production candidate and the deployed GitHub Pages build to pass the same Chromium UX suite.

1. 1,000,000 logical messages with `<180` mounted rows.
2. Semantic hot window and hot-session runtime counts remain bounded.
3. 60 Hz LLM streaming rolls into multiple RenderUnits.
4. Upward input escapes tail-follow while output continues.
5. Far jump around message 500,000 works without traversing intervening history and completes only after visible/semantic convergence.
6. Reverse prepend of 512 preserves semantic anchor `<4px`.
7. Async execution survives history browsing and Recent switching.
8. Latest count is exact, session-scoped and disappears at true tail.
9. Variable composer never overlaps messages; history anchor `<4px`; tail re-pins.
10. Thinking/tool/code/diff/image/HTML dynamic rendering works.
11. A → B → A restores semantic viewport/draft/disclosure state.
12. More than three visited sessions keep heavy viewport state bounded by LRU.
13. Mounted heterogeneous rows never overlap after resize/remount/disclosure/async measurement.
14. Architecture page and interactive reference lab are both reachable on Pages.
15. Unit tests, TypeScript, production build, local Chromium, Pages deployment and Pages Chromium are all green.

## 13. Final status

The architecture proof has reached its defined exit condition.

Validated implementation checkpoint: `7330c7a0c6f237b0fa8da0389516d0688c84267c`.

At that checkpoint:

- **20/20** architecture/unit tests passed;
- TypeScript typecheck and production Vite build passed;
- local production-candidate Chromium suite passed **8/8**;
- GitHub Pages deployed the exact same commit;
- the same Chromium suite ran against `https://topabomb.github.io/demo1/` and passed **8/8**;
- the commit received durable status `pages-public-e2e = success` linked to its deployment/verification run.

The detailed run IDs, failure history, `14.015625px` overlap diagnosis, `+1023` reader diagnosis and complete acceptance matrix are preserved in [`final-acceptance-evidence.md`](final-acceptance-evidence.md).

Public lab: `https://topabomb.github.io/demo1/`  
Architecture view: `https://topabomb.github.io/demo1/#architecture`
