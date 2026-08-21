# Framework / Template Review

This review treats `demo1` as a reference implementation to copy from, not merely a stress demo to keep running. The governing question is: **which decisions should survive when Vue, Virtua, the synthetic backend and the product shell are replaced?**

## Keep as the framework contract

1. **Canonical content model** — provider/runtime events normalize into stable `LogicalMessage + ContentBlock[]` records before presentation concerns appear.
2. **Session kernel independent of viewport lifetime** — execution, blockers, usage and canonical history remain correct when no UI runtime is mounted.
3. **Disposable hot presentation runtime** — only a bounded logical window is projected; cold history stays cold.
4. **Keyed projection** — stable RenderUnit IDs let one streaming node update without invalidating list order or sibling subscribers.
5. **Semantic viewport policy** — reader, Latest, follow-tail and committed anchors are semantic state; DOM measurements are adapter input only.
6. **Renderer registry** — new content types extend projection + rendering rather than branching the session kernel.

These boundaries produce the intended hot-path cost: **changed + hot + visible**, independent of total history size.

## Demo-only / compatibility surface

The current repository still contains evolutionary seams that should not become a product API:

- `src/core/types.ts` and `src/presentation/content-model.ts` are compatibility barrels. New code should import canonical and presentation types directly.
- Synthetic `kind/seed/intensity/content` fields on `LogicalMessage` exist for the million-message generator. They are optional compatibility metadata; production adapters should emit canonical `blocks` and stable semantic IDs.
- `legacyBlocksForMessage` and synthetic fixture generation currently live beside projector policy. They should move under a demo/fixtures package before this code is published as a standalone library.
- `ConversationProjectionStore` currently sits in conversation contracts while exposing `RenderUnit`. The final package split should move that port to the presentation boundary so domain/session contracts do not depend on presentation types.
- `ConversationViewport.vue` is intentionally an integration proof, but it currently combines the Virtua adapter, anchor/follow orchestration, composer behavior and diagnostics. A product extraction should keep the pure policy in `viewport/` and split the physical adapter from product controls; do not move DOM state back into the session kernel.

These are **extraction seams**, not reasons to add another abstraction layer now. The demo should first keep one executable vertical slice and prove the boundaries with tests.

## Scenario-driven lessons from DeepSeek Harness

The useful lesson from DeepSeek Harness is not “make everything a plugin”. For this focused client template, adopt only the invariants demanded by concrete Agent-conversation scenarios. See [`deepseek-harness-design-lessons.md`](deepseek-harness-design-lessons.md) for the detailed mapping.

| Scenario | Contract in demo1 | Do not add yet |
|---|---|---|
| model execution has Turn / model-request boundaries | `turnId` plus optional `stepId`; renderer-ready nodes expose both when known | no Agent loop/runtime implementation in the UI |
| separate tool call and result records | one producer-owned stable `callId`; never infer by DOM adjacency or “latest unfinished” | no generic cross-event assembler for ordinary blocks |
| future job/review/deliverable spans many events | introduce a keyed assembler only for that business row; replay/prepend/append must be equivalent | no global plugin/node engine before the first real cross-event feature |
| many visual consumers observe one Session | business truth stays outside Vue; presentation is derived/rebuildable | no renderer walking Session/history state |
| responsive/composer changes physical geometry | freeze semantic anchor or tail intent, let measurements settle, then restore | no scrollbar remainder as `Latest` truth |
| a capability has two real implementations | add a narrow Definition / Provider / Consumer style port | no Cordis/service graph copied into this repository |

The stable-ID rule is especially important: every record that contributes to one business object must carry or independently derive the same ID. “Attach this event to the latest unfinished row” is explicitly not a valid framework strategy.

## Rendering-efficiency rules

The template should preserve these invariants:

- Never materialize total history into Vue/reactive state.
- A hot runtime owns a bounded segment and a bounded projection cache.
- Cache hits return stable immutable RenderUnit collections rather than cloning containers on every read.
- Streaming Markdown uses append-only tail projection and preserves settled RenderUnit identity.
- Keyed node patches do not publish a new list order unless IDs actually enter, leave or move.
- Markdown/highlight caches remain bounded and renderer-local.
- RenderUnits carry stable message/Turn/Step/Block location so renderers do not reverse-scan Session state.
- Tail pinning and bottom detection use physical scroll-container geometry when virtualizer cached viewport measurements may lag a product reflow.
- Explicit jumps commit their semantic anchor only after the virtualizer has held the target through stable measurement frames.
- Responsive reflow may require multiple physical measurement frames; semantic anchors must remain stable while the virtualizer converges.
- FPS/heap are diagnostics. Deterministic bounds on hot work, DOM count and semantic correctness are the CI contract.

If profiling later shows stream publication scanning the whole hot segment, optimize that implementation with a message-index span/index. Do not introduce a global reactive index pre-emptively; the current bounded window keeps this a local optimization.

## Missing pieces before library extraction

These are deliberately deferred until there is a consumer that needs them:

1. Move synthetic generation out of canonical/presentation packages and remove demo metadata from the extracted public message type entirely.
2. Move presentation-store contracts out of the session/domain contract surface.
3. Add typed RenderUnit payloads only if independent renderer packages need compile-time payload contracts; `Record<string, unknown>` is acceptable inside this reference app.
4. Define an explicit persistence/transport adapter package when a real backend exists. The demo must not invent a persistence framework.
5. Split the large Vue viewport into physical-list adapter and product/composer integration when a second UI shell or virtualizer is introduced.
6. Add a cross-event ConversationNode assembler only when a real row spans multiple durable records; its laws are already documented, but unused generic code should not ship.

## CI and release policy

The repository is a template only if its build is reproducible and its public demo corresponds to validated source:

- commit `pnpm-lock.yaml` and use `pnpm install --frozen-lockfile`;
- pull requests run unit tests, typecheck/build and the full local Chromium suite;
- feature branches never replace the public Pages site;
- `main` deploys only after the validation job succeeds;
- the deployed URL then runs the same Chromium suite, so CDN/base-path/responsive behavior is part of acceptance;
- Pages base path is derived from `GITHUB_REPOSITORY`, not hard-coded to `demo1`, so forks/templates deploy correctly.

## Decision

The architecture is strong enough to serve as a reference template. The main risk is **not insufficient abstraction**; it is allowing demo compatibility paths or physical-list behavior to become implicit business semantics. Keep the seven-layer dependency direction, make stable semantic identity explicit, add cross-event machinery only for a real cross-event scenario, and remove compatibility seams incrementally when consumers justify the extraction.
