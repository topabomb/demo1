# Agent Conversation Framework Lab

Executable reference template for production-style Agent workspaces with **very long heterogeneous conversations, asynchronous resumable sessions and dynamic physical layout**.

- Live lab: **https://topabomb.github.io/demo1/**
- Architecture page: **https://topabomb.github.io/demo1/#architecture**
- Canonical design: [`docs/agent-workspace-reference-architecture.md`](docs/agent-workspace-reference-architecture.md)
- Executable scenario contracts: [`docs/agent-workspace-scenario-contracts.md`](docs/agent-workspace-scenario-contracts.md)
- DeepSeek Harness design lessons: [`docs/deepseek-harness-design-lessons.md`](docs/deepseek-harness-design-lessons.md)
- Template review / extraction guide: [`docs/template-review.md`](docs/template-review.md)
- Verification contract: [`docs/verification.md`](docs/verification.md)

The claim is not “Vue can render one million messages”. The framework separates state by lifetime and responsibility:

```text
Backend / Runtime Ports
        ↓
Canonical Conversation Model
LogicalMessage + ContentBlock[]
        ├──────────────→ Session + Workspace Kernel
        ↓
Projection Runtime
Projector Registry + bounded ProjectionEngine + keyed RenderUnits
        ↓
Semantic Viewport Policy
reader · Latest · anchor · follow
        ↓
Physical List Adapter
        ↓
Renderer + responsive Product Adapter
```

## Four state lifetimes

| State | Examples | Rule |
|---|---|---|
| durable domain | history, execution, blockers, outcomes, usage/context | correct with no viewport |
| session interaction memory | reader/anchor/follow checkpoint, draft, touched disclosures | small; survives Recent switching |
| rebuildable presentation | ~2K hot window, projection LRU, keyed RenderUnits | disposable and bounded |
| ephemeral physical | DOM, measured heights, renderer caches | mounted/render lifetime only |

The hot-path target is **`O(changed + hot + visible)`**, not `O(total history)`.

## Template boundary

The reusable contract is `model/ + conversation kernel/ports + presentation/ + viewport policy`. Vue, Virtua, renderer components, synthetic fixtures, diagnostics and product CSS are reference adapters. Compatibility barrels and synthetic-message fields exist because this repository evolved from a stress demo; they are not recommended API surface for a new product. See the template review for the remaining extraction seams and the order in which to remove them.

## What the lab exercises

- `1,000,000+` addressable logical messages without one-million-item Vue state;
- multiple background-running/blocked/failed/completed-resumable sessions with `<=3` hot presentation runtimes;
- live LLM reasoning followed by live Markdown in the same stable assistant Message/Turn/Step;
- reasoning disclosure while streaming: collapsed/open layouts may have very different heights without redefining semantic state;
- Markdown tail-only incremental projection while reasoning and other sibling Blocks keep identity;
- single and multiple user uploads: images, documents and audio grouped as stable attachment artifacts;
- image-generation tool call/result with stable `callId`, prompt/model/progress plus 1..N generated images linked by provenance;
- TTS and ASR tool execution separated from reusable audio/transcript artifact rendering;
- generic search/filesystem tools, code, diff, image, sanitized HTML and Markdown compatibility fixtures;
- runtime injection through the same canonical SessionKernel path as real adapter content—no DOM-side fixtures;
- exact `Latest` / messages-after semantics, user escape from tail follow and far-history jumps;
- variable-height composer, disclosure, media grids and responsive reflow without row overlap;
- desktop/tablet/phone with Recent moved to a drawer rather than removed;
- bounded DOM/projection caches under repeated heterogeneous scenario packs;
- identical Chromium scenarios against local production build and deployed GitHub Pages.

See [`docs/agent-workspace-scenario-contracts.md`](docs/agent-workspace-scenario-contracts.md) for the scenario → canonical semantics → renderer responsibility → browser-invariant matrix.

## Extension contract

Adding `citation`, `terminal-session`, `file-tree`, `chart`, `artifact` or `subagent` should require only:

1. extend `ContentBlockMap`;
2. register `ContentBlock → bounded RenderUnit[]` projection;
3. register the frontend renderer;
4. define renderer containment/responsive behavior;
5. add canonical unit/browser fixtures.

It should **not** require edits to SessionKernel, history segmentation or semantic viewport policy.

A different case is a visual row whose state spans **multiple durable records** (for example a long-running review/job or deliverable lifecycle). That is the point to introduce a stable-ID ConversationNode assembler with replay/prepend/append laws; do not force ordinary single-message `ContentBlock` rendering through that abstraction.

## Tool vs artifact boundary

A tool call describes **execution**; an attachment/audio/image/code artifact describes **displayable input/output**. For example image generation is represented as:

```text
tool-call(generate_image, callId, model, prompt, progress)
→ tool-result(same callId, structured result)
→ attachments(generated image ids, model/prompt/tool provenance)
```

TTS/ASR use the same rule. This prevents ToolCard from becoming a provider-specific universal component and lets media renderers serve user uploads, tool outputs and future providers equally.

## Design influence: DeepSeek Harness

The template borrows several proven conversation-runtime invariants from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) without copying Cordis or its plugin/package system: durable/model facts stay upstream of UI, Turn/Step are semantic coordinates, related records carry producer-owned stable IDs, high-frequency publication is independently coalesced, and renderers consume keyed renderer-ready data rather than scanning Session state.

See [`docs/deepseek-harness-design-lessons.md`](docs/deepseek-harness-design-lessons.md) for the scenario-by-scenario mapping and the explicit “do not generalize yet” boundaries.

## Physical/CSS boundary

- `src/virtua-layout.css` — tiny non-negotiable measured-geometry integration;
- `src/renderer-content.css` — renderer containment;
- `src/product-ux.css` / `src/responsive-ux.css` — replaceable reference product UI.

Conversation algorithms do not read product widths, colors, gaps or breakpoints.

## Validate

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:e2e
```

Pull requests run the complete local gate. A push to `main` is deployed only after that gate passes, then the same Chromium suite is run against the public Pages URL. Acceptance is recorded only for an exact SHA that passes both stages.
