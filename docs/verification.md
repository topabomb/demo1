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
| Tool correlation | call and result records share one stable producer-owned `callId` |
| Token/cache accounting | disjoint uncached input/cache-read/cache-write buckets and cache-hit formula |
| Workspace store | ≥4 working SessionKernels while hot `ConversationSessionRuntime` count stays ≤3 |
| Runtime eviction | a working viewport can be evicted without destroying execution |
| Keyed projection | node patch does not invalidate order/sibling node subscribers |
| Projection cache | bounded cache, stable cache-hit RenderUnit containers and append-only Markdown tail projection |
| Segment manager | bounded far jump, reader-ending cold restore, 512-message neighboring shifts |
| Semantic viewport | measurement probes rejected as anchors; exact messages-after calculation; explicit jumps commit only after stable measurement |
| Physical tail | bottom detection/tail pinning follows the actual scroll container across composer/product reflow |
| Fenwick/page index | aggregate prefix/update/navigation behavior remains deterministic |
| Synthetic source | deterministic heterogeneous renderers and bounded large-content projection |

## Chromium product / stress matrix

The browser suite must exercise all of these on local production and the public Pages build:

- 1,000,000 logical messages with bounded hot projection and `<180` mounted rows;
- 60 Hz streaming with bounded presentation chunks;
- user upward-scroll escape from tail follow;
- far semantic jump and reverse 512-message prepend;
- prepend/history anchor drift `<4px`;
- responsive desktop/tablet/mobile reflow preserving a committed semantic anchor;
- many asynchronous SessionKernels outliving the three-runtime hot LRU;
- historical conversation send → stop → send again → eviction → semantic restore;
- failed last Turn → resumable new working Turn;
- queued follow-up persistence;
- approval and question blocker persistence;
- exact Recent indicators for Working / Completed / Blocked / Failed / Interrupted;
- durable input/output/cache/context statistics updating during execution;
- New Session and session search;
- exact `Latest` / messages-after semantics;
- variable-height composer with no viewport overlay;
- composer resize preserving history anchor and physical tail pinning;
- thinking/tool/code/diff/image/HTML dynamic renderer behavior;
- adjacent mounted rows never geometrically overlap;
- virtualizer-owned wrapper has zero vertical margin/padding;
- runtime change of sidebar width, content width, row gap and composer max height preserves semantic/geometry invariants;
- Architecture page exposes the same portable ownership boundaries implemented by the code.

## Non-negotiable thresholds

```text
logical history             >= 1,000,000
hot runtimes                <= 3
working kernels scenario    >= 4
hot logical window          ~2,048 messages
neighbor shift              512 messages
mounted DOM                 < 180 rows
semantic anchor drift       < 4 px
adjacent row overlap        <= 1 px numerical/layout tolerance
virtual wrapper block gap   exactly 0 px margin/padding
```

Performance counters (FPS, long tasks, heap) remain diagnostics rather than hard cross-run thresholds because shared CI hardware is noisy. The architecture gate is bounded work/DOM and deterministic behavior, not a misleading absolute FPS number.

## Reproducibility

`pnpm-lock.yaml` is part of the candidate source and CI uses `pnpm install --frozen-lockfile`. Pages base-path construction is repository-derived so the same source can be used as a GitHub template/fork without editing `vite.config.ts`.

## Final evidence

Record the final exact `main` SHA, CI run, Pages deployment and public Chromium result here only after both stages are green. Earlier feature-branch deployments are development evidence, not final release evidence.
