# Agent Workbench Rendering Engine Lab

A provider-neutral **front-end rendering Engine + executable Demo host** for long-running Agent workbenches: very long histories, multi-step tool loops, plans, resources, delegated child runs, streaming terminal output, approvals/questions, office artifacts, lifecycle recovery, rich Markdown/media and dynamic virtualization.

- Live demo: https://topabomb.github.io/demo1/
- Architecture view: https://topabomb.github.io/demo1/#architecture
- Architecture contract: [`docs/architecture.md`](docs/architecture.md)
- Verification/release contract: [`docs/verification.md`](docs/verification.md)

> Normal UI work scales with **changed + hot + visible** state, not total history.

## Boundary in one picture

```text
Provider / Agent runtime / connectors / persistence / network
        │ normalize history + explicit current session truth
        ▼
src/engine/** framework-neutral Engine
  canonical identity/history · SessionKernel
  bounded projection · semantic viewport policy
        │
        ├── src/engine/vue/** optional physical reference adapter
        │
        ▲ consume
src/demo/** Demo host
  workspace/session navigation · realistic scripted scenarios
  fake provider execution · stress playback · diagnostics
```

**Engine owns stable, cross-product renderable semantics and their invariants.** It is intentionally not restricted to “history cards”: current `WorkPlan`, typed pending interactions, exact interaction identity, Turn outcomes, tool/child execution facts and semantic viewport state belong in Engine because multiple Agent products need to render them consistently.

**External runtime owns behavior and policy.** Provider decoding, model/tool loops, actual tool execution, post-approval continuation, retries/backoff/fallback choice, child scheduling, permissions, connectors, persistence and real side effects stay outside Engine.

**Demo owns executable proof.** Scenario routing, fake actions/sources, parent/child workspace navigation, synthetic playback, stress history and diagnostics stay in `src/demo/**`. Engine never imports Demo.

The framework-neutral core is also layout/style agnostic. Vue, Virtua, CSS, composer placement, panels, drawers and navigation are optional physical/product choices.

## Stable semantic model

Provider/runtime events normalize to stable `LogicalMessage` records with Message / Turn / Step / Block identity. Tool activity uses producer-owned `callId`; resources use `ResourceRef`; delegated children use `AgentRunRef` plus optional `childSessionId` address.

Important distinctions:

- **Plan snapshot ≠ current WorkPlan.** A `plan` block is replayable history; `activePlan` is explicit current session truth using the same shape.
- **Plan ≠ Step.** Plan describes intended/progress work; Step identifies execution that actually happened.
- **ResourceRef ≠ host action.** Identity does not imply which editor/browser/app opens it.
- **Delegation ≠ child runtime.** Engine renders child identity/mode/status; runtime schedules and controls children.
- **Child status ≠ parent status.** A failed child can coexist with a successful parent when the runtime chooses an acceptable fallback.
- **Failure/interruption evidence ≠ retry/resume policy.** Engine renders the fact; runtime chooses the consequence.
- **Semantic content ≠ layout surface.** There is intentionally no core `PresentationSurface`.

### Interaction identity and approval boundary

A pending question/approval is **current session truth**, not merely text in history.

```text
canonical proposed tool call (callId)
        │ optional correlation
        ▼
PendingApproval { id, callId? }
        │
        │ exact user response
        ▼
InteractionResolution { interactionId, ... }
        │ SessionKernel validates current blocker identity
        ▼
outcome-neutral idle
        │
        └── external runtime decides execute / reject / resume / new Turn
```

`interactionId` and tool `callId` deliberately remain distinct. One identifies the session blocker; the other identifies the canonical tool call. `PendingApproval.callId` may correlate them when approval concerns an exact call.

The Engine enforces generic invariants:

- `status:'waiting'` iff exactly one `pendingInteraction` exists;
- a stale response cannot resolve a newer blocker of the same kind;
- `finishExecution(...)` cannot bypass a pending blocker;
- `startExecution(...)` cannot reset an already-working execution;
- exposed blocker/failure/session values do not leak mutable internal state.

Approval itself does **not** mean the tool executed. A proposed call may intentionally have no `status` or `durationMs` yet. Tool execution status is producer-reported truth only; projection and Vue renderers never invent `running` or `success`. After resolution, the external runtime decides whether to execute the tool and how to continue the provider run.

## Tool, terminal and delegation semantics

`ToolCategory` describes capability (`filesystem`, `search`, `shell`, `productivity`, ...). `ToolPresentationIntent` is only a renderer-neutral interpretation (`generic`, `resources`, `changes`, `terminal`); it never encodes panel placement, connector routing or permission policy.

Tool call/result remain separate canonical records correlated by `callId`. Any explicit tool `status`, progress or duration comes from the producer. Missing status means **unknown/not reported**, never an implicit `running` or `success`.

Terminal is first-class streaming content. `append-terminal` patches one stable RenderUnit; starting/killing/retrying the process remains runtime policy.

A plural `delegation` block carries one or more `AgentRunRef`s. `foreground/background` is producer-reported parent-facing observation, never a scheduler command. Child traces remain independent conversation sessions rather than recursively embedded histories.

## What the Demo proves

The public Demo exercises the same Engine path for all scenarios:

- **Coding Agent:** WorkPlan + Plan → ResourceRefs/tools → foreground/background children → streaming Terminal → diff/code/artifacts → completed synthesis.
- **Executive briefing:** mail/calendar/docs/web ResourceRefs → evidence-bearing tools → specialist delegation → decision brief → DOCX/PPTX/XLSX artifacts.
- **Meeting follow-up:** sources → draft → blocked WorkPlan → **proposed productivity call with no execution status** → `PendingApproval` correlated by `callId`.
- **Production config approval:** exact diff → proposed `edit_file` call with no execution status → session approval blocker.
- **Clarify → continue:** `PendingQuestion` → exact answer resolution → blocker clears → subsequent execution can start.
- **Partial failure → fallback:** one child fails, siblings finish, Demo/runtime selects a permitted cached source, parent completes while preserving the failed evidence.
- **Interrupt → steer:** old terminal remains interrupted (`exit 130`); a later user instruction creates a separate read-only Turn.
- **Million-message stress:** 1,000,000+ addressable records with bounded hot projection/cache/DOM and semantic far navigation.

None of these scenarios introduces connector-specific or recovery-policy core types.

## Explicit Engine non-goals

Engine does **not** own:

- model/Agent selection, child scheduling/concurrency or provider routing;
- retry budgets, retryability, backoff, fallback-source/confidence policy or automatic recovery;
- the semantic consequence of approval/question answers for a provider run;
- actual tool/process/mail/calendar/document execution;
- connector/auth protocols or permission/allowlist decisions;
- parent/child workspace trees, activation, breadcrumbs or navigation history;
- editor/resource opening behavior;
- panels, tabs, sidebars, drawers, preview placement or product layout;
- durable cloud sync, async network fetch or persistence.

## Public API and CSS

`src/engine/index.ts` is the framework-neutral surface. `src/engine/vue/index.ts` is an optional Vue/reference adapter. CSS under `src/engine/vue/**` is physical reference presentation; `src/demo/styles/**` belongs to the Demo host.

The repository is a Vite/Pages application with `"private": true`; it does not claim an npm package.

## Develop and release

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:e2e
```

A release is accepted only when the **exact `main` SHA** passes unit/architecture tests, strict typecheck/build, the full local Chromium suite, Pages deployment, the same full Chromium suite against the deployed Pages URL, and publishes `pages/deployed-e2e=success`.