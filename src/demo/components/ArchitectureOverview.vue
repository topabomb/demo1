<script setup lang="ts">
const ownership = [
  ['External adapters', 'Provider · persistence · network', 'Own async IO, provider protocol, durable persistence, Agent orchestration and recovery. They normalize into Engine contracts.'],
  ['src/engine/**', 'Reusable Engine', 'Own canonical conversation/session semantics, synchronous addressable history reads, bounded projection, semantic viewport and the Vue reference surface.'],
  ['src/demo/**', 'Executable host', 'Own multi-session workspace composition, fake ages, seeded scenarios, synthetic playback, stress history, diagnostics and the architecture page.'],
]

const contracts = [
  ['01', 'Canonical model', 'LogicalMessage + ContentBlock[]', 'Provider-neutral Message / Turn / Step / Block identity. Tool correlation uses callId; artifacts use explicit provenance.'],
  ['02', 'SessionKernel', 'runtime session truth', 'Messages, live execution state, blockers, queue, explicit Turn outcomes and normalized accounting. Idle never implies Completed, and the Kernel never guesses provider policy.'],
  ['03', 'History source', 'sync hot read boundary', 'ConversationHistorySource is globally addressable and synchronous. Async database/network fetch and caching remain outside the hot rendering path.'],
  ['04', 'Projection runtime', 'rebuildable presentation', 'A bounded hot message window becomes stable RenderUnits. Incremental Markdown/reasoning work touches changed hot content only.'],
  ['05', 'Semantic viewport', 'interaction state', 'Reader, exact Latest, follow intent and anchor are semantic coordinates; DOM measurement cannot redefine them.'],
  ['06', 'Vue reference surface', 'physical adapter', 'ConversationViewport binds the generic execution port, Virtua and renderer registry. Products may replace this layer without changing session semantics.'],
]

const stateClasses = [
  ['Session truth', 'history mutations · execution/blockers · queue · explicit outcomes · usage/context', 'Engine runtime state. Persistence is an external adapter concern; queued prompt payloads are not implicitly durable.'],
  ['Host/workspace state', 'session list · relative ages · active session · hot-runtime LRU · product routing', 'Owned by the application host. The Demo supplies one example; Engine has no WorkspaceKernel.'],
  ['Rebuildable presentation', 'hot window · projection cache · keyed RenderUnits · height estimates', 'Bounded and disposable. Reconstruct from session/history state.'],
  ['Ephemeral physical', 'Virtua measurements · ResizeObserver · mounted DOM · local renderer caches', 'Mounted lifetime only. Safe to discard and recreate.'],
]

const agentLoop = [
  ['Turn', 'One user-level interaction lifecycle. Several assistant/tool history records may share the same turnId.'],
  ['Step', 'Producer-owned model/tool-loop coordinate. Engine preserves stepId but does not decide when another Step occurs.'],
  ['Tool call/result', 'Separate canonical records linked by callId. DOM adjacency is never business identity.'],
  ['Blocker lifecycle', 'requestInteraction is the only working → waiting transition; waiting always has one pending interaction. resolveInteraction clears it to outcome-neutral idle; the execution adapter owns continuation and the final Turn outcome.'],
  ['Restore', 'A working session may provide activeAssistantIndex explicitly. Engine never assumes the last history record is the active execution target.'],
]

const hotPaths = [
  ['Streaming reasoning', 'O(delta)', 'Patch one stable thinking RenderUnit.'],
  ['Streaming Markdown', 'O(delta + mutable tail)', 'Re-tokenize only the mutable parser-aligned tail; settled prefix units retain identity.'],
  ['Neighbor history shift', 'O(incoming slice)', 'Project only the incoming 512-message slice.'],
  ['Far jump', 'O(hot window)', 'Rebase around the target without scanning total history.'],
  ['Visible render', 'O(visible + overscan)', 'Virtua mounts bounded physical rows.'],
  ['Latest', 'O(1)', 'logicalCount - 1 - committed reader.'],
]

const demoEvidence = [
  ['Agent loop investigation', 'One Turn moves through filesystem, search and shell tool phases with separate canonical tool call/result records and rich streaming GFM.'],
  ['Million-message stress', 'Dedicated 1M history scenario proves bounded projection/DOM independently of Agent-loop structural transitions.'],
  ['Session diagnostics', 'Demo-owned controls expose playback plus Engine evidence: logical/hot/DOM scale, projection work, reader state, accounting and browser performance.'],
  ['Blockers & recovery', 'Approval, question blockers with user-entered answers, failure/resume, queue and off-screen execution survive session switching and hot-runtime eviction.'],
  ['Renderer coverage', 'Markdown, reasoning, code, diff, tools, attachments, audio, HTML and responsive containment use the canonical projector/renderer path.'],
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
      <a class="architecture-brand" href="#architecture"><span>N</span> Agent Conversation Engine</a>
      <nav><a href="#ownership">Ownership</a><a href="#contracts">Contracts</a><a href="#efficiency">Efficiency</a><a href="#evidence">Evidence</a><a class="launch-lab" href="#lab" data-testid="launch-lab">Open demo →</a></nav>
    </header>

    <section class="architecture-hero">
      <div class="hero-copy">
        <span class="architecture-kicker">reusable source engine · executable host proof</span>
        <h1>Keep <em>conversation truth, presentation and product orchestration</em> at different lifetimes.</h1>
        <p>The Engine is deliberately smaller than the Demo. It preserves normalized conversation/session semantics and renders bounded hot state; provider orchestration, durable IO and multi-session product policy remain outside it.</p>
        <div class="hero-actions"><a class="primary-link" href="#lab">Exercise the demo</a><a class="secondary-link" href="https://github.com/topabomb/demo1/blob/main/docs/architecture.md">Read architecture contract</a></div>
      </div>
      <div class="hero-proof"><span>Normal UI work</span><strong>O(changed + hot + visible)</strong><p>Total history is addressable, not reactive. Product policy stays outside the reusable Engine.</p><div><b>Provider-neutral model</b><b>Explicit execution identity</b><b>Semantic coordinates</b><b>Replaceable adapter</b></div></div>
    </section>

    <section id="ownership" class="architecture-section">
      <header class="section-heading"><span>01 · Ownership</span><h2>Three boundaries, one dependency direction</h2><p>External adapters feed normalized state into the Engine; a host such as the Demo composes Engine instances into a product. The Engine imports neither.</p></header>
      <div class="invariant-grid state-grid"><article v-for="entry in ownership" :key="entry[0]"><strong>{{ entry[0] }}</strong><span>{{ entry[1] }}</span><p>{{ entry[2] }}</p></article></div>
      <div class="workspace-band"><span>Dependency rule</span><strong>External adapters / Demo → Engine · never Engine → Demo</strong><p>Multi-session routing, hot-runtime LRU and synthetic playback are host composition, not hidden Engine services.</p></div>
    </section>

    <section class="architecture-section">
      <header class="section-heading"><span>02 · State lifetimes</span><h2>Ownership follows what can be discarded</h2><p>The Engine is not a persistence server, and the physical viewport is not conversation truth.</p></header>
      <div class="invariant-grid state-grid"><article v-for="entry in stateClasses" :key="entry[0]"><strong>{{ entry[0] }}</strong><span>{{ entry[1] }}</span><p>{{ entry[2] }}</p></article></div>
    </section>

    <section id="contracts" class="architecture-section">
      <header class="section-heading"><span>03 · Engine contracts</span><h2>A small set of stable responsibilities</h2><p>The public neutral API intentionally omits runtime tuning constants, UI snapshots and Demo telemetry.</p></header>
      <div class="layer-stack">
        <article v-for="layer in contracts" :key="layer[0]" class="layer-card">
          <div class="layer-number">{{ layer[0] }}</div>
          <div class="layer-main"><div class="layer-title"><h3>{{ layer[1] }}</h3><span>{{ layer[2] }}</span></div><p>{{ layer[3] }}</p></div>
        </article>
      </div>
    </section>

    <section class="architecture-section split-section">
      <div>
        <header class="section-heading compact"><span>04 · Agent identity</span><h2>Engine preserves the loop; it does not orchestrate it</h2></header>
        <div class="scenario-table"><div v-for="row in agentLoop" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}</strong><span>{{ row[1] }}</span></div></div>
      </div>
      <div>
        <header class="section-heading compact"><span>05 · Data path</span><h2>Async IO stops before the hot renderer path</h2></header>
        <div class="code-diagram"><pre>Provider / DB / network
        │ async adapter + cache
        ▼
ConversationHistorySource + normalized events
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
Vue/Virtua reference surface

DemoWorkspaceRuntime = host example, not Engine</pre></div>
      </div>
    </section>

    <section id="efficiency" class="architecture-section">
      <header class="section-heading"><span>06 · Hot-path budgets</span><h2>Performance is an architectural contract</h2></header>
      <div class="scenario-table"><div v-for="row in hotPaths" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}<small style="display:block;margin-top:4px;opacity:.65">{{ row[1] }}</small></strong><span>{{ row[2] }}</span></div></div>
    </section>

    <section id="evidence" class="architecture-section">
      <header class="section-heading"><span>07 · Demo responsibilities</span><h2>The Demo proves the Engine without becoming the Engine</h2><p>Scenario data, playback cadence and diagnostics controls stay in `src/demo/**`; assertions verify that they enter through canonical Engine paths.</p></header>
      <div class="scenario-table"><div v-for="row in demoEvidence" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}</strong><span>{{ row[1] }}</span></div></div>
      <div class="invariant-grid"><article v-for="entry in invariants" :key="entry[1]"><strong>{{ entry[0] }}</strong><span>{{ entry[1] }}</span></article></div>
    </section>

    <section class="architecture-section">
      <header class="section-heading"><span>08 · Distribution honesty</span><h2>Reusable source boundary today; packaging is a separate release concern</h2></header>
      <div class="workspace-band"><span>Current repository</span><strong>Vite Demo application · package publishing disabled</strong><p>`package.json` uses `private: true` to disable package publication; it does not describe GitHub repository visibility. The Engine is source-level reusable and extraction-ready, but this repository does not claim a published npm package.</p></div>
    </section>
  </main>
</template>
