# Framework / Template Review

This review treats `demo1` as a reusable Engine reference implementation, not as a stress-demo codebase.

## Keep as the Engine contract

1. **Canonical conversation model** — provider/runtime events normalize into stable `LogicalMessage + ContentBlock[]` records before presentation concerns appear.
2. **SessionKernel independent of viewport lifetime** — execution, blockers, usage and canonical history stay correct with zero mounted UI.
3. **Ordered semantic events + independently coalesced UI publication** — business order cannot be lost because a reactive summary batches updates.
4. **Bounded hot presentation runtime** — only a small logical segment is projected; cold history stays cold.
5. **Keyed projection** — stable RenderUnit IDs let one streaming Block update without invalidating unrelated rows.
6. **Semantic viewport policy** — reader, Latest, follow and committed anchors are application state; DOM measurements are adapter input only.
7. **Registry-driven rendering** — normal new content types extend model/projection/renderer, not session/history logic.
8. **Host-scoped Engine CSS** — the reusable conversation surface does not style the host document.

These boundaries preserve the intended cost: **changed + hot + visible**, independent of total history size.

## Final physical boundary

There are only two source ownership roots:

- `src/engine/**` — reusable model/session/projection/viewport/runtime/Vue adapter implementation;
- `src/demo/**` — synthetic history, scenarios, playback, seeded workspace, diagnostics and the executable product shell.

Within Engine:

- `core/` — small framework-neutral algorithm primitives;
- `model/` — canonical content plus pure canonical block mutations;
- `conversation/` — execution/history contracts, SessionKernel and session semantics;
- `presentation/` — bounded projection/cache/keyed RenderUnits;
- `viewport/` — framework-neutral semantic viewport contracts/state;
- `runtime/` — bounded hot-session composition;
- `vue/` — reference Vue/Virtua adapter, one physical navigation controller and renderer registry;
- `workers/` — replaceable physical worker implementation.

Legacy parallel roots and compatibility re-exports were removed. `tests/architecture-boundaries.test.ts` makes the physical split executable.

## Cohesion / fragmentation review

The review did **not** use line count as an automatic refactor rule.

### Intentionally small and separate

These files are cohesive and should remain separate:

- Fenwick tree;
- page-height index;
- segment manager;
- notifier primitive;
- canonical model vs Session lifecycle;
- projector registry vs projection cache/store;
- one renderer module per distinct semantic ContentBlock behavior.

Combining them would reduce navigability and turn stable algorithm/extension seams into mixed “utility” files.

### Proven mixed responsibilities that were split

1. **`DemoWorkspaceRuntime`** no longer contains large static seeded-session definitions; those live in `demo/workspace-fixtures.ts`.
2. **`ConversationSessionKernel`** no longer owns low-level block cloning/append/settle helpers; canonical mutation logic lives in `engine/model/message-mutations.ts`.
3. **`AgentWorkspace.vue`** no longer owns the full benchmark/diagnostics control surface; `DemoDiagnosticsPanel.vue` owns demo-only fixtures, rate/telemetry/performance diagnostics.
4. **`ConversationViewport.vue`** no longer owns all physical navigation mechanics; `ViewportNavigationController` owns mounted row sampling, user-scroll intent, committed anchors, latest-wins navigation, stable jump convergence and physical tail pinning.

The viewport extraction is intentionally **one controller**, not a collection of tiny composables. The responsibilities share one navigation transaction and one set of mounted physical measurements, so splitting them further would make ordering bugs harder to reason about.

## Engine vs Demo semantics

The reusable execution contract contains only real product semantics:

```text
running
submit
abort
resolveInteraction
dispose (optional)
```

Synthetic playback controls — `rate`, `start/resume`, `pause`, ingress ticks and publish ticks — live only in `demo/stream-controller.ts`.

`SessionUiSnapshot.eventRevision` is a generic semantic-change revision. It replaced demo-specific render tick fields so a real backend does not need to emulate benchmark telemetry.

## Scenario-driven lessons from DeepSeek Harness

The useful lesson is not “turn everything into a plugin”. Adopt only invariants demanded by real Agent-conversation scenarios:

| Scenario | Contract here | Do not add yet |
|---|---|---|
| model execution has user-turn and model-request boundaries | required `turnId`, optional stable `stepId` | no Agent loop implementation in UI |
| tool call/result are separate records | producer-owned stable `callId` | no correlation by adjacency/latest unfinished |
| future review/job/deliverable spans many events | keyed assembler only for that feature with deterministic replay laws | no generic cross-event node engine before a real need |
| many UI consumers observe one Session | business truth stays outside Vue; presentation is derived | no renderer scans Session/history |
| responsive/composer changes geometry | preserve semantic anchor/tail intent through physical reflow | no scrollbar remainder as Latest truth |
| a capability has multiple real implementations | introduce a narrow Definition/Provider/Consumer-style port | no Cordis/service graph copied wholesale |

## Rendering and memory rules

- Never materialize total history into reactive UI state.
- Hot logical window and projection cache are bounded.
- Cache hits preserve stable immutable RenderUnit collections.
- Streaming Markdown updates only mutable tail + delta.
- Keyed patches publish order only when membership/order changes.
- RenderUnits expose Message/Turn/Step/Block location directly.
- Renderer caches are bounded and local.
- Bottom detection uses the real scroll container when virtualizer cached geometry may lag reflow.
- Explicit jumps commit only after stable measurement frames.
- Responsive/composer changes preserve semantic anchors while physical layout converges.

FPS/heap remain diagnostics. Deterministic hot-work, DOM and semantic correctness are the release contract.

## CSS contract

- `src/engine/vue/engine.css` is scoped from `[data-conversation-engine].conversation-shell` and owns Engine layout, virtualizer geometry, composer and renderer containment.
- `src/demo/styles/demo.css` owns the lab shell/diagnostics and is the only style surface that may target `html`, `body` or `#app`.
- `src/demo/styles/architecture.css` owns the architecture page.

A browser gate injects hostile host-global element rules after Engine styles and requires valid geometry and overflow behavior.

## What remains intentionally product-specific

These are extension points, not unfinished migration work:

1. **Transport/persistence adapters** — add when a real backend exists; do not invent persistence in the demo.
2. **Alternative physical-list/UI adapter** — add when there is a second real frontend/virtualizer implementation.
3. **Typed renderer payload packages** — useful only if independently versioned renderer packages appear.
4. **Cross-event ConversationNode assembler** — add with the first real multi-record business lifecycle and enforce replay/prepend/append equivalence.
5. **Shadow DOM hard isolation** — optional for hosts that need stronger CSS containment than the tested scoped-root contract.

## CI and release policy

There is one acceptance chain:

- PR: frozen install → unit/architecture tests → strict type/build → full local Chromium;
- `main`: the same validation first;
- only validated `main` deploys GitHub Pages;
- the deployed page then runs the same full Chromium suite;
- feature branches never publish Pages.

## Decision

The reviewed structure is intentionally **two ownership trees with cohesive internal seams**, not a monolith and not a plugin micro-framework. The template is considered acceptable only when the exact merged `main` SHA passes both local and deployed-browser gates.
