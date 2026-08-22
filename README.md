# Agent Conversation Framework Lab

A reusable Agent conversation **Engine + executable Demo/template** for very long heterogeneous histories, resumable background sessions, streaming content and dynamic UI layout.

- Live demo: https://topabomb.github.io/demo1/
- Architecture view: https://topabomb.github.io/demo1/#architecture
- Engine architecture: [`docs/architecture.md`](docs/architecture.md)
- Verification and release contract: [`docs/verification.md`](docs/verification.md)

The core design target is:

> normal UI work scales with **changed + hot + visible** state, not total history.

## Project boundary

```text
src/
├── engine/                  reusable implementation
│   ├── model/               canonical Message / ContentBlock model
│   ├── conversation/        session state + backend/execution ports
│   ├── presentation/        ContentBlock -> keyed RenderUnit projection
│   ├── viewport/            semantic reader / Latest / anchor policy
│   ├── runtime/             bounded hot-session composition
│   └── vue/                 Vue/Virtua reference adapter + renderers
└── demo/                    executable proof and product example
    ├── synthetic.ts         lazy large-history source
    ├── scenarios.ts         canonical Agent scenario fixtures
    ├── stream-controller.ts synthetic provider/execution behavior
    └── components/          workspace + diagnostics UI
```

`engine/**` never imports `demo/**`. Architecture tests enforce that direction.

## Engine pipeline

```text
Backend / execution adapter
        ↓
Canonical LogicalMessage + ContentBlock[]
        ↓
ConversationSessionKernel
        ↓ ordered semantic mutations
ProjectionEngine / keyed RenderUnits
        ↓
Semantic viewport runtime
        ↓
Vue/Virtua physical adapter + renderer registry
```

The Engine owns normalized conversation/session facts. It does not assume a provider, generate synthetic reasoning/answers, estimate billing usage, or hard-code product controls. Those policies belong to adapters such as the Demo's `stream-controller.ts`.

The UI also separates semantic state from physical layout: reader position, exact `Latest`, anchors and follow intent are Engine/runtime concepts; DOM measurements and Virtua state are physical-adapter concerns.

## What the Demo proves

The Demo exercises the normal Engine path for:

- 1,000,000+ addressable messages with bounded hot projection and DOM;
- streaming reasoning and Markdown with variable height;
- image/file/audio uploads, single and multiple;
- generic tool call/result rendering with stable `callId` correlation;
- image generation plus generated artifacts/provenance;
- TTS/ASR;
- code, diff, HTML and broad Markdown forms;
- queue, approval/question blockers, failure/resume and background execution;
- far jump, prepend, exact Latest/follow behavior and hot-runtime eviction;
- responsive layout, composer resize and hostile host CSS.

Demo fixtures are canonical messages; there is no renderer-only shortcut.

## Extension rule

For a normal new content type:

1. extend `ContentBlockMap`;
2. register `ContentBlock -> RenderUnit[]` projection;
3. register its renderer;
4. define containment/responsive behavior;
5. add unit/browser fixtures.

Do not introduce a generic plugin graph or cross-event node engine until a real feature requires one. Stable semantic responsibilities and replaceable implementation seams are preferred over abstraction-by-file-count.

## CSS ownership

- `src/engine/vue/engine.css` — Engine shell, viewport and composer geometry;
- `src/engine/vue/renderers.css` — renderer visuals and containment;
- `src/demo/styles/*` — host page, workspace, diagnostics and architecture-page styling.

Both Engine stylesheets are rooted at `[data-conversation-engine].conversation-shell`; only Demo styles may reset `html`, `body` or `#app`.

## Develop and verify

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:e2e
```

A release is accepted only when the exact `main` SHA passes unit/architecture tests, strict build, local Chromium, Pages deployment and the full Chromium suite against the deployed Pages URL. See [`docs/verification.md`](docs/verification.md).
