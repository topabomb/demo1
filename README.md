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
└── demo/                    executable product scenarios + verification fixtures
    ├── session-scenarios.ts realistic canonical tails for public conversations
    ├── live-run-script.ts   declarative Agent-loop/stress scenario data
    ├── stream-controller.ts Demo-only execution/timing orchestration
    ├── synthetic.ts         lazy deep-history source for stress coverage
    ├── scenarios.ts         diagnostics/E2E compatibility gallery
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

The Engine owns normalized conversation/session facts. It does not assume a provider, generate Demo reasoning/answers, choose tool sequences, estimate billing usage, or hard-code product controls. Those policies belong to adapters such as the Demo's `stream-controller.ts` and `live-run-script.ts`.

The UI also separates semantic state from physical layout: reader position, exact `Latest`, anchors and follow intent are Engine/runtime concepts; DOM measurements and Virtua state are physical-adapter concerns.

## Turn / Step / tool-loop model

A Turn is not assumed to be one DOM card or one assistant record. Producers may append several canonical records under one stable `turnId`:

```text
user request                 turn A / step 0
assistant stream             turn A / step 1
assistant tool call          turn A / step 1
tool result                  turn A / step 1
assistant stream             turn A / step 2
assistant tool call          turn A / step 2
tool result                  turn A / step 2
assistant final synthesis    turn A / step 3+
```

`stepId` is the stable model/tool-loop coordinate when the producer has one; `callId` correlates a tool call with its result. The Engine preserves these identities, while an execution adapter decides whether another model Step or tool invocation happens next. `ConversationSessionKernel.continueExecutionAt()` only moves an already-running execution to the next canonical assistant record; it contains no Agent-loop script or provider policy.

## What the public Demo proves

The default page is intentionally a **realistic Agent workspace**, not an architecture control panel or a benchmark page.

The default `Agent loop investigation` demonstrates one live Turn progressing through multiple canonical Steps:

```text
rich reasoning + streaming Markdown
        ↓
filesystem tool call/result
        ↓
new model Step + richer Markdown
        ↓
search tool call/result
        ↓
new model Step + richer Markdown
        ↓
shell verification call/result
        ↓
final synthesis + diff + code + artifacts
```

The Markdown stream deliberately contains GFM tables, task lists, nested lists, blockquotes, fenced code and repeated growing sections. Tool categories and stable `callId`s are visible in the generic tool renderer. Each live tool call is an independently addressable canonical assistant record and each result is a separate canonical `role: tool` record, so timeline replay and virtualization never depend on DOM adjacency.

Other Recent conversations demonstrate transport/code refactoring, approval and user-question blockers, multimodal upload/ASR/audio handoff, responsive image/HTML/table artifacts, and resumable provider failure/long-context history.

The separate `Million-message streaming stress` conversation has a narrower job: prove that 1,000,000+ addressable messages, continuous rich Markdown, history browsing and virtualized layout stay bounded. It intentionally does **not** reuse the product Agent-loop script, so performance measurements are not polluted by expected structural tool/message transitions.

New session, queue/stop/resume, session switching, exact Latest/follow behavior and background execution use the same Engine path as the seeded scenarios. Demo scenario tails are canonical messages; there is no renderer-only shortcut.

### Session diagnostics

The public workspace keeps a one-click **Session diagnostics** panel because observability is part of the engine demonstration, not disposable test chrome. It is closed by default for normal use and automatically open under Playwright.

The panel intentionally focuses on high-value evidence: exact history navigation, bounded window loading, live-output cadence, active canonical Turn/Step, tool call/category correlation, canonical renderer verification, logical/hot/DOM scale, concurrent SessionKernel/runtime counts, projection/incremental work, queue/reader state, provider token/cache/context accounting, and browser frame performance. Low-value implementation counters such as virtual epochs, renderer counts and individual renderer-cache sizes are not part of the public diagnostics surface.

## Markdown rendering contract

Markdown chunking uses the same Marked GFM parser contract as HTML rendering. A long document may split only between top-level parser blocks; lists, tables, blockquotes and fenced code stay semantically atomic even when they contain blank lines. During normal streaming, settled prefix `RenderUnit`s retain identity and only the changed Markdown tail is reprojected.

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
- `src/demo/styles/*` — host workspace, diagnostics and architecture-page styling.

Both Engine stylesheets are rooted at `[data-conversation-engine].conversation-shell`; only Demo styles may reset `html`, `body` or `#app`.

## Develop and verify

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:e2e
```

A release is accepted only when the exact `main` SHA passes unit/architecture tests, strict build, local Chromium, Pages deployment and the full Chromium suite against the deployed Pages URL. See [`docs/verification.md`](docs/verification.md).
