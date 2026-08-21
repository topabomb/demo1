# Resumable Agent Workspace Architecture Lab

This repository is a **reference architecture + executable browser proof** for Agent workspaces that must handle extremely long, heterogeneous conversations **and many independent asynchronous sessions** without coupling product state to OpenCode, DSH, a provider protocol, Vue, Virtua, or a specific renderer.

Live lab: **https://topabomb.github.io/demo1/**  
Architecture view: **https://topabomb.github.io/demo1/#architecture**

The claim is not “Vue can render one million messages”. It is:

> **Agent execution, hot presentation state and physical viewport state are different lifetimes. Rendering cost scales with hot/visible content, while many sessions may continue running or waiting independently.**

## Reusable architecture

```text
Backend / DSH / OpenCode
        │
        ▼
Backend Adapter
        │ canonical messages/events
        ▼
Workspace Session Registry
├─ SessionKernel A · working
├─ SessionKernel B · idle
├─ SessionKernel C · needs approval
├─ SessionKernel D · working
└─ ...
        │ activate / recent LRU
        ▼
ConversationSessionRuntime  ≤ 3 hot
├─ ~2,048-message semantic segment
├─ stable keyed RenderUnit projection
└─ page / height indexes
        │
        ▼
Committed Semantic Viewport
        │
        ▼
Virtua + Vue
~20–100 mounted rows
```

### Four lifecycles

1. **Backend lifetime** — protocol translation and paging stay behind the adapter boundary.
2. **Session/execution lifetime** — lightweight `SessionKernel` owns appended turns, current run, queue, pending approval/question and unread activity. It survives viewport destruction.
3. **Hot semantic lifetime** — disposable `ConversationSessionRuntime` owns only a bounded history segment, keyed projection and semantic reader/anchor state. The workspace LRU keeps at most three heavy runtimes.
4. **Physical viewport lifetime** — Virtua measurements, DOM nodes and scroll coordinates are ephemeral. Only the **committed semantic viewport**, not arbitrary mounted measurement probes, may define application anchors.

The critical v2 invariant is:

> **N concurrently working Agent sessions do not imply N heavyweight conversation viewports.**

## Product behaviors proven by the lab

- At least one million logical messages remain addressable without eager Vue/DOM materialization.
- Historical sessions are **resumable**, not read-only: sending appends a real user turn and a new assistant run.
- Multiple sessions may execute in the background while only `≤3` heavyweight runtimes stay hot.
- A **working** session may lose its hot runtime and continue streaming; reopening rehydrates from session-owned state.
- Submitting while working creates a session-owned **queued follow-up**.
- Pending **approval/question** state survives switching and runtime eviction and blocks the composer until resolved.
- New Session starts with zero history and becomes a normal resumable session after its first prompt.
- Recent exposes Working / Idle / Needs approval / Interrupted / unread / queued state and supports search.
- `Latest` is computed from logical reader state, never from scrollbar remainder.
- Variable-height composer owns layout space; history anchors are reconciled from committed visible rows.
- Thinking/tool/code/diff/image/HTML renderers remain isolated behind stable `RenderUnit` keys.
- Long assistant output is split into bounded presentation chunks while retaining one canonical logical message.

## Practice changed the architecture

The browser lab intentionally records failures rather than hiding them behind looser assertions. Important discoveries include:

- `14.015625px` adjacent-row overlap traced to `7px + 7px` decoration on a Virtua-owned measurement wrapper → virtualizer wrappers must be geometry-pure.
- repeatable `+1023` reader drift for a 2048-message window → semantic reader is not a window center.
- Virtua measurement probes appearing in DOM before navigation committed → `mounted DOM != visible DOM != committed semantic viewport`.
- execution controller owning `ConversationSessionRuntime` → working sessions became non-evictable and concurrency broke the hot-runtime bound.
- treating historical `completed` sessions as read-only → incompatible with real resumable Agent workflows.

## Validation

```bash
pnpm install
pnpm test
pnpm build
pnpm test:e2e
```

The CI suite covers architecture/unit contracts plus Chromium UX/stress scenarios. The Pages workflow then deploys the exact production build and runs the **same complete Chromium suite against the public Pages URL**. Dependency installation uses the pnpm store cache so repeated Actions runs reuse the package store.

Design record for the current architecture: [`docs/agent-workspace-architecture-v2.md`](docs/agent-workspace-architecture-v2.md)  
Long-history v1 investigation and failure history: [`docs/agent-conversation-architecture-lab.md`](docs/agent-conversation-architecture-lab.md)
