# Agent Long-Conversation Architecture Lab

This repository is a **reference architecture + executable browser proof** for Agent workspaces that must handle very long, heterogeneous conversations without coupling the UI to OpenCode, DSH, a provider protocol, a specific renderer, or a specific frontend framework.

Live interactive proof: **https://topabomb.github.io/demo1/**  
Architecture view: **https://topabomb.github.io/demo1/#architecture**

The central claim is not “Vue can render one million messages”. It is:

> **A long Agent conversation must be split into independent lifecycles so rendering and interaction cost scale with the hot/visible working set, not total history length.**

## Reusable architecture

```text
Backend / DSH / OpenCode / remote service
                  │
                  ▼
         ConversationBackend
      protocol + paging boundary
                  │
                  ▼
      canonical LogicalMessage/Event
                  │
                  ▼
         Conversation Engine
 execution · logical history · snapshots
                  │
                  ▼
         Presentation Projector
      LogicalMessage → RenderUnit[]
                  │
                  ▼
      ConversationProjectionStore
       order[] + keyed stable nodes
                  │
        ┌─────────┴──────────┐
        ▼                    ▼
 physical virtualizer     NodeSeat
 dynamic measurements   one-key subscription
        └─────────┬──────────┘
                  ▼
           framework renderer
```

The workspace adds a separate scope above this: Recent descriptors, per-session semantic snapshots, independent asynchronous executions, and a bounded hot-viewport LRU.

### Four lifecycles

1. **Backend lifetime** — provider/runtime protocol stays behind `ConversationBackend`.
2. **Session/execution lifetime** — Agent execution may continue while the viewport is in history or another Recent session is active.
3. **Semantic projection lifetime** — only a bounded hot window is projected into stable `RenderUnit` keys.
4. **Viewport lifetime** — virtualizer measurements, physical scroll offsets and DOM nodes are ephemeral and may be discarded/rebuilt.

Vue and Virtua are the reference implementation, not architectural dependencies.

## Executable invariants

- `1,000,000` logical messages are addressable but are not eagerly materialized into Vue or DOM.
- About `2,048` logical messages form the active semantic window; neighboring movement is `512` messages.
- A shift projects only the incoming slice and retains unchanged RenderUnit object identity.
- Normal streaming patches one keyed node; the parent order and sibling NodeSeats are not invalidated.
- Long assistant/code/diff content is split into bounded RenderUnits.
- Physical DOM stays bounded (`<180` mounted rows in the stress gate).
- Reverse prepend and history composer resize target `<4px` semantic anchor drift.
- Dynamic heterogeneous rows must never geometrically overlap.
- Recent sessions have independent reader/draft/disclosure/stream state.
- `Latest` reports the exact logical count after the last visible message; it is not derived from scrollbar approximation.
- The composer owns layout space and never overlays the conversation viewport.
- Markdown/HTML is sanitized; syntax highlighting runs in a Worker with a bounded cache.

## Why the lab exists

Browser practice changed the design. Earlier approaches produced real failures: stale physical measurement caches on far jumps, 100+ px prepend drift, swallowed upward wheel intent during streaming, a `Latest 1` ghost at the true bottom, composer-resize anchor drift, and card overlap caused by geometry escaping a virtual row’s measured border box.

Those are recorded as rejected approaches rather than hidden behind looser tests.

## Validation

```bash
pnpm install
pnpm test
pnpm build
pnpm test:e2e
```

Playwright/Chromium covers million-history bounds, 60 Hz streaming, user escape from follow, far jump, reverse prepend, async off-screen execution, Latest semantics, variable composer height, multi-session restore/LRU, rich renderers, and row non-overlap.

The Pages workflow deploys the production build and then runs the same browser suite against the public URL.

For the full architecture rationale, mappings, rejected alternatives, progress, and acceptance matrix see [`docs/agent-conversation-architecture-lab.md`](docs/agent-conversation-architecture-lab.md).
