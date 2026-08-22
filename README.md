# Agent Conversation Framework Lab

A reusable Agent conversation **Engine + realistic executable Demo** for very long heterogeneous histories, resumable background sessions, streaming content and dynamic UI layout.

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
└── demo/                    executable product scenario + verification fixtures
    ├── session-scenarios.ts realistic canonical tails for public conversations
    ├── live-run-script.ts   mixed-content streaming scenario
    ├── synthetic.ts         lazy deep-history source for stress coverage
    ├── scenarios.ts         diagnostics/E2E compatibility gallery
    ├── stream-controller.ts synthetic provider/execution timing
    └── components/          workspace + optional diagnostics UI
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

The Engine owns normalized conversation/session facts. It does not assume a provider, generate demo reasoning/answers, estimate billing usage, or hard-code product controls. Those policies belong to adapters such as the Demo's `stream-controller.ts`.

The UI also separates semantic state from physical layout: reader position, exact `Latest`, anchors and follow intent are Engine/runtime concepts; DOM measurements and Virtua state are physical-adapter concerns.

## What the public Demo proves

The default page is intentionally a **realistic Agent workspace**, not an architecture control panel. Its preset conversations land on concrete recent tasks while retaining large lazy histories underneath:

- a 1,000,000-message release investigation that keeps running while history is browsed;
- live reasoning followed by rich Markdown while tool call/result, diff, code and image artifacts enter the same active turn;
- transport/code refactoring with tool correlation and patches;
- a production edit blocked on approval;
- a user-question blocker that survives session switching;
- multimodal upload/ASR/audio handoff;
- responsive image/HTML/table artifacts;
- resumable provider failure and long-context history.

New session, queue/stop/resume, session switching, exact Latest/follow behavior and background execution use the same Engine path as the seeded scenarios.

Synthetic deep history remains a Demo-only storage substitute so the same scenarios also prove:

- 1,000,000+ addressable messages with bounded hot projection and DOM;
- far jump and prepend with semantic anchor preservation;
- hot-runtime eviction while SessionKernels keep working;
- responsive layout and variable-height composer behavior.

Demo scenario tails are canonical messages; there is no renderer-only shortcut.

### Diagnostics

Performance counters, fixture injection, arbitrary global jumps and stress controls are verification tools rather than product affordances. They are hidden from the normal public workspace and can be enabled explicitly with `?diagnostics=1`; Playwright also enables them through `navigator.webdriver`.

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
- `src/demo/styles/*` — host workspace, scenario chrome, diagnostics and architecture-page styling.

Both Engine stylesheets are rooted at `[data-conversation-engine].conversation-shell`; only Demo styles may reset `html`, `body` or `#app`.

## Develop and verify

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:e2e
```

A release is accepted only when the exact `main` SHA passes unit/architecture tests, strict build, local Chromium, Pages deployment and the full Chromium suite against the deployed Pages URL. See [`docs/verification.md`](docs/verification.md).
