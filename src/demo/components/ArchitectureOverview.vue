<script setup lang="ts">
const ownership = [
  ['External adapters', 'Provider · Agent runtime · persistence', 'Own protocol decoding, model/tool/subagent orchestration, permission policy, retries, durable persistence and async IO. Normalize renderable evidence into Engine contracts.'],
  ['Framework-neutral Engine', 'src/engine core', 'Own canonical renderable semantics, runtime session truth, synchronous hot reads, bounded projection and semantic viewport policy. No layout, styling or product orchestration.'],
  ['Demo host', 'src/demo/**', 'Own multi-session composition, realistic scripted Agent tasks, synthetic playback/history, diagnostics and this architecture page.'],
]

const contracts = [
  ['01', 'Canonical identity', 'Message · Turn · Step · Block · callId', 'Stable producer coordinates survive remounts and virtualization. DOM adjacency is never business identity.'],
  ['02', 'Workbench semantics', 'ResourceRef · Plan · Tool intent · Terminal · AgentRunRef', 'Describe resources, progress and execution evidence without defining editor actions, panels, Agent scheduling or provider policy.'],
  ['03', 'SessionKernel', 'runtime session truth', 'Normalized messages, execution state, blockers, queue, explicit outcomes and accounting. It is neither persistence nor orchestration.'],
  ['04', 'History source', 'sync hot-read boundary', 'Async database/network fetch and cache fill stop before ConversationHistorySource.'],
  ['05', 'Projection', 'bounded rebuildable presentation', 'Hot canonical content becomes stable RenderUnits. Markdown, reasoning and terminal append paths update incrementally.'],
  ['06', 'Semantic viewport', 'reader · Latest · anchor · follow', 'Conversation position remains semantic while physical height changes under rich workbench content.'],
  ['07', 'Vue reference adapter', 'optional physical integration', 'Virtua, DOM measurement, components and CSS demonstrate one implementation without entering core semantics.'],
]

const distinctions = [
  ['Plan ≠ Step', 'Plan reports intended/progress work; Step reports execution that actually happened.'],
  ['Tool category ≠ presentation intent', 'Capability such as filesystem/search/shell is independent from generic/resources/changes/terminal interpretation.'],
  ['ResourceRef ≠ host action', 'File/URL/artifact identity and range do not say whether the host opens an editor, browser, drawer or nothing.'],
  ['AgentRunRef ≠ subagent runtime', 'Engine can render a delegated run reported by a producer; it never spawns, schedules or cancels one.'],
  ['Semantic content ≠ layout surface', 'There is intentionally no core PresentationSurface, panel, sidebar, tab or preview-placement contract.'],
]

const hotPaths = [
  ['Streaming reasoning', 'O(delta)', 'Replace one stable thinking RenderUnit.'],
  ['Streaming Markdown', 'O(delta + mutable tail)', 'Reparse only the parser-aligned mutable tail; settled prefix units retain identity.'],
  ['Streaming terminal', 'O(delta)', 'Append output into one stable terminal RenderUnit while tool-result siblings retain identity.'],
  ['Neighbor history shift', 'O(incoming slice)', 'Project only the incoming 512-message slice.'],
  ['Far jump', 'O(hot window)', 'Rebase one bounded hot window without scanning total history.'],
  ['Visible render', 'O(visible + overscan)', 'The physical adapter mounts only visible/overscan rows.'],
  ['Latest', 'O(1)', 'logicalCount - 1 - committed reader.'],
]

const demoEvidence = [
  ['Coding-agent task', 'Visible Plan → resource-aware filesystem/search tools → delegated reviewer → streamed test/build/Chromium terminal → final resource-aware diff/code/artifacts.'],
  ['Million-message stress', 'Dedicated 1M scenario proves bounded projection/cache/DOM independently from workbench structural transitions.'],
  ['Typed blockers & recovery', 'Approval, user-entered questions, queue, failure/resume and off-screen execution preserve the session contract.'],
  ['Media & artifacts', 'Uploads, generated images, TTS/ASR, code, diff and HTML all use the canonical projection/renderer path.'],
  ['Session diagnostics', 'Demo-owned controls expose synthetic playback plus read-only Engine evidence without becoming a second Engine API.'],
]

const nonGoals = [
  'Project / repository / worktree lifecycle',
  'Agent/model routing or subagent scheduling',
  'permission / allowlist evaluation',
  'editor or resource opening behavior',
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
        <p>The core records what happened and projects bounded renderable state. Provider execution, editor actions, permission policy and workspace layout remain outside it; Vue is an optional physical reference adapter.</p>
        <div class="hero-actions"><a class="primary-link" href="#lab">Exercise the demo</a><a class="secondary-link" href="https://github.com/topabomb/demo1/blob/main/docs/architecture.md">Read architecture contract</a></div>
      </div>
      <div class="hero-proof"><span>Normal UI work</span><strong>O(changed + hot + visible)</strong><p>One million records stay addressable while only hot semantic state and visible physical rows do work.</p><div><b>Resource-aware</b><b>Plan-aware</b><b>Incremental terminal</b><b>Layout-agnostic</b></div></div>
    </section>

    <section id="ownership" class="architecture-section">
      <header class="section-heading"><span>01 · Ownership</span><h2>External runtime → semantic Engine ← Demo host</h2><p>The reusable core has one-way dependencies and deliberately knows less than the application around it.</p></header>
      <div class="invariant-grid state-grid"><article v-for="entry in ownership" :key="entry[0]"><strong>{{ entry[0] }}</strong><span>{{ entry[1] }}</span><p>{{ entry[2] }}</p></article></div>
      <div class="workspace-band"><span>Core rule</span><strong>Semantic renderability is Engine responsibility · product layout and execution policy are not</strong><p>`src/engine/**` never imports Demo. Framework-neutral layers never import Vue/DOM.</p></div>
    </section>

    <section id="contracts" class="architecture-section">
      <header class="section-heading"><span>02 · Rendering contracts</span><h2>A compact set of concepts that survive across Agent clients</h2><p>The additions are semantic evidence, not a generic workbench/plugin framework.</p></header>
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
        <div class="code-diagram"><pre>Provider / Agent runtime / DB
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

Host decides panels, navigation and actions.</pre></div>
      </div>
    </section>

    <section id="efficiency" class="architecture-section">
      <header class="section-heading"><span>05 · Hot-path budgets</span><h2>Rich workbench output does not change the scaling law</h2><p>Terminal growth is an incremental semantic patch just like reasoning/Markdown growth; structural changes remain bounded to changed hot messages.</p></header>
      <div class="scenario-table"><div v-for="row in hotPaths" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}<small style="display:block;margin-top:4px;opacity:.65">{{ row[1] }}</small></strong><span>{{ row[2] }}</span></div></div>
    </section>

    <section id="evidence" class="architecture-section">
      <header class="section-heading"><span>06 · Executable evidence</span><h2>The Demo behaves like a real task, not a component gallery</h2><p>Every visible capability enters through canonical Message/Block mutations. There are no inactive tabs or placeholder workbench controls.</p></header>
      <div class="scenario-table"><div v-for="row in demoEvidence" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}</strong><span>{{ row[1] }}</span></div></div>
      <div class="invariant-grid"><article v-for="entry in invariants" :key="entry[1]"><strong>{{ entry[0] }}</strong><span>{{ entry[1] }}</span></article></div>
    </section>

    <section class="architecture-section">
      <header class="section-heading"><span>07 · Explicit non-goals</span><h2>Useful workbench features that stay outside this rendering Engine</h2><p>A host may use all of them. Their existence does not justify coupling them to canonical rendering semantics.</p></header>
      <div class="scenario-table"><div v-for="item in nonGoals" :key="item" class="scenario-row"><strong>Host / external adapter</strong><span>{{ item }}</span></div></div>
    </section>

    <section class="architecture-section">
      <header class="section-heading"><span>08 · Distribution honesty</span><h2>Reusable source boundary today; package distribution remains separate</h2></header>
      <div class="workspace-band"><span>Current repository</span><strong>Vite Demo application · package publishing disabled</strong><p>`private: true` disables npm publication; it does not describe repository visibility. The Engine is source-level reusable and extraction-ready.</p></div>
    </section>
  </main>
</template>
