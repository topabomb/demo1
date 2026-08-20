# Million Message Agent UI Lab

A browser-verified architecture experiment for CodeNomad/DSH-like Agent workspaces with **1,000,000 logical messages**, multiple Recent sessions, variable-height rich content and continuously growing LLM output.

Live site: https://topabomb.github.io/demo1/

Detailed architecture, failed approaches, UX contract and current evidence: [`docs/agent-conversation-architecture-lab.md`](docs/agent-conversation-architecture-lab.md).

## Architecture

```text
OpenCode / DSH / remote backend / synthetic lab
                  ↓
       ConversationHistoryAdapter
                  ↓
          LogicalMessage
                  ↓
              projector
                  ↓
       ConversationSessionRuntime
  2048-message hot window / 512 shifts
                  ↓
      KeyedConversationProjection
       order + keyed stable nodes
           ↓              ↓
        Virtua       NodeSeat subscription
           └──────┬───────┘
                  ↓
               Vue UI
```

`ConversationWorkspaceRuntime` owns independent session scopes and keeps at most three heavyweight hot runtimes. Recent metadata and semantic viewport snapshots remain cheap. Vue does not own backend/runtime business objects; it is a thin projection layer.

### Important invariants

- A 1M history is addressable but never eagerly materialized into Vue state or DOM.
- Only ~2048 logical messages are hot for the active conversation.
- A 512-message neighboring shift projects only the entering slice and reuses retained `RenderUnit` objects.
- Random far jumps start a new virtualizer epoch instead of reusing unrelated measurements.
- Normal streaming patches one stable keyed node; list order is not invalidated.
- Repeated node changes are microtask-batched before UI notification.
- Long assistant/code/diff content is split into bounded RenderUnits.
- Dynamic height is handled by Virtua; Shiki highlighting runs in a Worker.
- Markdown/HTML is sanitized with DOMPurify.
- Disclosure keys are session-scoped.
- Recent A → B → A restores semantic reader state; cold sessions can be reconstructed after LRU eviction.
- The floating Latest button reports exact logical messages after the reader without loading those messages.

## Validation

```bash
pnpm install
pnpm test
pnpm build
pnpm test:e2e
```

The Chromium gate verifies:

- 1M logical messages with fewer than 180 mounted rows;
- 60 Hz synthetic LLM streaming and bounded live-response chunking;
- user escape from tail-follow while streaming continues;
- global jump and `<4px` semantic anchor drift across reverse-history prepend;
- Latest button and messages-after count;
- thinking/tool/code/diff/image/HTML behavior;
- multi-session ID/fold/viewport isolation;
- off-screen running-session streaming;
- bounded hot-session LRU and semantic rehydration.

GitHub Actions also builds production assets and deploys the experiment to GitHub Pages.
