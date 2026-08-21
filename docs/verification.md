# Verification

Status: **candidate awaiting final main + public Pages validation**.

This file is intentionally separate from the architecture. The architecture defines reusable invariants; this document records how the `demo1` reference implementation proves them.

## Gates

Every candidate is validated in one ordered pipeline:

1. **Pull-request / main validation** — unit tests, strict Vue/TypeScript typecheck, production Vite build and Chromium E2E against the local production server.
2. **GitHub Pages (main only)** — after the validation job succeeds, build the Pages artifact from the same SHA, deploy it, then run the full Chromium suite against the public URL.

Feature branches cannot replace the public demo. A Pages deployment is not considered accepted merely because upload/deploy succeeded; the deployed-site browser gate must also pass.

## Unit / architecture matrix

| Area | Required proof |
|---|---|
| Session semantics | live execution is separate from last Turn outcome; error history is resumable |
| Canonical identity | Turn is required; Step is a stable optional producer coordinate; demo-only seed/intensity are not required domain fields |
| Renderer identity | RenderUnits expose message/Turn/Step/Block location directly; renderers need no Session/history scan |
| Ordered mutation feed | every semantic content mutation reaches hot projection in producer order while summary/UI refresh remains independently coalesced |
| Tool correlation | call and result records share one stable producer-owned `callId`; artifacts reference the producing call through provenance rather than adjacency |
| Tool/artifact boundary | execution metadata stays in Tool blocks; uploads/generated images/audio are reusable artifact Blocks rather than ToolCard-specific UI |
| Live reasoning | reasoning append patches one stable Thinking node and preserves Markdown/sibling RenderUnit identity |
| Live Markdown | append re-chunks only the target Markdown mutable tail even when reasoning is a sibling in the same Message |
| Media projection | attachment groups and audio surfaces project to bounded renderer-ready units with intrinsic layout metadata |
| Token/cache accounting | reasoning/output/cache buckets update from their actual stream phase and cache-hit formula remains disjoint |
| Workspace store | ≥4 working SessionKernels while hot `ConversationSessionRuntime` count stays ≤3 |
| Runtime eviction | a working viewport can be evicted without destroying execution |
| Keyed projection | node patch does not invalidate order/sibling node subscribers |
| Projection cache | bounded cache, stable cache-hit RenderUnit containers and Block-specific incremental projection |
| Segment manager | bounded far jump, reader-ending cold restore, 512-message neighboring shifts |
| Semantic viewport | measurement probes rejected as anchors; exact messages-after calculation; explicit jumps commit only after stable measurement |
| Physical tail | bottom detection/tail pinning follows the actual scroll container across composer/product reflow |
| Fenwick/page index | aggregate prefix/update/navigation behavior remains deterministic |
| Synthetic source | deterministic heterogeneous renderers and bounded large-content projection |

## Chromium product / stress matrix

The browser suite must exercise all of these on local production and the public Pages build:

- 1,000,000 logical messages with bounded hot projection and `<180` mounted rows;
- 60 Hz live output with bounded incremental presentation work;
- live reasoning stream while collapsed and expanded, including large height differences and repeated measurement;
- reasoning → Markdown phase transition in the same stable assistant Message/Turn/Step;
- single image upload and multi-file upload (images + document + audio) through canonical attachment Blocks;
- image-generation call/result with stable `callId`, prompt/model/progress and four generated image artifacts linked by provenance;
- TTS call/result plus reusable audio/waveform/spoken-text artifact;
- ASR input audio, call/result and transcript rendering;
- repeated heterogeneous scenario packs with bounded mounted DOM/projection cache;
- user upward-scroll escape from tail follow;
- far semantic jump and reverse 512-message prepend;
- prepend/history anchor drift `<4px`;
- responsive desktop/tablet/mobile reflow preserving a committed semantic anchor;
- media grids, audio/transcripts, tables and code do not create body-level horizontal overflow on phone;
- many asynchronous SessionKernels outliving the three-runtime hot LRU;
- historical conversation send → stop → send again → eviction → semantic restore;
- failed last Turn → resumable new working Turn;
- queued follow-up persistence;
- approval and question blocker persistence;
- exact Recent indicators for Working / Completed / Blocked / Failed / Interrupted;
- durable input/output/reasoning/cache/context statistics updating during execution;
- New Session and session search;
- exact `Latest` / messages-after semantics;
- variable-height composer with no viewport overlay;
- composer resize preserving history anchor and physical tail pinning;
- thinking/tool/code/diff/image/attachment/audio/HTML dynamic renderer behavior;
- adjacent mounted rows never geometrically overlap after disclosure/media/responsive changes;
- virtualizer-owned wrapper has zero vertical margin/padding;
- runtime change of sidebar width, content width, row gap and composer max height preserves semantic/geometry invariants;
- Architecture page exposes the same portable ownership boundaries implemented by the code.

`e2e/agent-scenarios.spec.ts` is the scenario-specific gate; existing suites continue to own million-history, session lifecycle, Markdown compatibility and viewport stress.

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
adjacent row overlap        <= 1 px numerical/layout tolerance
body horizontal overflow    <= 1 px
virtual wrapper block gap   exactly 0 px margin/padding
```

Performance counters (FPS, long tasks, heap) remain diagnostics rather than hard cross-run thresholds because shared CI hardware is noisy. The architecture gate is bounded work/DOM and deterministic behavior, not a misleading absolute FPS number.

## Reproducibility

`pnpm-lock.yaml` is part of the candidate source and CI uses `pnpm install --frozen-lockfile`. Pages base-path construction is repository-derived so the same source can be used as a GitHub template/fork without editing `vite.config.ts`.

## Release evidence

The authoritative release evidence is the GitHub Actions metadata for the exact `main` commit: validation job, Pages deployment and deployed-site Chromium result must all be green. This document remains the stable verification contract rather than embedding a self-referential “final SHA” that would change when the evidence text itself changes.
