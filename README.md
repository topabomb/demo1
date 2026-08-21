# Agent Conversation Framework Lab

Executable reference template for production-style Agent workspaces with **very long heterogeneous conversations, resumable asynchronous sessions and dynamic physical layout**.

- Live lab: **https://topabomb.github.io/demo1/**
- Architecture page: **https://topabomb.github.io/demo1/#architecture**
- Canonical architecture: [`docs/agent-workspace-reference-architecture.md`](docs/agent-workspace-reference-architecture.md)
- Scenario contracts: [`docs/agent-workspace-scenario-contracts.md`](docs/agent-workspace-scenario-contracts.md)
- DeepSeek Harness lessons: [`docs/deepseek-harness-design-lessons.md`](docs/deepseek-harness-design-lessons.md)
- Template review: [`docs/template-review.md`](docs/template-review.md)
- Verification contract: [`docs/verification.md`](docs/verification.md)

The claim is not “Vue can render one million messages”. The framework separates facts, presentation and physical layout so normal work remains **`O(changed + hot + visible)`**, independent of total history.

```text
Backend / Runtime Ports
        ↓
Canonical Conversation Model
        ↓
Session Kernel ──────→ Workspace / execution summaries
        ↓ ordered semantic events
Projection Runtime
        ↓
Semantic Viewport Policy
        ↓
Physical List Adapter
        ↓
Renderer / Product Adapter
```

## Stable framework surface

Framework-neutral consumers import from `src/engine/index.ts`. That public surface includes:

- canonical `LogicalMessage + ContentBlock[]` and stable Message/Turn/Step/Block identity;
- backend/history/execution ports and `ConversationSessionKernel`;
- projector registry, bounded `ProjectionEngine`, keyed `RenderUnit` store;
- semantic viewport contracts;
- `ConversationSessionRuntime` and bounded hot-window behavior.

Demo fixtures, synthetic execution, Vue components and diagnostics are intentionally excluded. `src/demo/` owns fake history/scenarios/workspace composition; `src/vue/` and `src/components/` are reference frontend adapters.

## State lifetimes

| State | Examples | Rule |
|---|---|---|
| durable domain | history, execution, blockers, outcomes, usage/context | correct with no viewport |
| session interaction memory | reader/anchor/follow checkpoint, draft, disclosure preferences | small and session-scoped |
| rebuildable presentation | ~2K hot window, projection LRU, keyed RenderUnits | disposable and bounded |
| ephemeral physical | DOM, measured heights, renderer caches | mounted/render lifetime only |

A running SessionKernel is not the same thing as a hot presentation runtime or a mounted viewport.

## Content and extension contract

A normal new content type should require only:

1. extend `ContentBlockMap`;
2. register `ContentBlock → bounded RenderUnit[]` projection;
3. register the frontend renderer;
4. define containment/responsive behavior;
5. add canonical unit/browser fixtures.

It should not require edits to SessionKernel, history segmentation or semantic viewport policy.

If one visual/business row truly spans multiple durable records, introduce a stable-business-ID assembler for that feature and require deterministic replay/prepend/append behavior. Do not force ordinary single-message blocks through a generic cross-event node engine.

Tool execution and displayable artifacts remain separate semantics. Calls/results correlate through producer-owned stable IDs such as `callId`; image/audio/file artifacts keep provenance rather than relying on DOM adjacency.

## DeepSeek Harness influence

The template adopts the scene-relevant parts of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): durable/model facts upstream of UI, distinct Turn/Step coordinates, producer-owned stable business identity, ordered semantic mutation separate from UI publication cadence, and renderer-ready keyed data. It deliberately does not copy Cordis or a general plugin/service runtime. See the dedicated design-lessons document for the mapping.

## CSS / host boundary

There are only two application style surfaces:

- `src/styles/engine.css` — conversation engine + renderer + virtualizer/composer rules, scoped from `[data-conversation-engine].conversation-shell`;
- `src/styles/demo.css` — demo shell, diagnostics and the only stylesheet allowed to style `html`, `body` or `#app`.

`src/architecture.css` is isolated to the architecture page. Old mixed product/renderer/virtualizer stylesheets were removed. CI includes a hostile-host CSS browser test where later global element rules attempt to override buttons, inputs, images and tables; engine geometry must remain correct.

## What CI proves

The executable suite covers 1,000,000+ addressable messages, bounded hot runtimes and DOM, streaming reasoning/Markdown, tool/artifact correlation, uploads/media, responsive/composer reflow, exact Latest semantics, far jumps/prepend, session eviction/resume, blockers/failures/queue state, CSS isolation and architecture dependency direction.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:e2e
```

Pull requests run the complete local gate. `main` deploys Pages only after validation succeeds, then the same Chromium suite runs against the deployed public URL. Release acceptance belongs to the exact `main` SHA that passes both stages.
