# Agent Conversation Framework Lab

Executable reference template for production-style Agent workspaces with **very long heterogeneous conversations, resumable asynchronous sessions and dynamic physical layout**.

- Live lab: **https://topabomb.github.io/demo1/**
- Architecture page: **https://topabomb.github.io/demo1/#architecture**
- Canonical architecture: [`docs/agent-workspace-reference-architecture.md`](docs/agent-workspace-reference-architecture.md)
- Scenario contracts: [`docs/agent-workspace-scenario-contracts.md`](docs/agent-workspace-scenario-contracts.md)
- DeepSeek Harness lessons: [`docs/deepseek-harness-design-lessons.md`](docs/deepseek-harness-design-lessons.md)
- Template review: [`docs/template-review.md`](docs/template-review.md)
- Verification contract: [`docs/verification.md`](docs/verification.md)

The claim is not “Vue can render one million messages”. The framework separates facts, bounded presentation and physical layout so normal work remains **`O(changed + hot + visible)`**, independent of total history.

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

## Physical ownership

The repository has two source ownership trees. This is an enforced architecture boundary, not a naming convention:

```text
src/
├── engine/                    reusable implementation
│   ├── core/                  small algorithm primitives
│   ├── model/                 canonical messages/blocks + mutations
│   ├── conversation/          session contracts/kernel/semantics
│   ├── presentation/          projection + keyed RenderUnits
│   ├── viewport/              framework-neutral viewport policy
│   ├── runtime/               bounded hot-session composition
│   ├── vue/                   Vue/Virtua adapter + renderer registry
│   │   ├── renderers/
│   │   ├── viewport-navigation-controller.ts
│   │   └── engine.css
│   └── workers/
│
└── demo/                      executable proof only
    ├── components/            workspace shell, diagnostics, architecture page
    ├── styles/
    ├── vue/
    ├── synthetic.ts           lazy million-message source
    ├── stream-controller.ts   demo playback/rate/telemetry
    ├── scenarios.ts           heterogeneous fixtures
    ├── workspace-fixtures.ts  seeded sessions
    └── workspace-runtime.ts   demo composition + hot-runtime LRU
```

`engine/**` may never import `demo/**`. Demo code may consume Engine APIs. `tests/architecture-boundaries.test.ts` verifies both the physical split and internal dependency direction.

## Stable Engine surface

Framework-neutral consumers import from `src/engine/index.ts`. It exposes:

- canonical `LogicalMessage + ContentBlock[]` and stable Message/Turn/Step/Block identity;
- backend/history/execution ports and `ConversationSessionKernel`;
- projector registry, bounded `ProjectionEngine`, keyed `RenderUnit` store;
- semantic viewport contracts;
- `ConversationSessionRuntime` and bounded hot-window behavior.

Synthetic playback is deliberately outside that surface. Rate, pause/resume controls and ingress/publish counters belong to `demo/stream-controller.ts`, not the SessionKernel, execution port or UI snapshot. The generic Engine only sees semantic execution (`submit`, `abort`, interaction resolution) and an ordered event revision.

## State lifetimes

| State | Examples | Rule |
|---|---|---|
| durable domain | history, execution, blockers, outcomes, usage/context | correct with no viewport |
| session interaction memory | reader/anchor/follow checkpoint, draft, disclosure preferences | small and session-scoped |
| rebuildable presentation | ~2K hot window, projection LRU, keyed RenderUnits | disposable and bounded |
| ephemeral physical | DOM, measured heights, renderer caches | mounted/render lifetime only |

A running SessionKernel is not the same thing as a hot presentation runtime or a mounted viewport.

## Cohesion, not file-count minimization

The template intentionally keeps Fenwick indexing, page-height indexing, segment management, notifier primitives and renderer-per-kind modules small. Those are stable algorithm/extension seams; merging them would create mixed responsibilities.

The review split only files with proven mixed ownership:

- workspace fixture data was removed from `DemoWorkspaceRuntime`;
- canonical message mutation helpers were removed from `ConversationSessionKernel`;
- demo diagnostics were removed from the workspace shell;
- mounted geometry, scroll intent, anchor restoration, tail pinning and latest-wins navigation were consolidated into one `ViewportNavigationController` instead of many tiny composables.

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

There are three owned style surfaces:

- `src/engine/vue/engine.css` — conversation Engine + renderer + virtualizer/composer rules, host-scoped from `[data-conversation-engine].conversation-shell`;
- `src/demo/styles/demo.css` — demo shell/diagnostics and the only stylesheet allowed to style `html`, `body` or `#app`;
- `src/demo/styles/architecture.css` — standalone architecture page.

CI includes a hostile-host CSS browser test where later global element rules attempt to override buttons, inputs, images and tables; Engine geometry must remain correct.

## What CI proves

The executable suite covers 1,000,000+ addressable messages, bounded hot runtimes and DOM, streaming reasoning/Markdown, tool/artifact correlation, uploads/media, responsive/composer reflow, exact Latest semantics, far jumps/prepend, session eviction/resume, blockers/failures/queue state, CSS isolation and architecture dependency direction.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:e2e
```

Pull requests run the complete local gate. `main` deploys Pages only after validation succeeds, then the same Chromium suite runs against the deployed public URL. Release acceptance belongs to the exact `main` SHA that passes both stages.
