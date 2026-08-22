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
- `src/engine/index.ts` excludes Vue/Demo implementation, workspace navigation and tuning telemetry;
- `src/engine/vue/index.ts` remains an optional physical adapter;
- external adapters own provider decoding, Agent/tool/child orchestration, child concurrency/provider selection, permission policy, connectors/authentication, real external side effects, persistence, retries/backoff/fallback choice and async IO;
- Demo owns workspace/LRU, parent/child navigation, scripted coding/office/lifecycle/child sessions, synthetic source/action evidence, playback and diagnostics;
- no core `PresentationSurface`, session-tree router, retry/fallback policy, panel, sidebar, tab, drawer or editor-routing contract is introduced without a proven reusable requirement;
- canonical/session contracts contain no CSS class, color, width, panel placement or host open action.

### Plan / current-work invariants

- canonical `plan` blocks are replayable history snapshots;
- `PlanItem` describes intended/progress work and never replaces or derives `stepId`;
- `WorkPlan` is exactly `ContentBlockMap['plan']`, not a second todo/task model;
- `ConversationDescriptor.activePlan` and `ConversationSessionKernel.setActivePlan(...)` represent explicit producer-owned **current** work state;
- appending a historical Plan block by itself must **not** mutate `activePlan`;
- Engine must never scan newest messages, mounted rows or DOM to guess the current plan;
- a producer/adapter may publish the same semantic Plan value to history and `activePlan` in one normalized update;
- the optional Vue `ActivePlanStrip` may render current task/progress/full list, but composer placement, hover/click disclosure and styling remain physical adapter choices.

### Delegated-child / session-navigation invariants

- one canonical `delegation` block contains one or more stable `AgentRunRef`s;
- `AgentRunMode` is parent-facing `foreground | background` observation, never a scheduling command;
- each child exposes stable `runId`, own status, optional `childSessionId` and concise summary;
- `childSessionId` is an address only; Engine model/contracts must not gain `parentSessionId`, `sessionTree`, child-list routing or `openChildSession()` behavior;
- parent delegation never recursively embeds child `LogicalMessage[]` or child tool history;
- child status never redefines parent `SessionStatus`, WorkPlan or `lastTurnReason`;
- a failed child must remain representable while sibling runs and the parent are completed; Engine must not infer parent failure or retry policy from that child status;
- Demo/Host may map `childSessionId` to an independently addressable conversation, hide that session from normal Recent, activate it and provide a return-to-parent action;
- detailed child messages must live in the child session itself and use the normal canonical/projector/renderer path.

### Agent lifecycle / resilience invariants

- `PendingQuestion`/`InteractionResolution` represent a typed clarification blocker and its answer, not what the runtime must do after receiving that answer;
- resolving a question clears the blocker to outcome-neutral idle; a provider/runtime decides whether to resume an existing operation, start a new request or update its plan;
- failed child/tool evidence is independent from retry/fallback policy, retry budgets, backoff and parent outcome;
- terminal/Turn `interrupted` evidence is historical execution truth, not a command to resume or retry;
- a later user steering instruction may be a distinct Turn with its own Plan/tools/outcome while the interrupted Turn remains unchanged;
- no scenario name, `RetryPolicy`, `FallbackPolicy`, `ResumePolicy`, retry counter, fallback-source selector or provider recovery workflow belongs in framework-neutral Engine contracts.

### Workbench semantic invariants

- `ResourceRef` is the canonical host-neutral identity for files, URLs and artifacts; it contains no connector/open behavior;
- `diff` uses `ResourceRef`, not a parallel file identity;
- `ToolCategory` describes capability while `ToolPresentationIntent` independently describes renderer-neutral interpretation;
- presentation intent is limited to generic/resources/changes/terminal semantics and contains no physical placement or application routing;
- tool call/result remain separate records correlated through producer-owned `callId`;
- terminal output is first-class canonical content and append-only growth patches one stable RenderUnit;
- terminal process lifecycle remains execution-adapter policy; Demo abort/interruption evidence settles terminal as `interrupted` with exit code `130`.

### Office/knowledge-work boundary invariants

- Engine must not introduce Gmail, Outlook, Calendar, Microsoft Graph, Workspace, Teams, SharePoint or provider-specific connector models;
- Engine must not implement `sendEmail`, `scheduleMeeting`, `createEvent`, connector auth or recurring workflow execution;
- mail threads, calendar events, documents and web evidence are neutral ResourceRefs;
- office tool activity uses generic tool call/result + category + presentation intent;
- DOCX/PPTX/XLSX-style outputs are normal artifact attachments;
- office specialist agents reuse delegation;
- staged external action uses ordinary tool evidence plus typed `PendingApproval`;
- approval resolution changes Engine blocker state only; the real adapter owns side effects.

### Existing session/runtime invariants

- `ConversationHistorySource` remains synchronous hot-read; async fetch/prefetch/cache fill stays outside Engine;
- restored `working` sessions never infer active assistant position from history order;
- `SessionStatus`, `activePlan` and `lastTurnReason` remain independent;
- `status:'waiting'` exists iff one `pendingInteraction` exists;
- `requestInteraction(...)` is explicit working→waiting;
- `resolveInteraction(...)` clears the blocker without inventing a Turn outcome or side effect;
- queue payloads are runtime state, not implied durable persistence;
- presentation remains bounded/rebuildable;
- semantic reader/Latest/anchor is independent from virtualizer measurement;
- Demo playback/diagnostics/navigation never become Engine APIs.

## Browser coverage

Local and deployed suites exercise the same public application behavior.

### Current WorkPlan chrome

The browser must prove:

- the default Agent session exposes an `active-plan-strip` near the composer from explicit session WorkPlan state;
- its compact summary shows a current in-progress/blocked/pending item and progress;
- click/hover disclosure exposes all Plan items/statuses;
- during Agent-loop execution the strip updates as producer Plan mutations update current WorkPlan;
- after completion the strip reports 4/4 and the historical Plan snapshot also has four completed items;
- jumping to old history does not redefine current WorkPlan.

### Real child conversation navigation

The browser must prove:

- the parent delegation row exposes the matching `childSessionId`;
- activating it opens an independent child conversation session rather than expanding copied parent content;
- the child transcript visibly contains its own delegated user task, reasoning/tool evidence and final result;
- hidden child sessions do not clutter normal Recent;
- child header exposes a Host-owned return-to-parent action;
- returning restores the parent session and delegation evidence;
- navigation does not change the Engine `AgentRunRef` contract or create a core session-tree API.

### Default coding-Agent flow

The browser must also retain the existing evidence:

- filesystem/search tools expose stable `callId`, category, ResourceRefs and resources presentation intent;
- model/tool Step coordinates remain distinct from Plan progress;
- one foreground reviewer and two background reviewers render independently;
- parent advances into shell/terminal while children remain represented;
- Terminal streams through multiple deltas and settles explicitly;
- final synthesis includes GFM, ResourceRef-aware diff/code and artifacts;
- mounted rows stay bounded and adjacent rows do not overlap.

### Office scenarios

Executive briefing must show cross-source ResourceRefs, completed WorkPlan/Plan, specialist delegation, decision-oriented Markdown and DOCX/PPTX/XLSX artifacts.

Meeting follow-up must show neutral transcript/mail/document evidence, blocked send/schedule WorkPlan/Plan item, staged productivity call, typed waiting approval, and generic resolution without claiming an actual mail/calendar mutation.

### Agent lifecycle resilience

The browser must prove all three lifecycle transitions through the public application:

- **clarify/continue:** `android-protocol` exposes a typed question, an answer clears the blocker, composer becomes usable, and the same session can start a subsequent Turn with logical history increasing;
- **partial failure/fallback:** `resilience-fallback` is a completed parent with WorkPlan 3/3 while one delegated specialist is failed and two are completed; the cached-export fallback appears as ordinary correlated tool call/result evidence and the final brief explicitly labels stale evidence;
- **interrupt/steer:** `steered-migration` is currently completed with WorkPlan 3/3 while its older Turn retains an interrupted terminal with exit `130`; a later user message changes direction, begins a different Turn and produces a read-only final report.

These tests must not depend on a core retry/fallback/resume API because none exists.

### General coverage

The suite also covers:

- 1,000,000+ addressable messages with bounded hot state/cache/DOM;
- growing GFM, reasoning and terminal streams;
- typed questions/approvals;
- failure/resume and off-screen execution;
- image/file/audio/generated artifacts, code, diff and sanitized HTML;
- far jump, prepend, exact Latest/follow and session restore;
- desktop/mobile reflow and variable-height content;
- hostile host CSS without breaking adapter containment;
- Demo diagnostics shortcuts without fake product controls.

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

Architecture tests fail if the neutral entry exposes Demo/session-tree/physical/recovery-policy details such as `parentSessionId`, child navigation commands, `RetryPolicy`, `FallbackPolicy`, `SessionUiSnapshot`, `ShiftPlan`, `WINDOW_MESSAGES` or `SHIFT_MESSAGES`, or if semantics acquire panel/layout/style/orchestration/connector fields.

Tests assert stable ResourceRef, PlanItem, WorkPlan, ToolPresentationIntent, AgentRunMode/AgentRunRef, delegation and terminal append support; historical Plan/current WorkPlan separation; child-address/session-tree separation; lifecycle evidence/policy separation; and the absence of speculative PresentationSurface or provider-specific APIs.

The Vue API may expose `ActivePlanStrip` and renderer components because they are explicitly optional physical adapters; their geometry does not enter the neutral Engine API.

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