# Agent Workspace Reference Architecture Lab

An **executable reference architecture** for Agent workspaces with very long heterogeneous conversations and many independent asynchronous/resumable sessions.

Live lab: **https://topabomb.github.io/demo1/**  
Architecture view: **https://topabomb.github.io/demo1/#architecture**

The claim is not “Vue can render one million messages”. The claim is:

> **Provider protocol, durable session execution, bounded semantic projection, semantic viewport policy, physical virtualization and product styling are separate ownership boundaries.**

Normal hot-path cost scales with changed/hot/visible content rather than total history, while many sessions may keep running, waiting or remain resumable without keeping a heavyweight viewport alive.

## Architecture

```text
Backend Adapter
      ↓ canonical messages/events
SessionKernel / Execution Registry
      ↓ hot/visible session only
Bounded ConversationRuntime + keyed projection
      ↓
Framework-neutral Semantic Viewport Policy
      ↓
Virtua/Vue physical adapter
      ↓
Replaceable Product UI / CSS
```

The demo proves both scaling dimensions at once:

- `1,000,000+` addressable logical messages with a bounded ~2,048-message hot projection and `<180` mounted rows;
- `>=4` concurrent working SessionKernels while heavyweight conversation runtimes remain `<=3`.

## Session model

A session deliberately does **not** have one overloaded status.

- **Live execution:** `idle | working | waiting | interrupted`
- **Last Turn result:** `completed | aborted | blocked | error | max-tokens | interrupted`
- **Human blocker:** `approval | question`
- **Workspace attention:** unread + queued follow-ups
- **Durable projections:** turns/steps, input/output/reasoning tokens, cache read/write/hit, context occupancy, structured failure

A failed/completed/interrupted historical session remains resumable. Blockers, queues, execution and usage statistics belong to the SessionKernel and survive viewport eviction.

## Layout portability

The viewport algorithm does not read CSS widths, colors or composer limits. The only CSS coupled to physical virtualization is the small geometry contract in `src/virtua-layout.css`: the scroll stage must size correctly and the virtualizer-owned measured wrapper must have zero vertical margin/padding.

Everything else—including sidebar width, content width, row gap and composer min/max height—is replaceable reference styling in `src/product-ux.css`. Browser tests change those values at runtime and re-run semantic anchor/non-overlap assertions.

## Validation

```bash
pnpm install
pnpm test
pnpm build
pnpm test:e2e
```

CI runs the complete Chromium suite against the production build. The Pages workflow then deploys the exact branch SHA and runs the **same suite against the public URL**.

Canonical documentation:

- [`docs/agent-workspace-reference-architecture.md`](docs/agent-workspace-reference-architecture.md) — ownership, state/store model, DSH-aligned semantics, token/cache accounting, viewport/CSS boundaries, failure-derived invariants and template checklist.
- [`docs/verification.md`](docs/verification.md) — executable acceptance matrix and final exact-SHA evidence.
