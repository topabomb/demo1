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
- Synthetic `kind/seed/intensity/content` fields on `LogicalMessage` exist for the million-message generator. Production adapters should emit canonical `blocks`; a future extraction should move synthetic metadata out of the canonical interface entirely.
- `legacyBlocksForMessage` and synthetic fixture generation currently live beside projector policy. They should move under a demo/fixtures package before this code is published as a standalone library.
- `ConversationProjectionStore` currently sits in conversation contracts while exposing `RenderUnit`. The final package split should move that port to the presentation boundary so domain/session contracts do not depend on presentation types.
- `ConversationViewport.vue` is intentionally an integration proof, but it currently combines the Virtua adapter, anchor/follow orchestration, composer behavior and diagnostics. A product extraction should keep the pure policy in `viewport/` and split the physical adapter from product controls; do not move DOM state back into the session kernel.

These are **extraction seams**, not reasons to add another abstraction layer now. The demo should first keep one executable vertical slice and prove the boundaries with tests.

## Rendering-efficiency rules

The template should preserve these invariants:

- Never materialize total history into Vue/reactive state.
- A hot runtime owns a bounded segment and a bounded projection cache.
- Cache hits return stable immutable RenderUnit collections rather than cloning containers on every read.
- Streaming Markdown uses append-only tail projection and preserves settled RenderUnit identity.
- Keyed node patches do not publish a new list order unless IDs actually enter, leave or move.
- Markdown/highlight caches remain bounded and renderer-local.
- Responsive reflow may require multiple physical measurement frames; semantic anchors must remain stable while the virtualizer converges.
- FPS/heap are diagnostics. Deterministic bounds on hot work, DOM count and semantic correctness are the CI contract.

If profiling later shows stream publication scanning the whole hot segment, optimize that implementation with a message-index span/index. Do not introduce a global reactive index pre-emptively; the current bounded window keeps this a local optimization.

## Missing pieces before library extraction

These are deliberately deferred until there is a consumer that needs them:

1. Move synthetic generation out of canonical/presentation packages and make canonical messages free of demo-only required fields.
2. Move presentation-store contracts out of the session/domain contract surface.
3. Add typed RenderUnit payloads only if independent renderer packages need compile-time payload contracts; `Record<string, unknown>` is acceptable inside this reference app.
4. Define an explicit persistence/transport adapter package when a real backend exists. The demo must not invent a persistence framework.
5. Split the large Vue viewport into physical-list adapter and product/composer integration when a second UI shell or virtualizer is introduced.

## CI and release policy

The repository is a template only if its build is reproducible and its public demo corresponds to validated source:

- commit `pnpm-lock.yaml` and use `pnpm install --frozen-lockfile`;
- pull requests run unit tests, typecheck/build and the full local Chromium suite;
- feature branches never replace the public Pages site;
- `main` deploys only after the validation job succeeds;
- the deployed URL then runs the same Chromium suite, so CDN/base-path/responsive behavior is part of acceptance;
- Pages base path is derived from `GITHUB_REPOSITORY`, not hard-coded to `demo1`, so forks/templates deploy correctly.

## Decision

The architecture is already strong enough to serve as a reference template. The main risk is **not insufficient abstraction**; it is allowing demo compatibility paths to be mistaken for stable framework contracts. Keep the seven-layer dependency direction, make the public/private boundary explicit, and remove compatibility seams incrementally when real consumers justify the extraction.
