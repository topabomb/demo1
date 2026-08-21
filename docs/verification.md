# Verification

This document defines the stable acceptance contract for the reference template. Authoritative pass/fail evidence is GitHub Actions metadata for the exact `main` SHA; this file intentionally does not embed a self-referential release SHA.

## Acceptance chain

One workflow owns the release path:

1. **Pull request / main validation** — frozen install, unit + architecture tests, strict Vue/TypeScript typecheck, production build and full Chromium E2E against the local production server.
2. **GitHub Pages (`main` only)** — after validation succeeds, build and deploy the same SHA, then run the full Chromium suite against the public deployment URL.

A successful Pages upload/deploy is not accepted until the deployed-site Chromium gate also passes.

The workflow's concurrency key includes the event type as well as the PR number/ref. This prevents merged-PR cleanup from racing with or cancelling the `push main` release run.

## Unit / architecture matrix

| Area | Required proof |
|---|---|
| Physical ownership | source implementation has exactly `src/engine/**` reusable ownership and `src/demo/**` executable-proof ownership; legacy parallel source roots do not return |
| Dependency direction | every Engine relative import remains inside Engine; Demo may consume Engine; Engine never consumes Demo |
| Public API | `src/engine/index.ts` exposes framework-neutral contracts and never imports Vue/Demo implementation |
| Provider-policy boundary | SessionKernel stores canonical/lifecycle/accounting facts but never creates assumed reasoning/answer blocks, synthetic completion/abort copy, or token/cache estimates |
| Playback boundary | synthetic rate/pause/resume/content generation/token estimates/ingress/publish telemetry exist only in Demo and do not leak into Engine ports/state |
| Product-metadata boundary | display-only relative session age and diagnostics form state remain Demo-owned |
| Physical-state boundary | mounted DOM row telemetry is emitted by the Vue adapter and never persisted in `ConversationSessionRuntime` / `SessionUiSnapshot` |
| Session semantics | live execution is separate from last Turn outcome; error history remains resumable |
| Canonical identity | Message/Turn/Step/Block coordinates are stable; Step may remain absent when the producer does not expose one |
| Canonical mutation ownership | block clone/append/replace/settle helpers live in the model mutation layer; they do not estimate provider billing semantics |
| Renderer identity | RenderUnits expose Message/Turn/Step/Block location directly; renderers need no Session/history scan |
| Ordered mutation feed | every semantic mutation reaches hot projection in producer order while summary/UI refresh remains independently coalesced |
| Tool correlation | call/result records share one producer-owned `callId`; artifacts reference the producing call through provenance |
| Tool/artifact boundary | execution metadata stays in Tool Blocks; uploads/generated images/audio are reusable artifact Blocks |
| Live reasoning | reasoning append patches one stable Thinking node and preserves sibling identity |
| Live Markdown | append re-chunks only the mutable Markdown tail |
| Workspace lifetime | >=4 working SessionKernels can coexist while hot `ConversationSessionRuntime` count stays <=3 |
| Runtime eviction | a working viewport may be evicted without destroying execution/domain state |
| Keyed projection | node patch does not invalidate unrelated order/sibling subscribers |
| Projection cache | bounded cache, stable cache-hit containers and block-specific incremental projection |
| Segment manager | bounded far jump, reader-ending cold restore and 512-message neighbor shifts |
| Semantic viewport | exact messages-after; measurement probes cannot become semantic truth; jumps commit after stable measurement |
| Physical navigation controller | one controller owns mounted sampling, user-scroll intent, committed anchor restoration, latest-wins navigation and physical tail pinning |
| Vue product seam | Engine viewport has only real conversation controls; product context/actions/overlays/tools enter through narrow slots; no fake model/search/attachment affordances |
| Physical tail | bottom detection/tail pin follows the actual scroll container across reflow |
| Core primitives | Fenwick/page index/segment management remain deterministic and framework-neutral |
| CSS ownership | `engine.css` owns shell/viewport/composer; `renderers.css` owns content visuals; both remain host-scoped; Demo alone owns global/product CSS |
| Release concurrency | `push main` validation/deploy and merged-PR cleanup use distinct concurrency groups and cannot cancel each other |

## Chromium product / stress matrix

Local production and deployed Pages must both exercise:

- 1,000,000+ logical messages with bounded hot projection and `<180` mounted rows;
- 60 Hz **Demo playback** driving the same Engine semantic mutation path with bounded incremental presentation work;
- live reasoning collapsed/expanded through large dynamic-height changes;
- reasoning → Markdown transition in the same assistant Message/Turn/Step;
- uploads and reusable image/document/audio artifacts;
- image-generation call/result with stable `callId` and generated-image provenance;
- TTS/ASR execution separated from reusable audio/transcript rendering;
- repeated heterogeneous scenario packs with bounded DOM/projection cache;
- upward-scroll escape from tail follow;
- far semantic jump and reverse 512-message prepend;
- history/prepend anchor drift `<4px`;
- desktop/tablet/mobile reflow preserving committed semantic position;
- media/tables/code without body-level horizontal overflow;
- asynchronous SessionKernels outliving the three-runtime hot LRU;
- historical send → stop → send again → eviction → semantic restore;
- failed Turn → resumable new Turn;
- queue, approval and question blocker persistence;
- exact Working / Completed / Blocked / Failed / Interrupted Recent indicators;
- provider-normalized input/output/reasoning/cache/context statistics;
- New Session and session search;
- exact `Latest` / messages-after semantics;
- variable-height composer with no viewport overlay;
- composer resize preserving history anchor and physical tail pinning;
- thinking/tool/code/diff/image/attachment/audio/HTML dynamic renderer behavior;
- adjacent mounted rows never overlapping after disclosure/media/reflow;
- virtualizer-owned wrapper with zero vertical margin/padding;
- runtime changes to sidebar/content widths, row gap and composer height preserving semantic/geometry invariants;
- architecture page exposing the same ownership boundaries implemented in code;
- **clean Engine shell**: public Demo supplies its synthetic/debug chrome through Engine slots while fake Search/Attach/model controls remain absent;
- **responsive product seam**: mobile host-owned menu spacing, header and composer remain usable without horizontal overflow;
- **host CSS isolation**: later host-global `button/input/textarea/select/img/table` rules cannot break conversation geometry, overflow or row layout.

Streaming/performance diagnostics are **eventually observed outputs**, not a same-render-frame contract. Semantic mutations are applied synchronously in producer order, while Vue/workspace summary publication may be coalesced independently. E2E therefore waits for stream-publish and projection counters to reach their required values separately; it never weakens the quantitative thresholds just to accommodate scheduling jitter.

## Non-negotiable thresholds

```text
logical history             >= 1,000,000
hot runtimes                <= 3
working kernels scenario    >= 4
hot logical window          ~2,048 messages
neighbor shift              512 messages
projection cache            <= 4,096 messages
mounted DOM                 < 180 rows
semantic anchor drift       < 4 px
adjacent row overlap        <= 1 px tolerance
body horizontal overflow    <= 1 px
virtual wrapper block gap   exactly 0 px margin/padding
```

Performance counters such as FPS, long tasks and heap remain diagnostics because shared CI hardware is noisy. The architecture contract is bounded work/DOM plus deterministic semantic behavior.

## Reproducibility

- `pnpm-lock.yaml` is committed.
- CI uses `pnpm install --frozen-lockfile`.
- Node and pnpm major/minor versions are explicit in the workflow.
- Pages base-path construction is repository-derived so forks/templates can publish without source edits.
- only one workflow defines validation + release ordering.
- release/deploy concurrency is event-isolated from merged-branch cleanup, while repeated runs of the same event/ref still cancel stale work.

## Release evidence

For a release to be called complete, verify on the exact `main` SHA:

```text
unit / architecture       Green
strict type + build       Green
local Chromium            Green
Pages deployment          Green
public deployed Chromium  Green
```

If any one is missing, cancelled or stale, the release is not accepted.
