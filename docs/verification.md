# Verification

Status: **pending final-head dual validation**.

This file is intentionally separate from the architecture. The architecture defines reusable invariants; this document records how the `demo1` reference implementation proves them.

## Gates

Every candidate must pass the exact same source tree through two independent browser gates:

1. **Pull-request CI** — unit tests, strict Vue/TypeScript typecheck, production Vite build, Chromium E2E against the local production server.
2. **GitHub Pages** — build and deploy the exact branch SHA, then run the same Chromium suite against `https://topabomb.github.io/demo1/`.

A public Pages success is published back to the commit as `pages-public-e2e=success`.

## Unit / architecture matrix

| Area | Required proof |
|---|---|
| Session semantics | live execution is separate from last Turn outcome; error history is resumable |
| Token/cache accounting | disjoint uncached input/cache-read/cache-write buckets and cache-hit formula |
| Workspace store | ≥4 working SessionKernels while hot `ConversationSessionRuntime` count stays ≤3 |
| Runtime eviction | a working viewport can be evicted without destroying execution |
| Keyed projection | node patch does not invalidate order/sibling node subscribers |
| Segment manager | bounded far jump, reader-ending cold restore, 512-message neighboring shifts |
| Semantic viewport | measurement probes rejected as anchors; exact messages-after calculation |
| Fenwick/page index | aggregate prefix/update/navigation behavior remains deterministic |
| Synthetic source | deterministic heterogeneous renderers and bounded large-content projection |

## Chromium product / stress matrix

The browser suite must exercise all of these on both local production and public Pages:

- 1,000,000 logical messages with bounded hot projection and `<180` mounted rows;
- 60 Hz streaming with bounded presentation chunks;
- user upward-scroll escape from tail follow;
- far semantic jump and reverse 512-message prepend;
- prepend/history anchor drift `<4px`;
- many asynchronous SessionKernels outliving the three-runtime hot LRU;
- historical conversation send → stop → send again → eviction → semantic restore;
- failed last Turn → resumable new working Turn;
- queued follow-up persistence;
- approval blocker persistence;
- question blocker persistence;
- exact Recent indicators for Working / Completed / Blocked / Failed / Interrupted;
- durable input/output/cache/context statistics updating during execution;
- New Session and session search;
- exact `Latest` / messages-after semantics;
- variable-height composer with no viewport overlay;
- composer resize preserving history anchor and tail pinning;
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

## Final evidence

The final exact SHA, CI run, Pages run and public Chromium result will be recorded here only after the canonical docs and implementation are frozen and that final head passes both gates. No earlier checkpoint is considered final evidence.
