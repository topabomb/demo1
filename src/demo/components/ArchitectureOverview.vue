<script setup lang="ts">
const ownership = [
  ['External adapters', 'Provider · Agent runtime · connectors · persistence', 'Own protocol decoding, model/tool/delegated-child orchestration, enterprise connector auth, real mail/calendar/document actions, permission policy, retries, durable persistence and async IO. Normalize history plus explicit current session state into Engine contracts.'],
  ['Framework-neutral Engine', 'src/engine core', 'Own canonical history semantics, explicit renderable session truth such as current WorkPlan, synchronous hot reads, bounded projection and semantic viewport policy. No layout, styling, session-tree navigation, connector or product orchestration.'],
  ['Demo host', 'src/demo/**', 'Own multi-session composition, parent/child navigation, scripted coding/office/child tasks, fake sources/actions, synthetic playback/history, diagnostics shortcuts and this architecture page.'],
]

const contracts = [
  ['01', 'Canonical identity', 'Message · Turn · Step · Block · callId', 'Stable producer coordinates survive remounts and virtualization. DOM adjacency is never business identity.'],
  ['02', 'Workbench semantics', 'ResourceRef · Plan · Tool intent · Terminal · Delegation', 'Describe resources, history snapshots, streams and delegated child evidence without defining editor actions, panels, scheduling, connectors or provider policy.'],
  ['03', 'Current work state', 'WorkPlan = canonical Plan shape', 'SessionKernel stores an explicit producer-owned current WorkPlan. It never scans latest history or DOM to infer which Plan is current.'],
  ['04', 'Delegated child refs', 'AgentRunRef · foreground/background · childSessionId', 'Parent keeps stable child identity/status/summary. Detailed child trace stays in an independently addressable conversation session.'],
  ['05', 'SessionKernel', 'runtime session truth', 'Execution state, current WorkPlan, blockers, queue, explicit outcomes and accounting. Workspace topology and external side effects remain outside.'],
  ['06', 'History source', 'sync hot-read boundary', 'Async database/network/connector fetch and cache fill stop before ConversationHistorySource.'],
  ['07', 'Projection', 'bounded rebuildable presentation', 'Hot canonical content becomes stable RenderUnits. Markdown, reasoning and terminal append paths update incrementally.'],
  ['08', 'Semantic viewport', 'reader · Latest · anchor · follow', 'Conversation position remains semantic while current-plan disclosure, child navigation and rich rows change physical composition.'],
  ['09', 'Vue reference adapter', 'optional physical integration', 'Virtua, DOM measurement, ActivePlanStrip, components and CSS demonstrate one implementation without entering core semantics.'],
]

const distinctions = [
  ['Plan ≠ Step', 'Plan reports intended/progress work; Step reports execution that actually happened.'],
  ['Plan snapshot ≠ current WorkPlan', 'Conversation Plan blocks are replayable snapshots. Session activePlan is explicit producer-owned current state using the same semantic shape.'],
  ['Tool category ≠ presentation intent', 'Capability such as filesystem/search/shell/productivity is independent from generic/resources/changes/terminal interpretation.'],
  ['ResourceRef ≠ host action', 'File/URL/artifact identity does not say whether the host opens an editor, browser, mail app, document or nothing.'],
  ['Delegation ≠ subagent runtime', 'Engine renders producer-reported run identity, mode and status; it never schedules, resumes, stops or selects a child Agent.'],
  ['Child status ≠ parent status', 'A background child may still be running while its parent advances or settles; child completion never implies parent completion.'],
  ['Child reference ≠ child trace', 'Parent history keeps runId/childSessionId/summary only. Child messages/tools/nested delegation remain in the child session.'],
  ['Child address ≠ session tree', 'childSessionId is a semantic address. Parent/child topology, visibility, activation and return navigation are Host/Demo state.'],
  ['Approval ≠ external side effect', 'PendingApproval is session state. Sending mail, creating meetings or editing enterprise documents remains external-adapter work.'],
  ['Semantic content ≠ layout surface', 'There is intentionally no core PresentationSurface, composer-strip placement, panel, sidebar, tab or preview-placement contract.'],
]

const hotPaths = [
  ['Streaming reasoning', 'O(delta)', 'Replace one stable thinking RenderUnit.'],
  ['Streaming Markdown', 'O(delta + mutable tail)', 'Reparse only the parser-aligned mutable tail; settled prefix units retain identity.'],
  ['Streaming terminal', 'O(delta)', 'Append output into one stable terminal RenderUnit while tool-result siblings retain identity.'],
  ['Delegation status update', 'O(changed block)', 'Reproject one parent-visible delegation block; never project child history recursively.'],
  ['Current WorkPlan update', 'O(plan items)', 'Update explicit session state and compact status chrome; never scan total history to find the latest Plan.'],
  ['Neighbor history shift', 'O(incoming slice)', 'Project only the incoming 512-message slice.'],
  ['Far jump', 'O(hot window)', 'Rebase one bounded hot window without scanning total history.'],
  ['Visible render', 'O(visible + overscan)', 'The physical adapter mounts only visible/overscan rows.'],
  ['Latest', 'O(1)', 'logicalCount - 1 - committed reader.'],
]

const demoEvidence = [
  ['Coding-agent task', 'Current WorkPlan + history Plan → resource-aware filesystem/search → foreground/background children → parent terminal → final diff/code/artifacts → both Plan views complete.'],
  ['Inspectable child conversation', 'Click a parent delegation row to activate a real independent child transcript with its own task/reasoning/tools/final answer; return to parent through Host navigation.'],
  ['Current task strip', 'Optional Vue ActivePlanStrip renders one current task and progress above the composer; hover/click exposes the full todo list from explicit activePlan.'],
  ['Delegated child lifecycle', 'Stable runId/mode/status/childSessionId are rendered independently. Parent history does not duplicate child reasoning/tool traces.'],
  ['Executive briefing', 'Synthetic mail/calendar/doc/web ResourceRefs → source-bearing tool evidence → parallel specialists → decision brief → DOCX/PPTX/XLSX artifacts.'],
  ['Meeting follow-up approval', 'Transcript/mail/doc evidence → owners and dates → draft → blocked send/schedule WorkPlan/Plan item → generic session PendingApproval. No fake connector side effect.'],
  ['Diagnostics shortcuts', 'Restart / Plan / Delegation / Terminal / Final / office scenario buttons are Demo-owned jumps into canonical evidence, not Engine navigation APIs.'],
  ['Million-message stress', 'Dedicated 1M scenario proves bounded projection/cache/DOM independently from workbench structural transitions.'],
]

const nonGoals = [
  'Project / repository / worktree lifecycle',
  'Agent/model routing or delegated-child scheduling/concurrency',
  'child provider selection, permissions, resume / interrupt / disposal',
  'parent/child workspace tree, breadcrumbs, activation or return navigation',
  'Gmail / Outlook / Calendar / Drive / Teams / SharePoint connector and auth contracts',
  'mail sending, meeting creation or enterprise document editing',
  'scheduled / recurring office workflow orchestration',
  'Agent Teams, shared task lists or member messaging',
  'permission / allowlist evaluation',
  'editor/resource opening behavior',
  'composer/current-task strip placement or interaction design',
  'Changes / Artifacts / Preview panel layout',
  'tabs / sidebars / drawers / workspace navigation',
  'preview server, process or background-job lifecycle',
  'durable cloud sync and provider retry policy',
]

const invariants = [
  ['1,000,000+', 'addressable logical messages'],
  ['~2,048', 'hot messages/runtime'],
  ['≤ 4,096', 'projection cache entries'],
  ['≤ 3', 'Demo hot runtimes'],
  ['< 180', 'mounted rows'],
  ['< 4 px', 'normal anchor drift'],
]
</script>

<template>
  <main class="architecture-page" data-testid="architecture-page">
    <header class="architecture-nav">
      <a class="architecture-brand" href="#architecture"><span>N</span> Agent Workbench Rendering Engine</a>
      <nav><a href="#ownership">Ownership</a><a href="#contracts">Semantics</a><a href="#efficiency">Efficiency</a><a href="#evidence">Evidence</a><a class="launch-lab" href="#lab" data-testid="launch-lab">Open demo →</a></nav>
    </header>

    <section class="architecture-hero">
      <div class="hero-copy">
        <span class="architecture-kicker">layout-agnostic conversation + session semantics · executable host proof</span>
        <h1>Render a real Agent workbench without turning the Engine into <em>the workbench product.</em></h1>
        <p>The core records replayable history and explicit renderable session state. Provider execution, delegated child scheduling, child-session navigation, enterprise connectors, external actions, permission policy and workspace layout remain outside it; Vue is an optional physical reference adapter.</p>
        <div class="hero-actions"><a class="primary-link" href="#lab">Exercise the demo</a><a class="secondary-link" href="https://github.com/topabomb/demo1/blob/main/docs/architecture.md">Read architecture contract</a></div>
      </div>
      <div class="hero-proof"><span>Normal UI work</span><strong>O(changed + hot + visible)</strong><p>One million records stay addressable while current session state updates directly and only hot semantic history plus visible physical rows do work.</p><div><b>Plan-synced</b><b>Child-addressable</b><b>Resource-aware</b><b>Layout-agnostic</b></div></div>
    </section>

    <section id="ownership" class="architecture-section">
      <header class="section-heading"><span>01 · Ownership</span><h2>External runtime → semantic Engine ← Demo host</h2><p>The reusable core has one-way dependencies and deliberately knows less than the applications, workspace router and connectors around it.</p></header>
      <div class="invariant-grid state-grid"><article v-for="entry in ownership" :key="entry[0]"><strong>{{ entry[0] }}</strong><span>{{ entry[1] }}</span><p>{{ entry[2] }}</p></article></div>
      <div class="workspace-band"><span>Core rule</span><strong>Semantic renderability is Engine responsibility · product layout and workspace navigation are not</strong><p>`src/engine/**` never imports Demo. Framework-neutral layers never import Vue/DOM.</p></div>
    </section>

    <section id="contracts" class="architecture-section">
      <header class="section-heading"><span>02 · Rendering contracts</span><h2>A compact set of concepts that survive across Agent clients</h2><p>Current task state and child addressability are explicit semantics; composer placement and session-tree navigation stay outside the neutral core.</p></header>
      <div class="layer-stack">
        <article v-for="layer in contracts" :key="layer[0]" class="layer-card">
          <div class="layer-number">{{ layer[0] }}</div>
          <div class="layer-main"><div class="layer-title"><h3>{{ layer[1] }}</h3><span>{{ layer[2] }}</span></div><p>{{ layer[3] }}</p></div>
        </article>
      </div>
    </section>

    <section class="architecture-section split-section">
      <div>
        <header class="section-heading compact"><span>03 · Semantic uniqueness</span><h2>Concepts that must not collapse into each other</h2></header>
        <div class="scenario-table"><div v-for="row in distinctions" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}</strong><span>{{ row[1] }}</span></div></div>
      </div>
      <div>
        <header class="section-heading compact"><span>04 · Data path</span><h2>Current state is explicit; product policy stops before the renderer</h2></header>
        <div class="code-diagram"><pre>Provider / Agent runtime / connectors / DB
        │ normalize history + current state
        ▼
ConversationHistorySource + SessionKernel
  history snapshots      activePlan
        │                    │
        ▼                    ▼
ProjectionEngine       optional session chrome
        │                    │
        └───────┬────────────┘
                ▼
       semantic viewport / Vue adapter

childSessionId = address only
Demo/Host owns parent↔child navigation
Child traces remain in child sessions.</pre></div>
      </div>
    </section>

    <section id="efficiency" class="architecture-section">
      <header class="section-heading"><span>05 · Hot-path budgets</span><h2>Current task and child navigation do not change the scaling law</h2><p>WorkPlan updates are direct session state; delegation updates touch one parent block; neither scans total history or embeds a nested child conversation tree.</p></header>
      <div class="scenario-table"><div v-for="row in hotPaths" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}<small style="display:block;margin-top:4px;opacity:.65">{{ row[1] }}</small></strong><span>{{ row[2] }}</span></div></div>
    </section>

    <section id="evidence" class="architecture-section">
      <header class="section-heading"><span>06 · Executable evidence</span><h2>The Demo proves state synchronization and real child conversations</h2><p>Every child transcript is an independent normal conversation session. Current task chrome reads explicit session WorkPlan; it never scrapes a Plan card from the viewport.</p></header>
      <div class="scenario-table"><div v-for="row in demoEvidence" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}</strong><span>{{ row[1] }}</span></div></div>
      <div class="invariant-grid"><article v-for="entry in invariants" :key="entry[1]"><strong>{{ entry[0] }}</strong><span>{{ entry[1] }}</span></article></div>
    </section>

    <section class="architecture-section">
      <header class="section-heading"><span>07 · Explicit non-goals</span><h2>Useful Agent-product features that stay outside this Engine</h2><p>A host may use all of them. Their existence does not justify coupling them to neutral conversation/session semantics.</p></header>
      <div class="scenario-table"><div v-for="item in nonGoals" :key="item" class="scenario-row"><strong>Host / external adapter</strong><span>{{ item }}</span></div></div>
    </section>

    <section class="architecture-section">
      <header class="section-heading"><span>08 · Distribution honesty</span><h2>Reusable source boundary today; package distribution remains separate</h2></header>
      <div class="workspace-band"><span>Current repository</span><strong>Vite Demo application · package publishing disabled</strong><p>`private: true` disables npm publication; it does not describe repository visibility. The Engine is source-level reusable and extraction-ready. There is still no core PresentationSurface.</p></div>
    </section>
  </main>
</template>
