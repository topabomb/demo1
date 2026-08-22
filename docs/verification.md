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

- `src/engine/**` is reusable and never imports `src/demo/**`;
- `src/engine/index.ts` remains framework-neutral and excludes Vue/Demo implementation;
- SessionKernel owns canonical/session facts, not synthetic/provider policy;
- provider-specific content generation, token estimates, playback rate and telemetry remain adapter/Demo concerns;
- realistic Demo scenarios still enter through canonical `LogicalMessage + ContentBlock[]`, never renderer-only shortcuts;
- presentation is bounded and rebuildable from canonical history;
- semantic reader/Latest/anchor state is separate from DOM/virtualizer measurements;
- tool/result/artifact correlation uses stable producer IDs;
- product-only controls enter the Vue adapter through narrow slots rather than hard-coded fake actions;
- Session diagnostics remains Demo-owned observability rather than Engine/product state;
- `engine.css` owns shell/viewport/composer geometry, `renderers.css` owns content visuals, and both are host-scoped;
- Demo alone may style the host page globally.

## Browser coverage

The local and deployed suites exercise the same product behavior:

- 1,000,000+ addressable messages with bounded hot state and DOM;
- a live heterogeneous Agent turn where reasoning and rich Markdown stream while tool call/result, diff, code and media artifacts join the same canonical message;
- realistic preset task tails for code/transport work, approval/question blockers, multimodal handoff and failure recovery;
- image/file/audio attachments, tool calls/results, image generation, TTS/ASR, code, diff, HTML and broad Markdown forms;
- stable `callId`/artifact provenance;
- queue, approval/question blockers, failure/resume and background execution;
- far jump, prepend, exact Latest/follow behavior and session eviction/restore;
- desktop/mobile reflow and variable-height composer;
- renderer containment, sanitized HTML and no page-level horizontal overflow;
- hostile host CSS without breaking Engine geometry;
- a scenario-focused public workspace with one-click high-value Session diagnostics and no fake search/model/attachment controls.

## Deterministic bounds

```text
logical history             >= 1,000,000
hot runtimes                <= 3
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

FPS, heap and long-task counters remain diagnostics because shared CI hardware is noisy. Bounded work/DOM and semantic correctness are the release contract.

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
