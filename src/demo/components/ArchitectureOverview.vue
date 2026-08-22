<script setup lang="ts">
const ownership = [
  ['External adapters', 'Provider · Agent runtime · connectors · persistence', 'Own protocol decoding, model/tool/delegated-child orchestration, enterprise connector auth, real mail/calendar/document actions, permission policy, retries, durable persistence and async IO. Normalize renderable evidence into Engine contracts.'],
  ['Framework-neutral Engine', 'src/engine core', 'Own canonical renderable semantics, runtime session truth, synchronous hot reads, bounded projection and semantic viewport policy. No layout, styling, connector or product orchestration.'],
  ['Demo host', 'src/demo/**', 'Own multi-session composition, scripted coding/office tasks, fake sources/actions, child timing, synthetic playback/history, diagnostics shortcuts and this architecture page.'],
]

const contracts = [
  ['01', 'Canonical identity', 'Message · Turn · Step · Block · callId', 'Stable producer coordinates survive remounts and virtualization. DOM adjacency is never business identity.'],
  ['02', 'Workbench semantics', 'ResourceRef · Plan · Tool intent · Terminal · Delegation', 'Describe resources, progress, streams and delegated child evidence without defining editor actions, panels, scheduling, connectors or provider policy.'],
  ['03', 'Delegated child refs', 'AgentRunRef · foreground/background · child status', 'One delegation block covers one or many child runs. Each child stays addressable; detailed child trace remains in its own session/thread.'],
  ['04', 'SessionKernel', 'runtime session truth', 'Normalized messages, parent execution state, blockers, queue, explicit outcomes and accounting. Approval state is observable; external side effects are not Engine work.'],
  ['05', 'History source', 'sync hot-read boundary', 'Async database/network/connector fetch and cache fill stop before ConversationHistorySource.'],
  ['06', 'Projection', 'bounded rebuildable presentation', 'Hot canonical content becomes stable RenderUnits. Markdown, reasoning and terminal append paths update incrementally.'],
  ['07', 'Semantic viewport', 'reader · Latest · anchor · follow', 'Conversation position remains semantic while physical height changes under rich workbench content.'],
  ['08', 'Vue reference adapter', 'optional physical integration', 'Virtua, DOM measurement, components and CSS demonstrate one implementation without entering core semantics.'],
]

const distinctions = [
  ['Plan ≠ Step', 'Plan reports intended/progress work; Step reports execution that actually happened.'],
  ['Tool category ≠ presentation intent', 'Capability such as filesystem/search/shell/productivity is independent from generic/resources/changes/terminal interpretation.'],
  ['ResourceRef ≠ host action', 'File/URL/artifact identity does not say whether the host opens an editor, browser, mail app, document or nothing.'],
  ['Delegation ≠ subagent runtime', 'Engine renders producer-reported run identity, mode and status; it never schedules, resumes, stops or selects a child Agent.'],
  ['Child status ≠ parent status', 'A background child may still be running while its parent advances or settles; child completion never implies parent completion.'],
  ['Child reference ≠ child trace', 'Parent history keeps runId/childSessionId/summary only. Child messages/tools/nested delegation remain in the child session.'],
  ['Approval ≠ external side effect', 'PendingApproval is session state. Sending mail, creating meetings or editing enterprise documents remains external-adapter work.'],
  ['Semantic content ≠ layout surface', 'There is intentionally no core PresentationSurface, panel, sidebar, tab or preview-placement contract.'],
]

const hotPaths = [
  ['Streaming reasoning', 'O(delta)', 'Replace one stable thinking RenderUnit.'],
  ['Streaming Markdown', 'O(delta + mutable tail)', 'Reparse only the parser-aligned mutable tail; settled prefix units retain identity.'],
  ['Streaming terminal', 'O(delta)', 'Append output into one stable terminal RenderUnit while tool-result siblings retain identity.'],
  ['Delegation status update', 'O(changed block)', 'Reproject one parent-visible delegation block; never project child history recursively.'],
  ['Neighbor history shift', 'O(incoming slice)', 'Project only the incoming 512-message slice.'],
  ['Far jump', 'O(hot window)', 'Rebase one bounded hot window without scanning total history.'],
  ['Visible render', 'O(visible + overscan)', 'The physical adapter mounts only visible/overscan rows.'],
  ['Latest', 'O(1)', 'logicalCount - 1 - committed reader.'],
]

const demoEvidence = [
  ['Coding-agent task', 'Visible Plan → resource-aware filesystem/search → completed foreground child + running background children → parent shell/terminal → child settlement → final diff/code/artifacts.'],
  ['Delegated child lifecycle', 'Stable runId/mode/status/childSessionId are rendered independently. Parent history does not duplicate child reasoning/tool traces.'],
  ['Executive briefing', 'Synthetic mail/calendar/doc/web ResourceRefs → source-bearing tool evidence → parallel specialists → decision brief → DOCX/PPTX/XLSX artifacts.'],
  ['Meeting follow-up approval', 'Transcript/mail/doc evidence → owners and dates → draft → blocked send/schedule Plan item → generic session PendingApproval. No fake connector side effect.'],
  ['Diagnostics shortcuts', 'Restart / Plan / Delegation / Terminal / Final / office scenario buttons are Demo-owned jumps into canonical evidence, not Engine navigation APIs.'],
  ['Million-message stress', 'Dedicated 1M scenario proves bounded projection/cache/DOM independently from workbench structural transitions.'],
  ['Typed blockers & recovery', 'Approval, user-entered questions, queue, failure/resume and off-screen execution preserve the session contract.'],
  ['Media & artifacts', 'Uploads, generated images, TTS/ASR, code, diff, HTML and office artifact files all use the canonical projection/renderer path.'],
]

const nonGoals = [
  'Project / repository / worktree lifecycle',
  'Agent/model routing or delegated-child scheduling/concurrency',
  'child provider selection, permissions, resume / interrupt / disposal',
  'Gmail / Outlook / Calendar / Drive / Teams / SharePoint connector and auth contracts',
  'mail sending, meeting creation or enterprise document editing',
  'scheduled / recurring office workflow orchestration',
  'Agent Teams, shared task lists or member messaging',
  'permission / allowlist evaluation',
  'editor, resource or child-session opening behavior',
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
        <span class="architecture-kicker">layout-agnostic rendering semantics · executable host proof</span>
        <h1>Render a real Agent workbench without turning the Engine into <em>the workbench product.</em></h1>
        <p>The core records what happened and projects bounded renderable state. Provider execution, delegated-child scheduling, enterprise connectors, external office actions, permission policy and workspace layout remain outside it; Vue is an optional physical reference adapter.</p>
        <div class="hero-actions"><a class="primary-link" href="#lab">Exercise the demo</a><a class="secondary-link" href="https://github.com/topabomb/demo1/blob/main/docs/architecture.md">Read architecture contract</a></div>
      </div>
      <div class="hero-proof"><span>Normal UI work</span><strong>O(changed + hot + visible)</strong><p>One million records stay addressable while only hot semantic state and visible physical rows do work.</p><div><b>Resource-aware</b><b>Plan-aware</b><b>Delegation-aware</b><b>Layout-agnostic</b></div></div>
    </section>

    <section id="ownership" class="architecture-section">
      <header class="section-heading"><span>01 · Ownership</span><h2>External runtime → semantic Engine ← Demo host</h2><p>The reusable core has one-way dependencies and deliberately knows less than the applications and connectors around it.</p></header>
      <div class="invariant-grid state-grid"><article v-for="entry in ownership" :key="entry[0]"><strong>{{ entry[0] }}</strong><span>{{ entry[1] }}</span><p>{{ entry[2] }}</p></article></div>
      <div class="workspace-band"><span>Core rule</span><strong>Semantic renderability is Engine responsibility · product layout and execution policy are not</strong><p>`src/engine/**` never imports Demo. Framework-neutral layers never import Vue/DOM.</p></div>
    </section>

    <section id="contracts" class="architecture-section">
      <header class="section-heading"><span>02 · Rendering contracts</span><h2>A compact set of concepts that survive across Agent clients</h2><p>Coding, research and office demos reuse the same semantic evidence instead of growing provider-specific framework concepts.</p></header>
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
        <header class="section-heading compact"><span>04 · Data path</span><h2>Async IO and product policy stop before the hot renderer</h2></header>
        <div class="code-diagram"><pre>Provider / Agent runtime / connectors / DB
        │ normalize + async cache
        ▼
ConversationHistorySource + canonical mutations
        │
        ▼
ConversationSessionKernel
        │
        ▼
ProjectionEngine → keyed RenderUnits
        │
        ▼
Semantic viewport
        │
        ▼
optional Vue / Virtua physical adapter

Child traces remain in child sessions.
Host decides panels, navigation and actions.
External adapters perform real office side effects.</pre></div>
      </div>
    </section>

    <section id="efficiency" class="architecture-section">
      <header class="section-heading"><span>05 · Hot-path budgets</span><h2>Rich workbench output does not change the scaling law</h2><p>Terminal growth is incremental; delegation status changes reproject one changed parent block, never a nested child conversation tree.</p></header>
      <div class="scenario-table"><div v-for="row in hotPaths" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}<small style="display:block;margin-top:4px;opacity:.65">{{ row[1] }}</small></strong><span>{{ row[2] }}</span></div></div>
    </section>

    <section id="evidence" class="architecture-section">
      <header class="section-heading"><span>06 · Executable evidence</span><h2>The Demo behaves like real coding and office tasks, not a component gallery</h2><p>Every visible capability enters through canonical Message/Block mutations. Connectors and external actions are represented as evidence, never reimplemented by Engine.</p></header>
      <div class="scenario-table"><div v-for="row in demoEvidence" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}</strong><span>{{ row[1] }}</span></div></div>
      <div class="invariant-grid"><article v-for="entry in invariants" :key="entry[1]"><strong>{{ entry[0] }}</strong><span>{{ entry[1] }}</span></article></div>
    </section>

    <section class="architecture-section">
      <header class="section-heading"><span>07 · Explicit non-goals</span><h2>Useful Agent-product features that stay outside this rendering Engine</h2><p>A host may use all of them. Their existence does not justify coupling them to canonical rendering semantics.</p></header>
      <div class="scenario-table"><div v-for="item in nonGoals" :key="item" class="scenario-row"><strong>Host / external adapter</strong><span>{{ item }}</span></div></div>
    </section>

    <section class="architecture-section">
      <header class="section-heading"><span>08 · Distribution honesty</span><h2>Reusable source boundary today; package distribution remains separate</h2></header>
      <div class="workspace-band"><span>Current repository</span><strong>Vite Demo application · package publishing disabled</strong><p>`private: true` disables npm publication; it does not describe repository visibility. The Engine is source-level reusable and extraction-ready.</p></div>
    </section>
  </main>
</template>
