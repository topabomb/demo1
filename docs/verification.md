# Verification and Release Contract

This file defines what must be true before the repository can be called released. GitHub Actions evidence for the **exact `main` SHA** is authoritative.

## Acceptance chain

One workflow owns validation and release:

1. frozen dependency install;
2. unit + architecture tests;
3. strict Vue/TypeScript typecheck and production build;
4. full Chromium E2E against the local production server;
5. on `main`, build and deploy GitHub Pages;
6. run the same Chromium suite against the deployed Pages URL;
7. publish `pages/deployed-e2e=success` for that exact SHA.

A Pages upload alone is not a release.

## Architecture invariants

Automated tests must protect these boundaries:

- `src/engine/**` never imports `src/demo/**`;
- framework-neutral Engine layers do not depend on Vue/DOM/physical layout;
- `src/engine/index.ts` excludes Vue/Demo implementation and tuning telemetry;
- `src/engine/vue/index.ts` remains instance-oriented rather than exposing process-global renderer mutation;
- external adapters own provider decoding, Agent/tool/child orchestration, child concurrency/provider selection, permission policy, persistence, retries and async IO;
- Demo owns workspace/LRU, playback timing, realistic scripted output, scripted child lifecycles and diagnostics;
- no core `PresentationSurface`, panel, sidebar, tab, drawer or editor-routing contract is introduced without a proven reusable multi-surface requirement;
- canonical or RenderUnit contracts contain no CSS class, color, width, panel placement or host open action.

### Workbench semantic invariants

- `ResourceRef` is the only canonical resource/location identity for resource-aware blocks and contains no host navigation behavior;
- `diff` uses `ResourceRef`, not a parallel `file` identity;
- PlanItem describes intended/progress work and never replaces or derives `stepId`;
- `ToolCategory` describes capability while `ToolPresentationIntent` independently describes renderer-neutral interpretation;
- presentation intent remains limited to generic/resources/changes/terminal semantics and contains no physical placement;
- tool call/result remain separate records correlated through producer-owned `callId`;
- one canonical `delegation` block contains one or more stable `AgentRunRef`s rather than separate singular/plural concepts;
- `AgentRunMode` is exactly parent-facing `foreground | background` observation and is never a scheduling command;
- each delegated run has its own status, stable `runId` and optional `childSessionId`; child status never redefines parent `SessionStatus` or `lastTurnReason`;
- parent delegation state never recursively embeds child `LogicalMessage[]`, child tool traces or nested child history;
- child scheduling, concurrency, provider/worktree choice, permission, resume/interrupt and child-session navigation remain outside Engine;
- terminal output is first-class canonical content rather than repeated opaque tool JSON;
- append-only terminal output emits `append-terminal` and `ProjectionEngine.appendTerminalDelta(...)` updates one stable terminal RenderUnit while unrelated siblings retain identity;
- terminal process lifecycle remains execution-adapter policy; Demo abort evidence must settle the terminal as `interrupted` with exit code `130`, never success.

### Existing session/runtime invariants

- `ConversationHistorySource` remains synchronous hot-read; async fetch/prefetch/cache fill stays outside Engine;
- restored `working` sessions never infer active assistant position from history order;
- `SessionStatus` and `lastTurnReason` remain independent;
- `status:'waiting'` exists iff one `pendingInteraction` exists;
- `requestInteraction(...)` is the explicit working→waiting transition;
- `resolveInteraction(...)` clears the blocker without inventing a Turn outcome;
- approval/question resolutions remain typed;
- queue payloads are runtime state, not implied durable persistence;
- realistic Demo scenarios enter through canonical `LogicalMessage + ContentBlock[]` only;
- presentation remains bounded/rebuildable;
- semantic reader/Latest/anchor is independent from virtualizer measurement;
- Demo playback/diagnostics never become Engine APIs;
- Engine Vue CSS stays host-scoped; only Demo may globally style the host page.

## Browser coverage

Local and deployed suites exercise the same real behavior.

### Default coding-agent workbench flow

The browser must prove the default public scenario, not a hidden fixture:

- the seeded first assistant Step visibly contains a Plan with one active and later completed items;
- filesystem/search tools expose stable `callId`, capability category, `resources` presentation intent and ResourceRef labels;
- Plan progress changes independently from actual model/tool Step coordinates;
- Step 3 renders one `delegation` batch containing a completed foreground reviewer and two independently addressable background reviewers still running;
- each delegated run exposes stable `runId`, `mode`, `status` and child-session address without rendering child trace recursively;
- the parent advances into shell/terminal work while the background children are still represented independently;
- the two background child statuses later settle to completed without redefining parent Turn/Session state;
- shell verification exposes `terminal` presentation intent;
- a standalone role:tool result streams a dedicated Terminal block through multiple deltas;
- terminal output contains unit/build/Chromium evidence and settles with explicit status/exit code;
- projection incremental counters increase during terminal growth;
- final synthesis includes rich GFM, resource-aware diff/code and artifacts;
- the original Plan reaches all-completed state;
- mounted rows stay bounded and adjacent rows do not overlap throughout.

### General coverage

The suite also covers:

- 1,000,000+ addressable messages with bounded hot state/cache/DOM;
- continuously growing GFM tables, tasks, nested lists, blockquotes and fenced code;
- typed user question answers and independent approval behavior;
- fresh idle sessions with no invented Turn outcome;
- failure/resume and background execution while viewports are switched/evicted;
- image/file/audio attachments, generated images, TTS/ASR, code, diff and sanitized HTML;
- far jump, prepend, exact Latest/follow and session restore;
- desktop/mobile reflow and variable-height content including expanded reasoning/terminal/delegation rows;
- hostile host CSS without breaking reference adapter containment;
- a focused public workspace with one-click Demo-owned Session diagnostics and no fake search/model/attachment/product controls.

## Deterministic reference bounds

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

These are verification bounds for the reference implementation, not framework-neutral API constants. FPS/heap/long-task values remain diagnostics because shared CI hardware is noisy.

## Public API checks

Architecture tests fail if the neutral entry exposes implementation details such as `SessionUiSnapshot`, `ShiftPlan`, `WINDOW_MESSAGES` or `SHIFT_MESSAGES`, or if workbench semantics acquire panel/layout/style/orchestration fields.

Architecture tests also assert the stable semantic additions (`ResourceRef`, PlanItem, ToolPresentationIntent, AgentRunMode/AgentRunRef, canonical `delegation` and terminal append support), the absence of the superseded singular `agent-run` block, and the absence of a speculative `PresentationSurface` core API.

The Vue API remains an optional reference adapter. Plan/Terminal/Delegation components and `workbench-renderers.css` may define physical presentation but cannot change canonical semantics. Every Engine Vue stylesheet must remain rooted at `[data-conversation-engine].conversation-shell` and must not reset `html`, `body` or `#app`.

The repository verifies source-level reuse; its package manifest disables npm publication. Package distribution requires a separate library-build/export-map/consumer-smoke-test decision.

## Workflow policy

- `pnpm-lock.yaml` is committed and CI uses `--frozen-lockfile`.
- Node/pnpm versions are explicit.
- PRs run the full validation gate but never deploy Pages.
- `main` deploys only after validation succeeds.
- main release concurrency is isolated from merged-PR cleanup.
- failures upload Playwright reports.

## Release evidence

A release is complete only when the exact `main` SHA has:

```text
unit / architecture       Green
strict type + build       Green
local full Chromium       Green
Pages deployment          Green
public deployed Chromium  Green
pages/deployed-e2e        success
```

Missing, cancelled or stale evidence means the release is incomplete.
