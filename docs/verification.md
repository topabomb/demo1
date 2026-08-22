# Verification and Release Contract

This file defines what must be true before the repository can be called released. GitHub Actions evidence for the **exact `main` SHA** is authoritative.

## Acceptance chain

One workflow owns validation and release:

1. frozen dependency install;
2. unit + architecture tests;
3. strict Vue/TypeScript typecheck and production build;
4. full Chromium E2E against the local production server;
5. on `main`, build and deploy GitHub Pages;
6. run the same Chromium suite against the deployed Pages URL;
7. publish `pages/deployed-e2e=success` for that exact SHA.

A Pages upload alone is not a release.

## Architecture invariants

Automated tests must protect these boundaries:

- `src/engine/**` never imports `src/demo/**`;
- framework-neutral Engine layers do not depend on Vue/DOM/physical layout;
- `src/engine/index.ts` excludes Vue/Demo implementation and tuning telemetry;
- `src/engine/vue/index.ts` remains an optional instance-oriented adapter;
- external adapters own provider decoding, Agent/tool/child orchestration, child concurrency/provider selection, permission policy, connectors/authentication, real external side effects, persistence, retries and async IO;
- Demo owns workspace/LRU, scripted coding/office scenarios, synthetic source/action evidence, child timing, playback and diagnostics;
- no core `PresentationSurface`, panel, sidebar, tab, drawer or editor-routing contract is introduced without a proven reusable requirement;
- canonical or RenderUnit contracts contain no CSS class, color, width, panel placement or host open action.

### Workbench semantic invariants

- `ResourceRef` is the canonical host-neutral identity for files, URLs and artifacts; it contains no connector/open behavior;
- `diff` uses `ResourceRef`, not a parallel `file` identity;
- PlanItem describes intended/progress work and never replaces or derives `stepId`;
- `ToolCategory` describes capability while `ToolPresentationIntent` independently describes renderer-neutral interpretation;
- presentation intent is limited to generic/resources/changes/terminal semantics and contains no physical placement or application routing;
- tool call/result remain separate records correlated through producer-owned `callId`;
- one canonical `delegation` block contains one or more stable `AgentRunRef`s;
- `AgentRunMode` is exactly parent-facing `foreground | background` observation, never a scheduling command;
- child status never redefines parent `SessionStatus` or `lastTurnReason`;
- parent delegation never recursively embeds child `LogicalMessage[]` or child tool history;
- child scheduling, provider/worktree choice, permissions, resume/interrupt and child-session navigation remain outside Engine;
- terminal output is first-class canonical content and append-only growth patches one stable RenderUnit;
- terminal process lifecycle remains execution-adapter policy; Demo abort evidence settles terminal as `interrupted` with exit code `130`.

### Office/knowledge-work boundary invariants

Office Agent examples must **reuse generic rendering contracts**. In particular:

- Engine must not introduce Gmail, Outlook, Calendar, Microsoft Graph, Workspace, Teams, SharePoint or provider-specific connector models;
- Engine must not implement `sendEmail`, `scheduleMeeting`, `createEvent`, connector auth or recurring workflow execution;
- mail threads, calendar events, documents and web evidence are represented as neutral `ResourceRef`s;
- office tool activity uses the existing generic tool call/result + category + presentation-intent contracts;
- Word/PowerPoint/Excel-style outputs are normal artifact attachments with ResourceRefs, not new Engine document-workflow types;
- office specialist agents use the existing `delegation` contract;
- a staged mail/calendar action is represented by ordinary tool evidence plus a typed session `PendingApproval`;
- approving/denying clears the Engine blocker only; the real adapter decides whether to perform an external side effect;
- Diagnostics scenario shortcuts, replay/reset and fixed demo coordinates remain under `src/demo/**`.

### Existing session/runtime invariants

- `ConversationHistorySource` remains synchronous hot-read; async fetch/prefetch/cache fill stays outside Engine;
- restored `working` sessions never infer active assistant position from history order;
- `SessionStatus` and `lastTurnReason` remain independent;
- `status:'waiting'` exists iff one `pendingInteraction` exists;
- `requestInteraction(...)` is the explicit working→waiting transition;
- `resolveInteraction(...)` clears the blocker without inventing a Turn outcome or side effect;
- approval/question resolutions remain typed;
- queue payloads are runtime state, not implied durable persistence;
- all Demo scenarios enter through canonical `LogicalMessage + ContentBlock[]` only;
- presentation remains bounded/rebuildable;
- semantic reader/Latest/anchor is independent from virtualizer measurement;
- Demo playback/diagnostics never become Engine APIs;
- Engine Vue CSS stays host-scoped; only Demo may globally style the host page.

## Browser coverage

Local and deployed suites exercise the same real behavior.

### Default coding-Agent flow

The browser must prove the public default scenario:

- seeded first assistant Step visibly contains a Plan;
- filesystem/search tools expose stable `callId`, capability category, ResourceRefs and `resources` presentation intent;
- Plan progress changes independently from model/tool Step coordinates;
- Step 3 renders one delegation batch with one completed foreground reviewer and two background reviewers still running;
- each child exposes stable `runId`, `mode`, `status` and child-session address without recursive child trace;
- parent advances into shell/terminal while background children remain independently live;
- background child statuses settle independently;
- a role:tool record streams a dedicated Terminal through multiple deltas and settles with explicit exit state;
- projection incremental counters increase during terminal growth;
- final synthesis includes rich GFM, ResourceRef-aware diff/code and artifacts;
- the original Plan reaches all-completed state;
- mounted rows stay bounded and adjacent rows do not overlap.

### Diagnostics scenario controls

The browser must prove the Demo-owned shortcuts actually expose the relevant evidence:

- Restart agent loop reconstructs the synthetic Demo host rather than inventing an Engine reset API;
- Plan jumps to the canonical Plan record;
- Delegation jumps to the canonical multi-child record;
- Terminal jumps to the canonical terminal/tool result;
- Final jumps to final synthesis when available;
- Executive briefing activates the office briefing session;
- Meeting approval activates the waiting office follow-up session.

### Executive briefing

The browser must prove a realistic cross-source knowledge-work flow:

- completed Plan is visible;
- source-bearing tool evidence references a mail thread, calendar meeting, KPI document and external web update through ResourceRefs;
- the same resource-oriented renderer handles those sources without office-provider-specific UI contracts;
- one foreground specialist plus two background specialists render through `delegation`;
- the final brief contains decision-oriented Markdown and source evidence;
- DOCX, PPTX and XLSX deliverables render through ordinary attachment/artifact semantics.

### Meeting follow-up approval

The browser must prove an action-oriented office flow without simulating connector ownership inside Engine:

- transcript, email and document context is represented by neutral resource-aware tool evidence;
- Plan extracts/reconciles work and ends with the send/schedule item `blocked`;
- the staged `send_meeting_followup` tool call is visible and correlated by `callId`;
- session state is `waiting` with a typed approval;
- Approve/Deny controls are rendered by the generic pending-interaction path;
- resolving the approval removes the blocker and re-enables the composer;
- tests do not claim a real email or calendar mutation occurred.

### General coverage

The suite also covers:

- 1,000,000+ addressable messages with bounded hot state/cache/DOM;
- continuously growing GFM tables, tasks, nested lists, blockquotes and fenced code;
- typed user question answers and independent approval behavior;
- fresh idle sessions with no invented Turn outcome;
- failure/resume and background execution while viewports switch/evict;
- image/file/audio attachments, generated images, TTS/ASR, code, diff and sanitized HTML;
- far jump, prepend, exact Latest/follow and session restore;
- desktop/mobile reflow and variable-height content including expanded reasoning/terminal/delegation rows;
- hostile host CSS without breaking reference adapter containment;
- a focused public workspace with one-click Demo-owned diagnostics and no fake product controls.

## Deterministic reference bounds

```text
logical history             >= 1,000,000
Demo hot runtimes           <= 3
working kernels scenario    >= 4
hot logical window          ~2,048 messages
neighbor shift              512 messages
projection cache            <= 4,096 entries
mounted DOM                 < 180 rows
semantic anchor drift       < 4 px
adjacent row overlap        <= 1 px tolerance
body horizontal overflow    <= 1 px
virtual wrapper block gap   exactly 0 px margin/padding
```

These are verification bounds for the reference implementation, not framework-neutral API constants.

## Public API checks

Architecture tests fail if the neutral entry exposes implementation details such as `SessionUiSnapshot`, `ShiftPlan`, `WINDOW_MESSAGES` or `SHIFT_MESSAGES`, or if workbench semantics acquire panel/layout/style/orchestration/connector fields.

Tests also assert stable `ResourceRef`, PlanItem, ToolPresentationIntent, AgentRunMode/AgentRunRef, canonical delegation and terminal append support; the absence of the superseded singular `agent-run`; and the absence of speculative `PresentationSurface` or office-provider-specific core APIs.

The Vue API remains an optional reference adapter. Plan/Terminal/Delegation components and Engine Vue styles may define physical presentation but cannot change canonical semantics. Every Engine Vue stylesheet remains rooted at `[data-conversation-engine].conversation-shell`.

The repository verifies source-level reuse; package distribution requires a separate library-build/export-map/consumer-smoke decision.

## Workflow policy

- `pnpm-lock.yaml` is committed and CI uses `--frozen-lockfile`;
- Node/pnpm versions are explicit;
- PRs run the full validation gate but never deploy Pages;
- `main` deploys only after validation succeeds;
- main release concurrency is isolated from merged-PR cleanup;
- failures upload Playwright reports.

## Release evidence

A release is complete only when the exact `main` SHA has:

```text
unit / architecture       Green
strict type + build       Green
local full Chromium       Green
Pages deployment          Green
public deployed Chromium  Green
pages/deployed-e2e        success
```

Missing, cancelled or stale evidence means the release is incomplete.
