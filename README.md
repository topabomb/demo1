# Agent Conversation Framework Lab

A provider-neutral conversation **Engine + executable Demo host** for very long heterogeneous Agent histories, resumable sessions, rich streaming output and dynamic virtualized layout.

- Live demo: https://topabomb.github.io/demo1/
- Architecture view: https://topabomb.github.io/demo1/#architecture
- Architecture contract: [`docs/architecture.md`](docs/architecture.md)
- Verification/release contract: [`docs/verification.md`](docs/verification.md)

The design target is:

> normal UI work scales with **changed + hot + visible** state, not total history.

## Responsibility boundary

```text
External provider / persistence / network adapters
        │ normalize + cache
        ▼
src/engine/**
  canonical model · SessionKernel · projection
  semantic viewport · Vue reference adapter
        ▲
        │ consume
src/demo/**
  workspace/LRU · scenarios · synthetic playback
  stress history · diagnostics · architecture page
```

The Engine does **not** own Agent orchestration, provider protocol, durable persistence, async DB/network fetching or multi-session product policy. The Demo is one host implementation that composes Engine sessions and proves them under realistic/stress scenarios.

`engine/**` never imports `demo/**`; architecture tests enforce this.

## Engine contracts

### Canonical history

Provider/runtime data is normalized into:

```text
LogicalMessage
├─ message id / global index
├─ turnId
├─ stepId?       producer-owned loop coordinate
├─ role
└─ ContentBlock[]
```

A Turn may contain several assistant/tool records. Tool call and result correlate through a stable producer-owned `callId`; artifact provenance is explicit rather than inferred from DOM order.

### SessionKernel

`ConversationSessionKernel` owns runtime session truth: normalized messages, execution status, blockers, queue, outcomes and accounting. It is **not** a persistence server.

`SessionStatus` and `lastTurnReason` are deliberately different facts. `idle` means no execution is currently running; it does **not** imply that a Turn completed. Historical outcomes change only when an execution adapter explicitly reports them.

A rehydrated working session may provide `activeAssistantIndex`. The Engine never guesses that the newest history record is the active execution target.

Approval and question blockers also remain semantically distinct:

```ts
type InteractionResolution =
  | { kind: 'approval'; approved: boolean }
  | { kind: 'question'; answer: string | null }
```

A user question therefore carries an actual answer instead of being reduced to a fake approval boolean. Resolving any blocker validates the response type and clears blocker state only; approval, denial, answer or skip does not itself invent a `completed` or `aborted` Turn outcome. The execution adapter decides what happens next.

### History source

`ConversationHistorySource` is a synchronous, globally addressable read contract used by the hot runtime. Real products should place async DB/API fetch, prefetch and caching outside that interface, then expose locally available ranges synchronously to the Engine.

### Presentation and viewport

Canonical history is not one giant component tree. The reference runtime keeps a bounded hot message segment, projects keyed `RenderUnit`s, and lets Virtua mount only visible/overscan rows.

Semantic reader/Latest/anchor/follow state is separate from DOM measurement. Responsive reflow and virtualizer probes cannot redefine conversation position.

Markdown chunking uses the same Marked GFM parser contract as rendering; lists, tables, blockquotes and fences stay atomic. Append-only Markdown reparses only the mutable tail plus delta while settled prefix units retain identity.

## Public API policy

`src/engine/index.ts` is the framework-neutral API surface. It intentionally excludes Demo/Vue implementation and runtime tuning/telemetry such as window sizes, shift plans and UI snapshots.

`src/engine/vue/index.ts` exposes the intended Vue composition surface:

- `ConversationViewport`
- `RenderUnitView`
- `RendererRegistry`
- `createDefaultRendererRegistry`

Per-viewport renderer registries are preferred; process-global renderer mutation is not part of the public Vue API.

This repository builds a Vite Demo/Pages application. Its package manifest has `"private": true`, which disables package publication; it does **not** mean the public GitHub repository is private. The Engine is source-level reusable and extraction-ready, but this repo does **not** claim a published npm package. Packaging/export maps should be added only when distribution itself becomes a requirement.

## What the Demo proves

The default **Agent loop investigation** runs one Turn through multiple canonical model/tool Steps:

```text
rich reasoning + streaming GFM
→ filesystem call/result
→ next model Step
→ search call/result
→ next model Step
→ shell call/result
→ final synthesis + diff + code + artifacts
```

Tool call/result are separate addressable history records. Rich Markdown includes tables, tasks, nested lists, blockquotes and fenced code while output is still changing.

The separate **Million-message streaming stress** scenario proves 1,000,000+ addressable messages with bounded hot projection/DOM, far navigation and incremental Markdown without mixing those measurements with expected multi-step tool transitions.

Other Recent sessions cover approvals, question blockers with user-entered answers, failure/resume, background execution during viewport eviction, multimodal attachments/ASR/audio and responsive artifacts.

### Session diagnostics

The one-click diagnostics panel is intentionally **Demo-owned observability**. It separates:

- Demo controls/telemetry — synthetic playback rate, pause/resume, ingress/publish counts and fixture injection;
- Engine evidence — logical/hot/DOM scale, projection work, exact reader state, Turn/Step/tool identity, blockers/queue and normalized accounting.

It is closed by default for normal users and automatically open under Playwright.

## Extension rule

For a normal new content type:

1. extend `ContentBlockMap`;
2. register `ContentBlock -> RenderUnit[]` projection;
3. register a renderer in a registry instance;
4. define containment/responsive behavior;
5. add unit/browser evidence.

Do not introduce a generic plugin graph or cross-event assembler until a real durable feature needs it.

## CSS ownership

- `src/engine/vue/engine.css` — Engine shell/viewport/composer/blocker geometry;
- `src/engine/vue/renderers.css` — renderer visuals and containment;
- `src/demo/styles/*` — host workspace, diagnostics and architecture page.

Both Engine stylesheets are rooted at `[data-conversation-engine].conversation-shell`; only Demo styles may reset `html`, `body` or `#app`.

## Develop and verify

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:e2e
```

A release is accepted only when the exact `main` SHA passes unit/architecture tests, strict build, local Chromium, Pages deployment and the full Chromium suite against the deployed Pages URL.
