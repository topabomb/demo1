# Verification and Release Contract

GitHub Actions evidence for the **exact `main` SHA** is authoritative. A Pages upload by itself is not a release.

## Acceptance chain

1. frozen dependency install;
2. unit + architecture tests;
3. strict Vue/TypeScript typecheck and production build;
4. full Chromium E2E against the local production server;
5. on `main`, build and deploy GitHub Pages;
6. run the same full Chromium suite against the deployed Pages URL;
7. publish `pages/deployed-e2e=success` for that exact SHA.

## Engine / Demo boundary invariants

Automated tests must protect all of the following:

- `src/engine/**` never imports `src/demo/**`;
- framework-neutral layers contain no Vue/DOM/CSS/layout dependency;
- `src/engine/index.ts` excludes Demo, workspace navigation, provider workflow/recovery policy and tuning telemetry;
- `src/engine/vue/**` remains an optional physical adapter;
- external adapters own provider decoding, Agent/tool/child execution, real side effects, retry/backoff/fallback policy, permissions, connectors, persistence and async IO;
- Demo owns workspace navigation/LRU, scripted coding/office/lifecycle scenarios, fake sources/actions, playback, stress history and diagnostics;
- no core `PresentationSurface`, session-tree router, retry/fallback/resume policy, connector action model or product panel contract is introduced without a stable cross-product semantic requirement.

The correct test for whether something belongs in Engine is: **is it a stable renderable fact/identity/invariant that multiple Agent clients must preserve, or is it a behavior/policy chosen by a runtime/product?**

## Canonical and session invariants

### Plan/current work

- historical `plan` blocks are replayable snapshots;
- `PlanItem` does not replace/derive execution `stepId`;
- `WorkPlan` aliases `ContentBlockMap['plan']`, not a second task model;
- `activePlan` is explicit current producer/session state;
- Engine never scans newest history/DOM/mounted rows to guess current work;
- optional Vue `ActivePlanStrip` is presentation only.

### Interaction identity / approval

- `status:'waiting'` exists iff exactly one `pendingInteraction` exists;
- `requestInteraction(...)` is explicit working→waiting;
- every `InteractionResolution` carries the exact `interactionId` it answers;
- a stale same-kind interaction resolution must be rejected rather than clearing the current blocker;
- a wrong-kind resolution for the correct id must be rejected;
- `PendingApproval.callId?` may correlate the blocker to one exact canonical tool call while remaining distinct from the interaction id;
- `finishExecution(...)` must reject attempts to settle while a blocker is pending;
- `startExecution(...)` must not restart/reset an already-working execution;
- exposed pending/failure/session values must not leak mutable internal references;
- clearing a blocker must not invent a Turn outcome, perform a side effect or decide provider continuation.

### Proposed tool call / execution truth

- tool call/result correlation uses producer-owned `callId`;
- tool `status`, `progress`, `durationMs` and result content are producer-reported execution facts;
- missing tool status means not reported / no execution fact, **not** implicit `running` or `success`;
- framework-neutral projection and Vue reference rendering must not inject default execution statuses;
- a call waiting for approval may be rendered as a canonical proposed call with no execution status;
- Demo approval fixtures must correlate the blocker to the same callId;
- approval resolution alone must not synthesize a successful/failed/cancelled tool result.

### Resource/tool presentation

- `ResourceRef` is the host-neutral file/URL/artifact identity and contains no open/connector behavior;
- `diff` uses ResourceRef rather than parallel file identity;
- `ToolCategory` describes capability; `ToolPresentationIntent` describes renderer-neutral interpretation;
- presentation intent contains no panel placement, app routing, connector auth or permission policy;
- top-level tool resources and any ResourceRefs repeated in presentation intent must preserve the same ResourceRef identities rather than define a second resource system.

### Delegated child / navigation

- one `delegation` block contains one or more stable `AgentRunRef`s;
- `foreground/background` is parent-facing observation, never scheduling policy;
- child `runId`, status, optional `childSessionId` and summary remain stable;
- parent history never recursively embeds child `LogicalMessage[]`;
- `childSessionId` is an address only; Engine has no parentSessionId/sessionTree/openChildSession API;
- child status never defines parent status/WorkPlan/Turn outcome;
- a failed child must be representable while siblings and parent complete;
- Demo/Host may navigate to independently addressable child sessions.

### Lifecycle evidence / policy separation

- PendingQuestion/answer is a typed blocker/resolution fact, not provider resume policy;
- failed child/tool evidence is independent from retry budget/backoff/fallback choice;
- interrupted terminal/Turn is historical execution truth, not an automatic resume command;
- a later user steering instruction may start a separate Turn without rewriting old evidence;
- framework-neutral Engine contains no RetryPolicy/FallbackPolicy/ResumePolicy/retry counter/fallback source selector/scenario name.

### Terminal/history/viewport

- terminal output is first-class canonical content; append growth patches one stable RenderUnit;
- process start/kill/retry/attach remains external execution policy;
- `ConversationHistorySource` is synchronous hot-read; async fetch/cache fill stays outside Engine;
- restored working sessions use explicit active assistant coordinate;
- semantic reader/Latest/anchor/follow is independent from virtualizer measurement;
- presentation remains bounded/rebuildable.

## Office/knowledge-work boundary

- Engine contains no Gmail/Outlook/Calendar/Microsoft Graph/Workspace/Teams/SharePoint action or connector model;
- mail/calendar/document/web evidence uses neutral ResourceRefs;
- office activity reuses generic tool/category/presentation/delegation/artifact semantics;
- DOCX/PPTX/XLSX outputs are normal attachments;
- **Meeting follow-up:** proposed `send_meeting_followup` call has callId `meeting-followup-approval` and intentionally no execution status before approval; PendingApproval carries the same callId;
- **Production config migration:** proposed `edit_file` call has callId `config-edit-approval` and intentionally no execution status before approval; PendingApproval carries the same callId;
- approve/deny clears generic blocker state only; actual send/schedule/edit and provider continuation remain external.

## Browser coverage

Local and deployed suites must exercise the same public app.

### Approval truth

Browser coverage must prove:

- meeting follow-up shows a `PendingApproval` with exact interaction id and correlated tool callId;
- the staged productivity call exposes the same callId;
- the staged call has **no rendered execution status badge or data-status** before approval;
- deny clears the pending blocker and re-enables the composer without claiming mail/calendar mutation;
- existing config approval remains navigable and session-owned.

### Existing workbench coverage

The suite must also retain:

- current WorkPlan strip from explicit `activePlan`, including live updates and completed state;
- independent child-session navigation and return-to-parent behavior;
- coding Agent filesystem/search/terminal/delegation/diff/code/artifact flow;
- executive briefing cross-source evidence, specialists and office artifacts;
- clarify→answer→continue lifecycle;
- partial child failure + explicit Demo/runtime fallback while parent completes;
- interrupted terminal (`exit 130`) + later user steering Turn;
- 1,000,000+ addressable history with bounded hot/cache/DOM work;
- far jump/prepend/Latest/follow/session restore;
- growing Markdown/reasoning/terminal streams;
- media/artifact/sanitized HTML rendering;
- desktop/mobile variable-height reflow and hostile host CSS containment;
- diagnostics shortcuts remaining Demo-only.

## Deterministic reference bounds

```text
logical history             >= 1,000,000
Demo hot runtimes           <= 3
hot logical window          ~2,048 messages
neighbor shift              512 messages
projection cache            <= 4,096 entries
mounted DOM                 < 180 rows
semantic anchor drift       < 4 px
adjacent row overlap        <= 1 px tolerance
body horizontal overflow    <= 1 px
virtual wrapper block gap   exactly 0 px margin/padding
```

These are reference-implementation verification bounds, not framework-neutral API constants.

## Public API checks

Architecture tests fail if the neutral entry or model gains Demo/session-tree/physical/recovery-policy concepts such as `parentSessionId`, child navigation commands, `RetryPolicy`, `FallbackPolicy`, `ResumePolicy`, `SessionUiSnapshot`, `ShiftPlan`, `WINDOW_MESSAGES`, `SHIFT_MESSAGES`, panel placement or connector action models.

Tests must positively assert exact interaction identity correlation, producer-owned tool status, ResourceRef/Plan/WorkPlan/delegation/terminal semantics and the separation of execution evidence from workflow policy.

## Workflow policy

- lockfile committed; CI uses frozen install;
- Node/pnpm versions explicit;
- PRs run full validation but never deploy Pages;
- main deploys only after validation succeeds;
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