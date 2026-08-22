# Verification and Release Contract

This file defines what must be true before the repository can be called released. GitHub Actions metadata for the **exact `main` SHA** is authoritative.

## Acceptance chain

One workflow owns validation and release:

1. frozen dependency install;
2. unit + architecture tests;
3. strict Vue/TypeScript typecheck and production build;
4. full Chromium E2E against the local production server;
5. on `main`, build and deploy GitHub Pages;
6. run the same Chromium suite against the deployed Pages URL.

A Pages upload by itself is not a release. The deployed-site browser gate must also pass.

## Architecture invariants

Automated tests must protect these boundaries:

- `src/engine/**` never imports `src/demo/**`;
- `src/engine/index.ts` remains framework-neutral and excludes Vue/Demo implementation plus runtime tuning/telemetry contracts;
- `src/engine/vue/index.ts` exposes instance-oriented renderer composition rather than process-global mutation helpers;
- Engine owns canonical/session semantics, not Agent-loop/provider/Demo policy;
- multi-session routing, Recent metadata and hot-runtime LRU remain host/Demo composition rather than a hidden `WorkspaceKernel`;
- `ConversationHistorySource` stays an honest synchronous hot-read contract; async DB/network fetch/prefetch/cache fill remains outside Engine;
- a restored `working` session never infers its active assistant from history order; the host/provider supplies `activeAssistantIndex` explicitly when known;
- `SessionStatus` and `lastTurnReason` remain independent: live state alone never invents a settled Turn outcome;
- `status: 'waiting'` and `pendingInteraction` are one invariant state and must be present together;
- `requestInteraction(...)` is the explicit `working → waiting` transition; `resolveInteraction(...)` clears only that blocker and returns to outcome-neutral `idle`;
- approval and question blockers keep distinct typed resolutions; a question carries a user answer string or explicit no-answer/skip payload;
- interaction request/resolution never invents `completed`, `aborted` or other Turn outcomes; execution adapters must report outcomes through `finishExecution(...)` explicitly;
- queue payloads are runtime SessionKernel state and are not described as implicitly durable persistence;
- realistic Demo scenarios enter through canonical `LogicalMessage + ContentBlock[]`, never renderer-only shortcuts;
- presentation is bounded and rebuildable from canonical history;
- semantic reader/Latest/anchor state is separate from DOM/virtualizer measurements;
- tool/result/artifact correlation uses stable producer IDs;
- Demo playback cadence, fixture injection and synthetic telemetry do not become Engine APIs;
- Engine CSS remains host-scoped; Demo alone may style the host page globally.

## Browser coverage

The local and deployed suites exercise the same product behavior:

- 1,000,000+ addressable messages with bounded hot state and DOM;
- a realistic multi-Step Agent Turn with separate canonical assistant tool-call and `role: tool` result records;
- filesystem/search/shell tool categories correlated by stable `callId`;
- continuously growing GFM tables, task lists, nested lists, blockquotes and fenced code;
- a user-entered question answer plus independent approval behavior;
- blocker resolution returning to an outcome-neutral idle state until execution policy explicitly continues or finishes the Turn;
- a fresh empty session remaining `Idle` with `lastTurnReason = none`, not an invented completed/active outcome;
- realistic preset task tails for code/transport work, multimodal handoff and failure recovery;
- image/file/audio attachments, image generation, TTS/ASR, code, diff, HTML and broad Markdown forms;
- queue, failure/resume and background execution while viewports/hot runtimes are switched or evicted;
- far jump, prepend, exact Latest/follow behavior and session restore;
- desktop/mobile reflow and variable-height composer/blocker UI;
- renderer containment, sanitized HTML and no page-level horizontal overflow;
- hostile host CSS without breaking Engine geometry;
- a scenario-focused public workspace with one-click Demo-owned Session diagnostics and no fake search/model/attachment controls.

## Deterministic bounds

```text
logical history             >= 1,000,000
Demo hot runtimes           <= 3
working kernels scenario    >= 4
hot logical window          ~2,048 messages
neighbor shift              512 messages
projection cache            <= 4,096 entries
mounted DOM                 < 180 rows
semantic anchor drift       < 4 px
adjacent row overlap        <= 1 px tolerance
body horizontal overflow    <= 1 px
virtual wrapper block gap   exactly 0 px margin/padding
```

These are reference implementation verification bounds, not framework-neutral public API constants. FPS, heap and long-task counters remain diagnostics because shared CI hardware is noisy.

## Public API checks

Architecture tests should fail if the neutral public entry starts exporting implementation details such as `SessionUiSnapshot`, `ShiftPlan`, `WINDOW_MESSAGES` or `SHIFT_MESSAGES`.

Vue API checks should fail if `ConversationNodeSeat` or process-global registry mutation helpers become public without an explicit architecture decision.

The repository currently verifies source-level reuse; its package manifest disables npm publication. It does not claim package distribution. A future package release requires its own library build/export-map and consumer smoke tests.

## Workflow policy

- `pnpm-lock.yaml` is committed and CI installs with `--frozen-lockfile`.
- Node and pnpm versions are explicit.
- PRs run the full validation gate but never deploy Pages.
- `main` deploys only after validation succeeds.
- release concurrency is isolated from merged-PR cleanup.
- failures upload Playwright reports for diagnosis.

## Release evidence

A release is complete only when the exact `main` SHA has:

```text
unit / architecture       Green
strict type + build       Green
local Chromium            Green
Pages deployment          Green
public deployed Chromium  Green
```

Missing, cancelled or stale evidence means the release is not complete.
