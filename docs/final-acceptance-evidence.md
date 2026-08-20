# Final Acceptance Evidence — Million-Message Agent Conversation Architecture

Status: **ACCEPTED** on branch `feat/million-message-lab`.

Final validated commit: `f82b65c1bba0673099024a6d4a88b42f68123654`.

This document is the final executable evidence for the architecture described in `agent-conversation-architecture-lab.md`. The reference implementation is considered complete only because the same acceptance suite is green both against the production candidate and against the actually deployed GitHub Pages site.

## 1. Final validation chain

### Local production-candidate gate

GitHub Actions CI run: `32426479681`.

Result: **success**.

Validated in order:

- unit architecture tests;
- TypeScript typecheck;
- production Vite build;
- full Chromium UX/stress suite against the local production candidate.

The local Chromium gate includes the architecture page, million-message bounded rendering, 60 Hz streaming, semantic anchor preservation, exact Latest semantics, variable composer behavior, multi-session/LRU restoration, realistic rich renderers, and the row non-overlap invariant.

### Deployed Pages gate

GitHub Pages workflow run: `32426477038`.

The workflow checked out exactly:

`f82b65c1bba0673099024a6d4a88b42f68123654`

It then:

1. ran the architecture/unit tests — **17 passed**;
2. built the production Pages bundle;
3. uploaded the Pages artifact;
4. deployed that artifact successfully;
5. set `PLAYWRIGHT_BASE_URL=https://topabomb.github.io/demo1/`;
6. ran the same Chromium suite against the deployed site — **8 passed (39.9 s)**.

Public site: `https://topabomb.github.io/demo1/`  
Architecture view: `https://topabomb.github.io/demo1/#architecture`

The workflow publishes a durable commit status:

`pages-public-e2e = success`

Its target links directly to the validating workflow run, so future regressions can be audited without relying on a manual Pages check.

## 2. Card-overlap failure and root cause

A user-visible failure showed adjacent virtualized cards physically stacking on top of each other. The new browser geometry gate measured a maximum overlap of:

`14.015625 px`

The value exposed the root cause: the Virtua-owned item wrapper had `7px` vertical padding on both top and bottom. That decoration was outside the size accounting expected by the virtualizer, so the next item was positioned roughly `14px` before the previous item had visually ended. A continuation style also used a negative outer margin, which violated the same ownership rule.

The final invariant is:

> **A virtualizer-owned item wrapper must be geometry-pure. Product spacing and decoration belong inside the measured child content, never on the virtualizer wrapper.**

The fix therefore:

- removed vertical padding/margins from `.virtua-row`;
- moved product spacing into `ConversationNodeSeat` / measured content;
- removed cross-row negative continuation margins;
- added a Chromium invariant that checks every mounted adjacent pair:

```text
next.top >= previous.bottom - 1px
```

The invariant is exercised after thinking/tool expansion, asynchronous Shiki measurement, composer resize, session remount and heterogeneous renderer changes. It is green in both local and deployed-site Chromium.

## 3. Final acceptance matrix

| # | Invariant | Final result |
| --- | --- | --- |
| 1 | 1,000,000 logical messages remain addressable while mounted DOM stays `<180` rows | PASS |
| 2 | Semantic hot window and hot-session runtime count remain bounded | PASS |
| 3 | 60 Hz model ingress grows/rolls the live answer through bounded RenderUnits | PASS |
| 4 | Upward reader input escapes tail-follow while model output continues | PASS |
| 5 | Far jump around message 500,000 does not traverse intervening history | PASS |
| 6 | Reverse prepend of 512 messages preserves semantic anchor within `<4px` | PASS |
| 7 | Agent execution survives history browsing and Recent switching | PASS |
| 8 | Latest count is exact, session-scoped and disappears at the true tail | PASS |
| 9 | Variable composer owns layout space; history anchor remains `<4px`; tail re-pins | PASS |
| 10 | Thinking/tool/code/diff/image/HTML renderers handle real dynamic heights | PASS |
| 11 | A → B → A restores semantic viewport, draft and disclosure state | PASS |
| 12 | More than three visited sessions keep heavyweight viewport state bounded by LRU | PASS |
| 13 | Mounted heterogeneous rows never overlap after resize/remount/async measurement | PASS |
| 14 | Architecture page and interactive reference lab are both reachable on Pages | PASS |
| 15 | Unit/type/build/local Chromium/deploy/public Chromium are all green | PASS |

## 4. Architecture result

The experiment supports the intended reusable architecture claim:

```text
Backend Adapter
      ↓
Conversation Engine / Execution State
      ↓
Presentation Projector
      ↓
Projection Store: stable order[] + keyed nodes
      ↓
Viewport Controller: bounded physical virtualization
      ↓
Framework renderer
```

The million-message property does not come from making one framework list extremely large. It comes from keeping total logical history, hot semantic projection, asynchronous execution and physical viewport as separate lifecycles with separate ownership.

The reusable rules demonstrated by the reference implementation are:

- backend/provider schemas terminate at an adapter boundary;
- one logical message may project into multiple bounded RenderUnits;
- streaming patches one stable keyed node instead of rebuilding the list;
- history size does not determine DOM size or framework reactive-object count;
- semantic anchors, not raw global `scrollTop`, survive segment changes and session rehydration;
- execution may continue without a mounted viewport;
- virtualizer wrappers are geometry-pure;
- rich renderer details remain downstream of the projection/virtualization contract;
- the deployed artifact is part of acceptance, not merely the local build.

## 5. Acceptance conclusion

The architecture proof has reached its defined exit condition. There are no remaining known blockers in the experiment's acceptance scope.

Future work should treat this repository as a reference architecture and benchmark harness. Product integration into CodeNomad should preserve the lifecycle boundaries and invariants while replacing the synthetic backend and adapting the renderer/product shell as needed.
