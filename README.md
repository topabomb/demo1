# Million Message Lab

A concrete browser stress rig for extremely long AI/agent conversations. The target is **1,000,000 logical messages** with variable-height Markdown, HTML, images, code, tool cards, and diffs while keeping Vue reactivity, active memory, physical scroll height, and DOM size bounded.

## What this validates

The project intentionally does **not** create a million Vue objects or DOM rows. It demonstrates the architecture discussed for CodeNomad-like agent UIs:

```text
Backend / synthetic source
        ↓
Canonical logical messages        (addressable by stable id/index)
        ↓
Presentation projector            (backend-neutral)
        ↓
RenderUnit[]                      (markdown/image/tool/diff/...)
        ↓
2048-message hot window           (512-message incremental shifts)
        ↓
TanStack Virtual dynamic measure  (viewport + overscan only)
        ↓
Vue 3 renderers
```

### Hard invariants

- Logical conversation size can be 10K / 100K / **1M**.
- The million-message source is deterministic and O(1)-addressable; it is never eagerly materialized.
- The active window is capped at 2,048 logical messages.
- A shift only generates/evicts 512 logical messages and preserves retained `RenderUnit` object identity.
- Long Markdown and diff messages split into multiple stable `RenderUnit`s so a single backend message cannot become an unbounded virtual row.
- Vue sees only the hot render units through a `shallowRef`; the million-message source and page height index are plain TypeScript objects.
- Dynamic row size is measured by TanStack Virtual; image dimensions are reserved up front with an aspect ratio.
- Segment rebasing uses a semantic anchor (`RenderUnit id + viewport offset`), not raw `scrollTop`.
- A page-level Fenwick tree tracks estimated global height in O(log pages), avoiding a million-item height prefix array.
- Streaming mutates one visible render unit through an override map rather than rebuilding the full active window.

## Stress controls

The published site lets you:

- switch between 10K, 100K and 1M logical messages;
- jump directly to any global logical message;
- continuously shift the active segment backward/forward;
- stream synthetic model deltas at 5/20/60 Hz into a row that keeps growing;
- expand/collapse code, diff, and tool renderers to force live `ResizeObserver` corrections;
- observe active render units, mounted DOM rows, FPS, frame p95, long tasks and heap (when the browser exposes it).

## Architecture boundaries

`ConversationSource` is the backend boundary. DSH, OpenCode or another runtime should implement it/adapt its event stream into canonical logical messages. `projectMessage()` is the presentation boundary. Renderer components know only `RenderUnit`; they never know the backend protocol.

A production implementation would replace the deterministic source with paged IndexedDB/SQLite/network persistence, while keeping the hot-window, page-height-index, projector and renderer contracts unchanged.

## Validation

```bash
npm install
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

CI validates algorithms and a real Chromium run. The browser gate asserts that a 1M logical conversation keeps fewer than 180 physical rows mounted, supports a global jump, performs streaming resize, and rebases a segment without console errors.

## Deployment

`.github/workflows/pages.yml` builds the Vite application with `/demo1/` as its GitHub Pages base path and deploys `dist/` using the official Pages artifact/deploy actions.
