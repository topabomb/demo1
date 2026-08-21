# Framework / Template Review

This review treats `demo1` as a reusable reference implementation rather than a stress-demo codebase.

## Keep as the framework contract

1. **Canonical conversation model** — provider/runtime events normalize into stable `LogicalMessage + ContentBlock[]` records before presentation concerns appear.
2. **SessionKernel independent of viewport lifetime** — execution, blockers, usage and canonical history stay correct with zero mounted UI.
3. **Ordered semantic events + independently coalesced UI publication** — business order cannot be lost because a reactive summary batches updates.
4. **Bounded hot presentation runtime** — only a small logical segment is projected; cold history stays cold.
5. **Keyed projection** — stable RenderUnit IDs let one streaming Block update without invalidating unrelated rows.
6. **Semantic viewport policy** — reader, Latest, follow and committed anchors are application state; DOM measurements are adapter input only.
7. **Registry-driven rendering** — normal new content types extend model/projection/renderer, not session/history logic.
8. **Host-scoped engine CSS** — the reusable conversation surface does not style the host document.

These boundaries preserve the intended cost: **changed + hot + visible**, independent of total history size.

## Final repository boundaries

- `src/engine/index.ts` — framework-neutral public surface.
- `src/model/` — canonical semantic data.
- `src/conversation/` — backend/runtime contracts, kernel and session semantics.
- `src/presentation/` — projection, keyed RenderUnits and bounded presentation state.
- `src/viewport/` — semantic viewport contracts/state.
- `src/runtime/` — composition of kernel + hot presentation + viewport memory.
- `src/core/` — only framework-neutral data-structure/notifier primitives.
- `src/vue/` + `src/components/` — reference Vue/physical-list/rendering adapters.
- `src/demo/` — synthetic history, execution, scenarios, workspace composition and diagnostics.

Legacy compatibility re-export files were removed. Old mixed CSS entrypoints were removed rather than kept as aliases.

## Scenario-driven lessons from DeepSeek Harness

The useful lesson is not “turn everything into a plugin”. Adopt only invariants demanded by real Agent-conversation scenarios:

| Scenario | Contract here | Do not add yet |
|---|---|---|
| model execution has user-turn and model-request boundaries | required `turnId`, optional stable `stepId` | no Agent loop implementation in UI |
| tool call/result are separate records | producer-owned stable `callId` | no correlation by adjacency/latest unfinished |
| future review/job/deliverable spans many events | introduce a keyed assembler for that feature with deterministic replay laws | no generic cross-event node engine before a real need |
| many UI consumers observe one Session | business truth stays outside Vue; presentation is derived | no renderer scans Session/history |
| responsive/composer changes geometry | preserve semantic anchor/tail intent through physical reflow | no scrollbar remainder as Latest truth |
| a capability has multiple real implementations | introduce a narrow Definition/Provider/Consumer-style port | no Cordis/service graph copied wholesale |

## Rendering and memory rules

- Never materialize total history into reactive UI state.
- Hot logical window and projection cache are bounded.
- Cache hits preserve stable immutable RenderUnit collections.
- Streaming Markdown updates only mutable tail + delta.
- Keyed patches publish order only when membership/order changes.
- RenderUnits expose message/Turn/Step/Block location directly.
- Renderer caches are bounded and local.
- Bottom detection uses the real scroll container when virtualizer cached geometry may lag reflow.
- Explicit jumps commit only after stable measurement frames.
- Responsive/composer changes preserve semantic anchors while physical layout converges.

FPS/heap remain diagnostics. Deterministic hot-work, DOM and semantic correctness are the release contract.

## CSS contract

`src/styles/engine.css` is scoped from `[data-conversation-engine].conversation-shell`; it owns conversation layout, virtualizer geometry, composer and renderer containment. `src/styles/demo.css` owns the demo shell and is the only style surface that may target `html`, `body` or `#app`.

A browser gate injects hostile host-global element rules after engine styles and requires the conversation surface to retain valid geometry and overflow behavior. This gives a practical default isolation boundary without imposing Shadow DOM on every integration.

## What remains intentionally product-specific

These are extension points, not unfinished migration work:

1. **Transport/persistence adapters** — add when a real backend exists; do not invent a persistence framework in the demo.
2. **Alternative physical-list/UI adapter** — split further only when a second virtualizer or frontend shell exists.
3. **Typed renderer payload packages** — useful only if independently versioned renderer packages need compile-time payload contracts.
4. **Cross-event ConversationNode assembler** — add with the first real multi-record business lifecycle and enforce replay/prepend/append equivalence.
5. **Shadow DOM hard isolation** — optional for hosts that need stronger CSS containment than the tested scoped-root contract.

## CI and release policy

There is one workflow and one acceptance chain:

- PR: frozen install → unit/architecture tests → strict type/build → full local Chromium;
- `main`: the same validation first;
- only validated `main` deploys GitHub Pages;
- the deployed page then runs the same full Chromium suite;
- feature branches never publish Pages.

The workflow deliberately stays monolithic enough to make release ordering obvious and small enough to maintain.

## Decision

The current repository is suitable as a reference template. The important protection is not more abstraction; it is preserving dependency direction, stable business identity, bounded presentation work, semantic viewport state and explicit host/rendering boundaries as new product features are added.
