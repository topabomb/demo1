# DeepSeek Harness Design Lessons — Adapted for demo1

`demo1` is a client-side Agent conversation framework/template. DeepSeek Harness is a much broader Agent runtime and plugin system. The useful comparison is therefore **not** “copy its package tree”; it is “which invariants survive when the backend/runtime and UI stack are different?”.

Reference:

- https://github.com/deepseek-ai/deepseek-harness
- `docs/architecture.md`
- `docs/cookbook/adding-a-conversation-node.md`
- `packages/client/AGENTS.md`

## Adopt the invariant, not the machinery

| Real scenario | Harness lesson | demo1 contract | Do not generalize yet |
|---|---|---|---|
| A model Turn can contain one or more requests/tool cycles | Turn and Step are different semantic coordinates | `turnId` is required; `stepId` is optional canonical identity and explicit renderer location when available | no Agent loop implementation in the UI template |
| A tool/result, job or deliverable is updated by several records | every update carries the same stable business ID; never attach to “latest unfinished” | tool call/result use one producer-owned `callId`; future multi-event nodes must use the same rule | no generic ConversationNode assembler until a real cross-event row exists |
| Streaming produces many mutations faster than the UI should repaint | apply semantic changes in order; coalesce publication independently | execution ingress is animation-frame coalesced; keyed RenderUnit publication is batched and bounded | no render-count-driven business semantics |
| History is cold/paged while live state is hot | replayable durable facts are upstream of the UI | `ConversationHistoryAdapter` owns cold canonical history; hot projection is disposable | no second browser event-sourcing layer if the real backend already owns one |
| A renderer needs business meaning | renderer receives final typed/keyed view data, not the whole Session | RenderUnit exposes stable `turnId`, `stepId`, `blockId`, message identity and renderer payload | renderer must not scan history, sibling nodes or DOM order |
| Several Vue views show the same runtime | one object layer owns business truth; UI bindings derive snapshots | `ConversationSessionRuntime` owns business/presentation state; Vue is an adapter | no business state inside component-local stores |
| Prepend/reconnect/replay changes the loaded window | identity and deterministic replay matter more than DOM reuse | retained keyed RenderUnits keep identity; hot window replacement is rebuildable | no cache entry may become source of truth |
| A capability has genuinely replaceable implementations | seam = definition + provider + consumer | add a port only when two real providers/consumers justify it | do not copy Cordis/service/plugin composition into this focused template |

## Semantic model

The canonical message vocabulary is intentionally smaller than Harness's durable SessionEvent vocabulary:

```text
LogicalMessage
├─ id / index
├─ turnId
├─ stepId?          # stable model-request coordinate when the producer has one
├─ role
└─ ContentBlock[]
   └─ stable block id + semantic data
```

A backend that already owns an append-only Agent event log may derive this canonical history from that log, exactly as Harness derives model/view state from durable Session events. A simpler backend may return canonical messages directly. `demo1` should support both through the history/runtime ports; it should not force the browser to become the persistence engine.

## Renderer identity

`RenderUnit` is a rebuildable view record, but its location is not opaque:

```text
RenderUnit
├─ stable render id
├─ messageId / messageIndex
├─ turnId
├─ stepId?
├─ blockId
├─ kind
├─ revision
└─ renderer-ready payload
```

This prevents three common mistakes:

1. decoding business location from an arbitrary payload;
2. correlating tool/result or related rows by adjacency;
3. walking Session/history state inside renderer components.

The DOM is never a source of semantic identity.

## When to add a ConversationNode assembler

The existing `ContentProjectorRegistry` is correct while **one canonical message/block owns one visual contribution**. Do not replace it with a generic event framework pre-emptively.

Add a keyed cross-event assembler only when a real feature needs several durable records to become one business-owned row, for example:

- long-running review/job progress;
- terminal/task lifecycle;
- deliverable creation → updates → completion;
- retry/continuation chain rendered as one semantic row;
- subagent task state.

When that happens, the assembler must satisfy these laws borrowed from Harness's Conversation Node design:

1. **Stable key:** every contributing event independently carries/derives the same business ID.
2. **Current-event match:** append handling classifies only the incoming event; no full-window scan.
3. **Deterministic fold:** replay in durable order yields the same State as live append.
4. **Prepend stability:** loading older history changes only affected contexts; unrelated keyed nodes retain identity.
5. **Pending-before-start:** update-only windows remain pending rather than being attached to an arbitrary visible node.
6. **Renderer-ready publication:** the renderer receives final node data, never the event collection or Session object.
7. **Independent cadence:** structural/terminal changes publish immediately; high-frequency progress may publish at animation-frame cadence without dropping semantic updates.

Until such a scenario exists, documenting these laws is more valuable than shipping unused generic code.

## Vue / physical rendering boundary

The Harness client rules reinforce an existing demo1 decision: mutable business objects belong outside the component tree. Vue should subscribe at a narrow adapter boundary and publish immutable/shallow snapshots; components render props/state and call explicit actions.

Physical layout has separate rules:

```text
semantic intent
(anchor | tail pin | explicit jump)
        ↓
product reflow / composer resize
        ↓
virtualizer + DOM measurement convergence
        ↓
restore the same semantic coordinate
```

A temporary scrollbar remainder, a Virtua measurement probe, or a recycled DOM row cannot redefine `Latest`, reader position, or the committed anchor.

## Resulting template boundary

Keep these as reusable contracts:

```text
backend/runtime ports
→ canonical conversation model
→ session/workspace lifetime
→ bounded keyed projection
→ semantic viewport policy
→ physical list adapter
→ renderer/product adapter
```

DeepSeek Harness strengthens the **identity, replay, event-order and UI-boundary rules inside those contracts**. It does not justify adding a general plugin runtime, service graph, profile/bundle system, or host Agent loop to `demo1`.
