# Agent Workspace Architecture Lab v2

Status: **active implementation proof**. This document supersedes the v1 exit claim for product-level Agent workspace behavior. v1 proved bounded long-history rendering; v2 proves that the same rendering model survives real multi-session Agent lifecycles.

## Background and target

The lab is not complete merely because one conversation can address one million messages with bounded DOM. A real coding/Agent workspace must also support many independent conversations, background execution, switching, resuming old conversations, pending approvals/questions, queued follow-ups, draft restoration, dynamic composer height, exact Latest semantics, and rich heterogeneous output.

The UX target is intentionally close to CodeNomad/DSH: Recent sessions on the left, a document-like conversation center, structured thinking/tool disclosures, a persistent composer, visible run state, stop/queue behavior, and session-owned pending interactions. Benchmark controls are diagnostics, not the primary product UI.

## Architecture

The key correction from v1 is that **session execution and heavyweight viewport state are different lifetimes**.

```text
Backend / DSH / OpenCode
        |
        v
Backend Adapter
        |
        v
Workspace Session Registry
  SessionKernel A  working
  SessionKernel B  idle
  SessionKernel C  waiting approval
  SessionKernel D  working
        |
        | only for hot/visible sessions
        v
ConversationSessionRuntime (LRU <= 3)
  bounded logical segment (~2048)
  keyed RenderUnit projection
  page/height indexes
        |
        v
Committed Semantic Viewport
        |
        v
Virtua + Vue (~20-100 DOM rows)
```

### SessionKernel — session lifetime

A kernel is lightweight and must survive viewport unmount/eviction. It owns canonical appended turns, current execution state, the active assistant revision, queued prompts, pending approval/question, unread activity and execution metrics. It does **not** own DOM, Vue objects, Virtua handles or a 2048-message projection.

Therefore `N simultaneously running Agents != N heavyweight viewports`. The acceptance target is at least four simultaneous working kernels while heavyweight runtimes remain bounded to three.

### ConversationSessionRuntime — hot semantic lifetime

A runtime exists only for the active/recently-used hot set. It materializes a bounded range from the kernel/backend, projects canonical messages into stable RenderUnits and owns reader/follow/anchor state. It may be destroyed while its SessionKernel continues working.

Rehydration is semantic: `logicalPosition + stable anchor + followTail + draft`, never a saved DOM node or scrollTop.

### Projection — render lifetime

Canonical messages are projected into stable keyed RenderUnits. A long assistant message may split into multiple ~6k-character presentation chunks while its canonical identity remains one message. Normal streaming patches the affected message only; list membership changes only when a chunk boundary or appended turn changes the projection.

### Committed semantic viewport — physical lifetime

Practice exposed that virtualizer-mounted DOM is not application viewport truth. Virtua may mount measurement probes. An application anchor must be chosen only from rows that intersect the physical viewport, belong to the current projection, and are consistent with the committed semantic reader.

This is the rule used for composer resize, snapshot capture and restore: `mounted DOM != visible DOM != committed semantic viewport`.

## Real session behavior under test

**Resume old conversation.** An idle historical session can accept a new prompt. Sending appends a real user message and a new live assistant message, increasing logical count. Stopping marks it interrupted; another prompt starts another real turn. Appended turns live in SessionKernel state and survive hot-runtime eviction.

**Multiple asynchronous conversations.** Several sessions can work simultaneously. Switching Recent only changes mounted/hot viewport scope. Background runs continue, mark their sidebar item unread, and may be evicted from the three-runtime LRU without losing execution state.

**Working-session follow-up.** Submitting while working queues a follow-up in the SessionKernel. Queue state survives navigation and is shown in the composer and Recent item. A real backend adapter may map this generic semantic to provider-specific queue/steer behavior.

**Pending approval/question.** A pending interaction is session-owned. It remains visible in Recent, survives viewport eviction, and reappears on return. The composer is blocked until the interaction is resolved.

**New Session.** New Session creates a real zero-history kernel/runtime. The first prompt creates message 0 (user) and message 1 (assistant); after that it is equivalent to any other resumable conversation.

## UX corrections from v1

v1 looked too much like a benchmark dashboard. v2 changes the default surface to a product-like Agent workspace:

- diagnostics closed by default for normal users;
- functional session search and New Session;
- Working / Idle / Needs approval / Interrupted / unread / queued state in Recent;
- assistant Markdown as document flow rather than every block being a card;
- user messages visually bounded on the right;
- thinking/tool/code/diff remain structured disclosures/cards;
- Send works for idle/interrupted history, queues while working, and Stop aborts a run;
- pending interaction is in normal layout flow above the composer, never overlaid over the list;
- variable composer height continues to resize the viewport and uses committed semantic anchor reconciliation.

## Rejected approaches and lessons

1. **Execution controller holding ConversationSessionRuntime.** Rejected because running sessions became non-evictable and the hot-runtime bound failed as concurrency grew.
2. **`completed` history as read-only UI state.** Rejected because real Agent sessions are resumable; history and execution state are orthogonal.
3. **DOM presence as navigation completion.** Rejected because Virtua measurement probes can exist before committed scroll.
4. **Any mounted row as an anchor.** Rejected after a probe was captured as the composer-resize anchor.
5. **Virtualizer-owned wrapper decoration.** Rejected after a measured 14.015625px row overlap; wrapper geometry must remain pure and product spacing lives inside the measured child.
6. **Semantic reader interpreted as window center.** Rejected after repeatable +1023 restoration drift with a 2048 hot window.

## v2 executable acceptance

The implementation is accepted only when the exact final commit passes locally and on deployed GitHub Pages:

- >= 1,000,000 addressable logical history with bounded framework/DOM work;
- <= 3 heavyweight ConversationSessionRuntime instances even with >= 4 working SessionKernels;
- background execution continues after its viewport runtime is evicted;
- historical session can send, stop, send again, be evicted and restore appended turns;
- working session queue persists across switches;
- approval persists across switches/eviction and blocks composer until resolved;
- New Session starts empty and becomes a normal resumable session after first prompt;
- exact session-scoped Latest and messages-after semantics;
- dynamic composer history anchor drift < 4px and no card overlap;
- 60Hz live output remains bounded and long output splits into presentation chunks;
- thinking/tool/code/diff/image/HTML renderers remain isolated and dynamic-height safe;
- TypeScript, unit tests, local Chromium, Pages deployment and public Pages Chromium all green.

## Current progress

The v2 core has been rewritten around `ConversationSessionKernel -> ConversationSessionRuntime -> keyed projection -> committed semantic viewport`. Core TypeScript has been checked locally. Product UX, unit tests and browser scenarios are now in the branch so CI can validate the actual Vue/Virtua integration. This section must not be changed to ACCEPTED until the final deployed SHA passes the complete public browser suite.
