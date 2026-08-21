# Framework / Template Review

This review treats `demo1` as a reusable Engine reference implementation, not as a stress-demo codebase.

## Keep as the Engine contract

1. **Canonical conversation model** — provider/runtime events normalize into stable `LogicalMessage + ContentBlock[]` records before presentation concerns appear.
2. **Provider-neutral SessionKernel** — execution lifecycle, blockers, normalized accounting and canonical history remain correct with zero mounted UI; provider output shape/content is not invented by the Kernel.
3. **Ordered semantic events + independently coalesced UI publication** — business order cannot be lost because a reactive summary batches updates.
4. **Bounded hot presentation runtime** — only a small logical segment is projected; cold history stays cold.
5. **Keyed projection** — stable RenderUnit IDs let one streaming Block update without invalidating unrelated rows.
6. **Semantic viewport policy** — reader, Latest, follow and committed anchors are application state; DOM measurements are adapter input only.
7. **Registry-driven rendering** — normal new content types extend model/projection/renderer, not session/history logic.
8. **Narrow Vue product seam** — the Engine exposes real conversation behavior plus a few slots rather than shipping pretend product/provider controls.
9. **Host-scoped CSS with explicit ownership** — Engine shell/geometry and renderer visuals are separate but remain under the same host root.

These boundaries preserve the intended cost: **changed + hot + visible**, independent of total history size.

## Final physical boundary

There are only two source ownership roots:

- `src/engine/**` — reusable model/session/projection/viewport/runtime/Vue adapter implementation;
- `src/demo/**` — synthetic history, scenarios, provider/playback policy, seeded workspace/display metadata, diagnostics and the executable product shell.

Within Engine:

- `core/` — small framework-neutral algorithm primitives;
- `model/` — canonical content plus pure canonical block mutations;
- `conversation/` — execution/history contracts, SessionKernel and session semantics;
- `presentation/` — bounded projection/cache/keyed RenderUnits;
- `viewport/` — framework-neutral semantic viewport contracts/state;
- `runtime/` — bounded hot-session composition, with no DOM telemetry or diagnostics form state;
- `vue/` — reference Vue/Virtua adapter, one physical navigation controller, renderer registry, shell CSS and renderer CSS;
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

### Mixed responsibilities fixed in this review

1. **SessionKernel provider policy removed.** It no longer creates a mandatory user/reasoning/answer shape, estimates provider/cache tokens, or injects `Completed` / `Stopped by user` content. Those decisions now live in the synthetic Demo execution adapter; real adapters can publish different canonical shapes and real normalized accounting.
2. **Physical/debug state removed from Engine runtime.** Mounted DOM row count is emitted by the Vue adapter to Demo diagnostics; jump-input state is owned by the diagnostics panel. Neither belongs in `SessionUiSnapshot` or `ConversationSessionRuntime`.
3. **Product list metadata removed from Engine contracts.** Relative `age` is Demo/sidebar display data, not durable conversation semantics.
4. **Fake product controls removed from Engine Vue.** The reusable viewport no longer contains a pretend model selector, reasoning mode selector, search button or attachment button. Product context/actions/overlays/tools use four narrow slots.
5. **CSS responsibility clarified.** `engine.css` now owns tokens + shell/viewport/composer geometry; `renderers.css` owns content visuals/containment. Demo navigation/diagnostics remain in `demo.css`. This is a two-file Engine split, not a per-component stylesheet explosion.
6. **Existing navigation algorithms preserved.** The tested `ViewportNavigationController`, requested-vs-committed reader distinction, latest-wins navigation, anchor restore and physical tail pin were deliberately not rewritten for visual cleanup.

## Engine vs Demo semantics

The reusable execution contract contains only real product semantics:

```text
running
submit
abort
resolveInteraction
dispose (optional)
```

The Engine Kernel exposes normalized fact/lifecycle operations:

```text
appendCanonicalMessages
replaceCanonicalMessage
startExecution
finishExecution
setAccounting
enqueue/dequeue/clearQueue
resolveInteraction
```

Synthetic playback controls and provider policy — turn/block construction, generated reasoning/answer deltas, token/cache estimates, completion/abort copy, `rate`, start/resume, pause, ingress ticks and publish ticks — live in `demo/stream-controller.ts`.

`SessionUiSnapshot.eventRevision` remains a generic semantic-change revision. A real provider does not need to emulate benchmark telemetry or the Demo's content shape.

## Vue / product seam

`ConversationViewport.vue` owns only reusable behavior:

- rendered canonical content;
- semantic status and stop;
- pending approval/question resolution;
- composer/send/queue;
- exact Latest/follow behavior;
- physical Virtua integration.

The product can supply optional UI through:

```text
header-context
header-actions
viewport-overlay
composer-tools
```

The Demo uses those slots for the synthetic playback label, architecture diagnostics toggle and debug viewport strip. All controls shown by the Engine itself perform real actions.

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
- DOM row counts remain ephemeral physical telemetry and are never copied into Engine session/runtime truth.

FPS/heap remain diagnostics. Deterministic hot-work, DOM and semantic correctness are the release contract.

## CSS contract

The CSS structure is intentionally small:

- `src/engine/vue/engine.css` — Engine custom properties, host reset, header/slots, virtualizer geometry, Latest and composer/blocker layout;
- `src/engine/vue/renderers.css` — message/Markdown/reasoning/tool/code/media/HTML renderer visuals and containment;
- `src/demo/styles/demo.css` — lab navigation, product slot chrome, diagnostics and the only style surface that may target `html`, `body` or `#app`;
- `src/demo/styles/architecture.css` — architecture page.

Both Engine stylesheets are rooted at `[data-conversation-engine].conversation-shell`. Mobile sidebar clearance is a Demo override of `--conversation-header-leading-space`; Engine CSS does not know that a sidebar toggle exists.

A browser gate injects hostile host-global element rules after Engine styles and requires valid geometry and overflow behavior. A separate clean-shell gate ensures fake Search/Attach/model/mode affordances do not return and validates desktop/mobile shell geometry.

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

## What remains intentionally product-specific

These are extension points, not unfinished migration work:

1. **Transport/persistence adapters** — add when a real backend exists; do not invent persistence in the demo.
2. **Alternative physical-list/UI adapter** — add when there is a second real frontend/virtualizer implementation.
3. **Typed renderer payload packages** — useful only if independently versioned renderer packages appear.
4. **Cross-event ConversationNode assembler** — add with the first real multi-record business lifecycle and enforce replay/prepend/append equivalence.
5. **Shadow DOM hard isolation** — optional for hosts that need stronger CSS containment than the tested scoped-root contract.

## CI and release policy

There is one acceptance chain:

- `main`: frozen install → unit/architecture tests → strict type/build → full local Chromium;
- only validated `main` deploys GitHub Pages;
- the deployed page then runs the same full Chromium suite.

## Decision

The reviewed structure is intentionally **two ownership trees with cohesive internal seams**. The Engine is now provider-neutral at the session boundary, free of Demo physical/debug state, and exposes a small real product seam instead of fake controls. CSS is split only where responsibility actually differs. The template is acceptable only when the exact final `main` SHA passes both local and deployed-browser gates.
