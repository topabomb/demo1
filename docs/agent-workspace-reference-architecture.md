# Agent Workspace Reference Architecture

Status: **candidate reference architecture under executable verification**.

This document is the single design source of truth for the lab. The goal is not a Vue/Virtua trick and not a CodeNomad clone. It is a portable architecture for Agent workspaces that must support very long heterogeneous conversations, multiple independent asynchronous sessions, resumable history, human blockers, durable usage statistics, and stable dynamic-height UX.

## 1. Target and non-goals

The architecture must keep two scaling dimensions independent:

1. **history scale** — a session may contain 1,000,000+ logical messages/events;
2. **workspace concurrency** — many sessions may be working, blocked, failed, idle or unread at the same time.

Normal rendering/update cost must depend on changed/hot/visible data, not total history.

This reference does **not** require Vue, Virtua, DSH, OpenCode, a particular provider, a specific sidebar, a fixed content width, or the dark theme in the demo. Those are replaceable adapters or product choices.

## 2. Portable ownership boundaries

```text
Provider / DSH / OpenCode / remote runtime
                 │
                 ▼
┌──────────────────────────────────────────────┐
│ 1. Backend Adapter                          │
│ paging · protocol translation · capabilities│
└───────────────────┬──────────────────────────┘
                    │ canonical messages/events
                    ▼
┌──────────────────────────────────────────────┐
│ 2. SessionKernel / Execution Registry        │
│ durable session semantics                    │
│ turns · run · queue · blockers · usage       │
└───────────────────┬──────────────────────────┘
                    │ hot/visible session only
                    ▼
┌──────────────────────────────────────────────┐
│ 3. Hot ConversationRuntime                   │
│ bounded segment · keyed projection · indexes │
└───────────────────┬──────────────────────────┘
                    ▼
┌──────────────────────────────────────────────┐
│ 4. Semantic Viewport Policy                  │
│ reader · Latest · anchor · follow · restore  │
└───────────────────┬──────────────────────────┘
                    ▼
┌──────────────────────────────────────────────┐
│ 5. Framework / Virtualizer Adapter           │
│ physical list · resize observer · DOM sample │
└───────────────────┬──────────────────────────┘
                    ▼
┌──────────────────────────────────────────────┐
│ 6. Product UI / CSS                          │
│ layout · theme · icons · composer limits     │
└──────────────────────────────────────────────┘
```

The first four are reusable architecture. Layer 5 adapts it to a frontend/runtime. Layer 6 is product presentation.

### Ownership matrix

| Concern | Owner | Durable across viewport eviction? | Framework reactive? |
|---|---|---:|---:|
| Provider protocol/cursors | Backend Adapter | yes | no |
| Canonical appended turns | SessionKernel | yes | no |
| Current execution | SessionKernel + ExecutionController | yes | no |
| Queue | SessionKernel | yes | no |
| Approval/question blocker | SessionKernel | yes | no |
| Last Turn result/failure | SessionKernel | yes | no |
| Token/cache/context projection | SessionKernel | yes | no |
| Unread/attention | SessionKernel / Workspace | yes | thin snapshot only |
| ~2K projected history | Hot ConversationRuntime | no; rebuildable | no deep reactivity |
| RenderUnit order/nodes | Keyed ProjectionStore | no; rebuildable | key-level bridge only |
| Reader/anchor/draft snapshot | semantic snapshot | yes | atomic snapshot only |
| Virtualizer measurement cache | frontend adapter | no | implementation detail |
| Mounted DOM | frontend adapter | no | visible only |
| Sidebar width/colors/row gap | product CSS | n/a | no semantic effect |

The key invariant is:

> **N running Agent sessions do not imply N heavyweight conversation runtimes or N mounted viewports.**

The demo keeps at least four working kernels alive while limiting heavyweight runtimes to three.

## 3. Session semantics

A resumable Agent session cannot be represented by one overloaded `status` string. Four dimensions are independent.

### 3.1 Live execution state

Portable live state used by this lab:

```text
idle
working
waiting
interrupted
```

`waiting` means execution is currently blocked on a human interaction. `interrupted` represents an interrupted live lifecycle; the session history is still resumable.

### 3.2 Last settled Turn result

The vocabulary aligns with DSH's portable Turn-end reasons:

```text
completed
aborted
blocked
error
max-tokens
interrupted
```

This is **historical outcome**, not permanent session lifecycle. For example:

```text
lastTurn = error(PROVIDER_TIMEOUT)
current execution = idle
composer = enabled
```

The user may submit another prompt, which starts a new `working` Turn and clears the active failure surface.

### 3.3 Blockers

The demo models the two common human blockers:

```text
approval
a question
```

A blocker belongs to the SessionKernel, not the mounted conversation component. It therefore survives Recent switching and hot-runtime eviction.

### 3.4 Attention

`unread` and queued follow-ups are workspace routing state. They may change while the session is off-screen.

### 3.5 Why this matches DSH well

DSH's canonical Session event model separates `turn/start`, `turn/end`, `step/start`, `step/end`, user/assistant/tool surface events and the Turn-end reason. The reference architecture adopts the same separation principle without depending on DSH packages or event wire shapes.

A backend adapter can map DSH/OpenCode/provider-specific events into these portable semantics.

## 4. Durable usage, cache and context projections

Usage is session/turn data, not viewport data. Never compute total input/output/cache statistics by folding only the currently projected 2K-message window.

The portable accounting uses disjoint prompt buckets, matching DSH semantics:

```ts
interface TokenUsage {
  inputTokens: number        // uncached input only
  cacheReadTokens: number
  cacheWriteTokens: number
  outputTokens: number
  reasoningTokens: number
}
```

Therefore:

```text
billed input = input + cacheRead + cacheWrite
cache hit %  = cacheRead / billed input
```

The SessionKernel also owns a context projection:

```ts
interface SessionContextStats {
  projectedTokens: number
  contextWindow: number
}
```

This is intentionally a whole-session/request projection. It can survive paging, compaction, viewport eviction and frontend remount.

The demo updates these counters while synthetic streaming runs so the UI proves the ownership model. A real backend should consume provider-reported usage whenever available rather than estimate it client-side.

Useful product projections include:

- turns / steps;
- input / output / reasoning tokens;
- cache read/write and cache-hit percentage;
- context occupancy;
- TTFT / run duration / tokens per second when backend timing is available;
- last Turn reason and structured failure code.

## 5. Long-history store and projection

### 5.1 Do not materialize the whole history into framework state

The demo can address 1,000,000 logical messages but only projects a bounded window (about 2,048 messages). Cold bodies belong to backend/persistence.

### 5.2 Stable keyed projection

The DSH-inspired projection shape is:

```text
order: NodeId[]
nodes: Map<NodeId, RenderUnit>
```

A streaming update patches one keyed node. It should not rebuild/filter the entire hot list when order membership has not changed.

A logical assistant message can project to multiple bounded RenderUnits. This prevents one enormous Markdown/code/diff message from becoming a single 100K-pixel virtual item.

### 5.3 Incremental neighboring shifts

The reference window shifts by 512 messages. Only the incoming slice is projected; retained RenderUnit objects preserve identity.

### 5.4 Global height/index data

The demo uses page-level aggregate heights and a Fenwick index. It intentionally does **not** maintain a million-item frontend height tree. Global navigation works at page/segment level; physical measurements remain local to the virtualizer.

## 6. Semantic viewport policy

Physical scroll state is not application truth.

```text
mounted DOM != visible DOM != committed semantic viewport
```

Virtualizers may mount measurement probes or temporary rows. The application owns:

- semantic reader: last visible logical message;
- exact messages-after count;
- Latest visibility;
- stable semantic anchor `{RenderUnitId, offsetPx}`;
- follow-tail intent;
- restoration policy.

The pure policy in `src/viewport/contracts.ts` consumes abstract physical measurements. It does not import Vue, Virtua or CSS.

### 6.1 Latest

```text
messagesAfter = logicalCount - 1 - reader
```

It is not derived from scrollbar remainder. At the true logical tail, `Latest` disappears even if the browser/virtualizer retains a tiny physical remainder.

### 6.2 Anchor

Only rows that:

1. intersect the physical viewport;
2. belong to the current projection;
3. are consistent with the committed semantic reader

may become an anchor. This rejects virtualizer measurement probes.

### 6.3 Follow-tail

Model streaming and user scroll intent are separate inputs. A reader scrolling upward must immediately own the viewport; programmatic tail follow cannot steal it back. Returning to Latest may re-enable follow when physically committed at the end.

### 6.4 Composer/layout resize

Composer height is **not an algorithm constant**. Product CSS chooses its min/max height. A ResizeObserver reports the resulting viewport change; semantic policy then either:

- re-pins a reader already committed to the tail, or
- restores the semantic anchor for a reader in history.

That means another product may use a 40–300px composer without changing session or viewport algorithms.

## 7. Framework / virtualizer adapter

The current adapter is Vue 3 + Virtua. It is not architectural.

The minimum abstract physical list port is approximately:

```ts
interface PhysicalListPort {
  scrollOffset: number
  scrollSize: number
  viewportSize: number
  findItemIndex(offset: number): number
  scrollTo(offset: number): void
  scrollBy(offset: number): void
  scrollToIndex(index: number, options?: ...): void
}
```

A React/Solid/another-virtualizer implementation only needs to supply equivalent physical operations and row geometry samples.

Vue itself receives shallow/atomic snapshots. The million-message canonical store is not a deep reactive object graph.

## 8. CSS integration contract versus product styling

Almost all CSS is replaceable. Only a tiny geometry contract is coupled to dynamic virtualization.

### Required geometry contract

1. The scroll stage must participate correctly in layout and be shrinkable (`min-height: 0` in a grid/flex implementation).
2. The physical virtual list must fill the stage.
3. **The virtualizer-owned measured item wrapper must not carry vertical margin/padding that the virtualizer does not include in its measurement.**
4. Product row spacing must live inside the measured content box.
5. Composer/pending-interaction UI must own layout space rather than overlaying the scroll viewport, unless an alternative adapter explicitly compensates for the overlay.

The reference file `src/virtua-layout.css` contains only these physical constraints.

### Replaceable product values

These are explicitly presentation, not algorithm:

```text
session sidebar width
conversation content width
row gap
composer min/max height
colors / font / border / shadow
user bubble shape
thinking/tool card style
Latest button placement/style
diagnostics placement
```

The demo exposes these as CSS custom properties and E2E changes them at runtime while checking semantic anchors and row geometry.

## 9. Real multi-session lifecycle

A historical session is not a frozen transcript.

```text
historical idle/failed/completed session
       │ submit
       ▼
append User message
append live Assistant message
status = working
       │
       ├── switch to another Recent session
       ├── hot runtime may be evicted
       └── SessionKernel continues receiving deltas
       │
       ▼
return / semantic rehydrate
       │
       ├── inspect history
       ├── Latest
       ├── stop
       └── submit another Turn
```

Submitting while already working creates a generic queued follow-up in the reference semantics. A concrete backend adapter may map that to queue, steer or another provider capability.

## 10. Renderer boundary

Renderer type is presentation metadata, not backend protocol:

```text
Markdown
thinking/reasoning
Tool call/result
code
diff
image
HTML/artifact
status/error
```

The virtualizer sees stable keys and sizes, not semantic renderer internals. Async image/highlighting/disclosure resize must feed the same measurement path.

Markdown/HTML is sanitized in the demo. Syntax highlighting runs in a Worker with bounded cache.

## 11. Practice-derived invariants

These failures are the most valuable output of the experiment.

| Observed failure | Root cause | Reusable invariant |
|---|---|---|
| `14.015625px` adjacent-row overlap | `7px + 7px` vertical decoration on Virtua-owned wrapper was outside its measurement model | virtualizer-owned wrapper is geometry-pure; spacing goes inside measured child |
| repeatable `+1023` reader restore drift | last-visible reader was interpreted as center of a 2048-message hot window | semantic reader meaning must be explicit and independent from segment construction |
| false composer anchor | a mounted Virtua measurement probe was treated as viewport truth | anchor only from committed semantic viewport |
| Jump window correct but viewport wrong | imperative scroll targeted an old virtualizer epoch | far navigation is a two-phase semantic-window then physical-commit transaction |
| upward wheel swallowed by streaming | user intent and programmatic follow were not arbitrated separately | explicit reader intent wins and cancels stale follow writes |
| `Latest 1` at apparent bottom | physical remainder was used as logical truth | Latest/count comes from logical reader |
| older user turn missing from DOM after public switch | slower environment let the live assistant push old row outside mounted buffer | DOM residency is not persistence; verify canonical history through semantic navigation |
| running sessions prevented LRU eviction | execution controller held heavyweight runtime | SessionKernel lifetime is independent from hot runtime lifetime |
| failed/completed history treated as terminal | one status mixed turn outcome with resumability | current execution and last Turn result are separate dimensions |
| usage tied to visible messages | viewport paging changes what is loaded | token/cache/context are durable session projections |

## 12. Template implementation checklist

A product adopting this architecture should be able to answer yes to all of these:

- Backend-specific types end at an adapter boundary.
- Session execution can continue with no mounted viewport.
- A running session can lose its hot projection/runtime.
- Historical sessions remain resumable after completion, interruption or failure.
- Blockers and queues are session-owned.
- Usage/cache/context statistics do not depend on the visible window.
- Framework reactive state is bounded by hot/visible work.
- RenderUnits have stable session-scoped keys.
- Large individual content is chunked or internally virtualized.
- Latest uses logical coordinates.
- Semantic anchors reject measurement probes.
- Composer/layout resizing preserves history anchor and tail pinning.
- Virtualizer wrapper geometry is controlled and tested.
- A theme/layout change does not change semantic algorithms.
- The same browser scenarios pass against the deployed production build.

## 13. Reference implementation mapping

```text
src/conversation/contracts.ts          portable session/backend contracts
src/conversation/session-kernel.ts     durable session/execution state
src/conversation/session-semantics.ts  derived status + usage semantics
src/conversation/workspace-runtime.ts  workspace registry + hot LRU
src/conversation/session-runtime.ts    bounded hot projection runtime
src/conversation/keyed-node-store.ts   stable order + keyed nodes
src/core/segment-manager.ts            bounded logical segment
src/viewport/contracts.ts              framework-neutral viewport policy
src/components/ConversationViewport.vue Vue/Virtua physical adapter + product composition
src/virtua-layout.css                  minimal geometry contract
src/product-ux.css                     replaceable reference product theme
```

See `verification.md` for the exact automated acceptance matrix and final build evidence.
