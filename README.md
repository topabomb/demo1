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
Backend / Execution Ports
        ↓
Canonical Conversation Model
        ↓
Session Kernel ──────→ session facts / summaries
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

The repository has two enforced source ownership trees:

```text
src/
├── engine/                    reusable implementation
│   ├── core/                  small algorithm primitives
│   ├── model/                 canonical messages/blocks + pure mutations
│   ├── conversation/          session contracts/kernel/semantics
│   ├── presentation/          projection + keyed RenderUnits
│   ├── viewport/              framework-neutral viewport policy
│   ├── runtime/               bounded hot-session composition
│   ├── vue/                   Vue/Virtua adapter + renderer registry
│   │   ├── renderers/
│   │   ├── viewport-navigation-controller.ts
│   │   ├── engine.css         shell / viewport / composer
│   │   └── renderers.css      content renderer visuals
│   └── workers/
│
└── demo/                      executable proof only
    ├── components/            workspace shell, diagnostics, architecture page
    ├── styles/                product/demo CSS
    ├── vue/
    ├── synthetic.ts           lazy million-message source
    ├── stream-controller.ts   synthetic provider/playback policy
    ├── scenarios.ts           heterogeneous fixtures
    ├── workspace-fixtures.ts  seeded sessions + display metadata
    └── workspace-runtime.ts   demo composition + hot-runtime LRU
```

`engine/**` may never import `demo/**`. `tests/architecture-boundaries.test.ts` verifies the physical split, internal dependency direction, provider-policy boundary, Vue product seam and CSS ownership.

## Stable Engine surface

Framework-neutral consumers import from `src/engine/index.ts`. It exposes:

- canonical `LogicalMessage + ContentBlock[]` and stable Message/Turn/Step/Block identity;
- backend/history/execution ports and `ConversationSessionKernel`;
- projector registry, bounded `ProjectionEngine`, keyed `RenderUnit` store;
- semantic viewport contracts;
- `ConversationSessionRuntime` and bounded hot-window behavior.

The Engine stores provider-normalized facts; it does **not** invent provider behavior. It never assumes a reasoning block, creates synthetic answers, estimates billing/cache usage, or injects demo completion/abort copy. The executable synthetic adapter owns those policies and maps them into the same canonical/session APIs a real provider adapter would use.

## State lifetimes

| State | Examples | Rule |
|---|---|---|
| durable domain | history, execution, blockers, outcomes, normalized usage/context | correct with no viewport |
| session interaction memory | reader/anchor/follow checkpoint, draft, disclosure preferences | small and session-scoped |
| rebuildable presentation | ~2K hot window, projection LRU, keyed RenderUnits | disposable and bounded |
| ephemeral physical | DOM row count, measured heights, renderer caches | mounted/render lifetime only |

A running SessionKernel is not the same thing as a hot presentation runtime or a mounted viewport. DOM telemetry and diagnostics inputs never write back into Engine session/runtime truth.

## Vue / product seam

`ConversationViewport.vue` owns only real conversation behavior: status/stop, blockers, composer/send, Latest, semantic rendering and the physical virtualized viewport. Product-specific UI is injected through four narrow slots:

- `header-context`
- `header-actions`
- `viewport-overlay`
- `composer-tools`

The public Demo uses those seams for “Synthetic playback” context and architecture diagnostics. The Engine intentionally contains no fake model selector, fake search action or fake attachment button.

## Content and extension contract

A normal new content type should require only:

1. extend `ContentBlockMap`;
2. register `ContentBlock → bounded RenderUnit[]` projection;
3. register the frontend renderer;
4. define containment/responsive behavior;
5. add canonical unit/browser fixtures.

It should not require edits to SessionKernel, history segmentation or semantic viewport policy.

Tool execution and displayable artifacts remain separate semantics. Calls/results correlate through producer-owned stable IDs such as `callId`; image/audio/file artifacts keep provenance rather than relying on DOM adjacency.

## CSS / host boundary

Engine styles are intentionally split by responsibility, not by component count:

- `src/engine/vue/engine.css` — design tokens plus shell/viewport/composer geometry;
- `src/engine/vue/renderers.css` — renderer/content visuals and containment;
- `src/demo/styles/demo.css` — workspace navigation, Demo slots, diagnostics and the only global page reset;
- `src/demo/styles/architecture.css` — architecture page.

Both Engine stylesheets are rooted at `[data-conversation-engine].conversation-shell`. Products can override documented custom properties without the Engine knowing whether a sidebar or diagnostics panel exists. CI includes a hostile-host CSS browser test where later global element rules attempt to override buttons, inputs, images and tables; Engine geometry must remain correct.

## What CI proves

The executable suite covers 1,000,000+ addressable messages, bounded hot runtimes and DOM, streaming reasoning/Markdown, tool/artifact correlation, uploads/media, responsive/composer reflow, exact Latest semantics, far jumps/prepend, session eviction/resume, blockers/failures/queue state, CSS isolation, clean product slots and architecture dependency direction.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:e2e
```

`main` deploys Pages only after validation succeeds, then the same full Chromium suite runs against the deployed public URL. Release acceptance belongs to the exact `main` SHA that passes both stages.
