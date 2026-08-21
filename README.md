# Agent Conversation Framework Lab

Executable reference template for production-style Agent workspaces with **very long heterogeneous conversations, asynchronous resumable sessions and dynamic physical layout**.

- Live lab: **https://topabomb.github.io/demo1/**
- Architecture page: **https://topabomb.github.io/demo1/#architecture**
- Canonical design: [`docs/agent-workspace-reference-architecture.md`](docs/agent-workspace-reference-architecture.md)
- Template review / extraction guide: [`docs/template-review.md`](docs/template-review.md)
- Verification contract: [`docs/verification.md`](docs/verification.md)

The claim is not “Vue can render one million messages”. The framework separates state by lifetime and responsibility:

```text
Backend / Runtime Ports
        ↓
Canonical Conversation Model
LogicalMessage + ContentBlock[]
        ├──────────────→ Session + Workspace Kernel
        ↓
Projection Runtime
Projector Registry + bounded ProjectionEngine + keyed RenderUnits
        ↓
Semantic Viewport Policy
reader · Latest · anchor · follow
        ↓
Physical List Adapter
        ↓
Renderer + responsive Product Adapter
```

## Four state lifetimes

| State | Examples | Rule |
|---|---|---|
| durable domain | history, execution, blockers, outcomes, usage/context | correct with no viewport |
| session interaction memory | reader/anchor/follow checkpoint, draft, touched disclosures | small; survives Recent switching |
| rebuildable presentation | ~2K hot window, projection LRU, keyed RenderUnits | disposable and bounded |
| ephemeral physical | DOM, measured heights, renderer caches | mounted/render lifetime only |

The hot-path target is **`O(changed + hot + visible)`**, not `O(total history)`.

## Template boundary

The reusable contract is `model/ + conversation kernel/ports + presentation/ + viewport policy`. Vue, Virtua, renderer components, synthetic fixtures, diagnostics and product CSS are reference adapters. Compatibility barrels and synthetic-message fields exist because this repository evolved from a stress demo; they are not recommended API surface for a new product. See the template review for the remaining extraction seams and the order in which to remove them.

## What the lab exercises

- `1,000,000+` addressable logical messages without one-million-item Vue state;
- multiple background-running/blocked/failed/completed-resumable sessions with `<=3` hot presentation runtimes;
- canonical reasoning, Markdown, tool call/result, code, diff, image and sanitized HTML;
- runtime injection of mixed Turns and a Markdown compatibility gallery through the same SessionKernel path as normal content;
- bounded keyed projection and an append-only Markdown streaming fast path;
- exact `Latest` / messages-after semantics, user escape from tail follow and far-history jumps;
- variable-height composer, disclosure, image/load and responsive reflow without row overlap;
- desktop/tablet/phone with Recent moved to a drawer rather than removed;
- input/output/cache/context and projection-cache diagnostics;
- identical Chromium scenarios against local production build and deployed GitHub Pages.

## Extension contract

Adding `citation`, `terminal-session`, `file-tree`, `chart`, `artifact` or `subagent` should require only:

1. extend `ContentBlockMap`;
2. register `ContentBlock → bounded RenderUnit[]` projection;
3. register the frontend renderer;
4. define renderer containment/responsive behavior;
5. add canonical unit/browser fixtures.

It should **not** require edits to SessionKernel, history segmentation or semantic viewport policy.

## Physical/CSS boundary

- `src/virtua-layout.css` — tiny non-negotiable measured-geometry integration;
- `src/renderer-content.css` — renderer containment;
- `src/product-ux.css` / `src/responsive-ux.css` — replaceable reference product UI.

Conversation algorithms do not read product widths, colors, gaps or breakpoints.

## Validate

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:e2e
```

Pull requests run the complete local gate. A push to `main` is deployed only after that gate passes, then the same Chromium suite is run against the public Pages URL. Acceptance is recorded only for an exact SHA that passes both stages.
