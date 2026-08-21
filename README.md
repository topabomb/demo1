# Agent Conversation Presentation Framework Lab

An **executable reference architecture** for production-style Agent workspaces with very long heterogeneous conversations and many independent asynchronous/resumable sessions.

- Live lab: **https://topabomb.github.io/demo1/**
- Architecture: **https://topabomb.github.io/demo1/#architecture**

The claim is not “Vue can render one million messages”. The framework separates seven ownership contracts:

```text
Backend Adapter
      ↓ canonical messages/events
SessionKernel / Execution Registry
      ↓ LogicalMessage + ContentBlock[]
Content Projector Registry
      ↓ bounded stable RenderUnit[]
Hot keyed Projection Runtime
      ↓
Framework-neutral Semantic Viewport Policy
      ↓
Virtua/Vue Physical List Adapter
      ↓
Renderer Registry + replaceable responsive Product UI
```

## What the lab proves

- `1,000,000+` addressable logical messages without eager framework state;
- `>=4` concurrent working SessionKernels while heavyweight hot runtimes stay `<=3`;
- historical sessions remain resumable after completed/failed/interrupted Turns;
- approval/question blockers, queues, drafts, unread state and token/cache/context projections survive viewport eviction;
- one canonical message can contain heterogeneous `ContentBlock[]`;
- semantic projectors and frontend renderers are independent extension registries;
- Markdown, reasoning, tool call/result, code, diff, image and sanitized HTML all use the same canonical path;
- long Markdown is fence-safe chunked and cached so settled prefix chunks keep stable revisions during streaming;
- runtime controls append mixed Turns and a Markdown compatibility gallery through SessionKernel rather than DOM mocks;
- exact Latest/messages-after, semantic anchors, user escape from tail-follow and variable composer height;
- desktop/tablet/phone layout changes do not remove session access or create page-level horizontal overflow;
- renderer containment and virtualizer geometry remain valid under responsive reflow;
- local production Chromium and deployed GitHub Pages run the same browser suite.

## Extension model

Adding a new output such as `citation`, `terminal-session`, `file-tree`, `chart` or `subagent` should require only:

1. extending the canonical `ContentBlockMap`;
2. registering `ContentBlock → RenderUnit[]` projection;
3. registering the frontend renderer component;
4. defining renderer containment/responsive behavior;
5. adding canonical unit/browser fixtures.

SessionKernel, long-history paging and semantic scroll policy should remain unchanged.

## CSS/layout boundary

- `src/virtua-layout.css` — tiny non-negotiable physical geometry contract;
- `src/renderer-content.css` — renderer containment (Markdown/pre/table/code/diff/image/tool/HTML);
- `src/product-ux.css` — replaceable product theme;
- `src/responsive-ux.css` — replaceable desktop/tablet/phone adapter.

Conversation algorithms do not read CSS widths, colors, row gaps or composer limits.

## Validation

```bash
pnpm install
pnpm test
pnpm build
pnpm test:e2e
```

CI runs unit/type/build plus the full Chromium suite against the local production build. The Pages workflow deploys the exact branch SHA and runs the **same suite against the public site**.

Canonical documentation:

- [`docs/agent-workspace-reference-architecture.md`](docs/agent-workspace-reference-architecture.md) — framework contracts, store/session model, renderer/projector extension protocol, Markdown/streaming strategy, responsive/CSS boundaries and failure-derived invariants.
- [`docs/verification.md`](docs/verification.md) — executable acceptance matrix and exact final-SHA evidence.
