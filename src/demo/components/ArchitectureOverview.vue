<script setup lang="ts">
const ownership = [
  ['src/engine/**', 'Reusable Engine', 'Canonical model, session semantics, bounded projection/runtime, semantic viewport, Vue/Virtua adapter and renderers. Engine never imports Demo.'],
  ['src/demo/**', 'Executable proof', 'Synthetic million-message history, playback/telemetry, scenarios, seeded workspace, diagnostics and architecture page. Demo consumes Engine.'],
]

const stateClasses = [
  ['Durable domain state', 'Canonical history · execution · queue/blockers · turn outcome · usage/context', 'Must remain correct with zero mounted viewports. Provider persistence can replace the demo memory implementation.'],
  ['Session interaction memory', 'semantic reader/anchor/follow checkpoint · draft · user-touched disclosure preferences', 'Survives Recent switching; small and session-scoped. It is not canonical conversation history.'],
  ['Rebuildable presentation state', '~2K hot logical window · ProjectionEngine LRU · keyed RenderUnits · page estimates', 'May be evicted at any time and reconstructed from canonical state. Never becomes the source of truth.'],
  ['Ephemeral physical state', 'ViewportNavigationController · Virtua measurements · mounted DOM · renderer caches', 'Exists only to navigate/paint efficiently. Bounded, replaceable and safe to discard.'],
]

const contracts = [
  ['01', 'Backend / Runtime Ports', 'protocol boundary', 'Paging, cursors, history reads and execution/event normalization.', 'Provider-native shapes stop here.'],
  ['02', 'Canonical Conversation Model', 'domain vocabulary', 'LogicalMessage + extensible ContentBlock[] + stable Turn / Step / Block identity.', 'No Vue, DOM, renderer or virtualizer type may leak inward.'],
  ['03', 'Session + Workspace Kernel', 'session lifetime', 'Runs, resumable Turns, queue, blockers, unread, outcomes, usage and session routing.', 'Execution survives hot-runtime and viewport eviction.'],
  ['04', 'Projection Runtime', 'rebuildable hot lifetime', 'Projector Registry + bounded ProjectionEngine cache + keyed hot RenderUnit store.', 'Projection cost scales with incoming/changed hot content, never total history.'],
  ['05', 'Semantic Viewport Policy', 'interaction lifetime', 'Reader, exact Latest count, semantic anchor, follow intent and restoration policy.', 'Requested navigation and committed reader are different states.'],
  ['06', 'Physical List Adapter', 'mounted lifetime', 'ViewportNavigationController + Virtua/Vue handle + ResizeObserver + DOM measurement reconciliation.', 'Replaceable adapter; layout events cannot redefine semantics.'],
  ['07', 'Renderer + Product Adapter', 'replaceable presentation', 'Renderer registry, Markdown/reasoning/tool/media components, containment, responsive layout and theme.', 'A product redesign must not require changing session or semantic viewport algorithms.'],
]

const harnessLessons = [
  ['Turn / Step coordinates', 'A Turn and a model request are not the same lifetime.', 'Keep turnId required, stepId producer-owned/optional, and expose both on renderer-ready nodes.'],
  ['Stable business correlation', 'Separate records must not be attached to “the latest unfinished row”.', 'Tool call/result share a producer-owned callId; artifacts link through explicit provenance.'],
  ['Apply semantics, coalesce paint', 'Event order and UI publication cadence are separate concerns.', 'SessionKernel emits every semantic mutation in order; summary/render publication may coalesce independently.'],
  ['Scenario-triggered abstraction', 'A generic node/plugin engine is not free architecture.', 'Add a cross-event assembler only when review/job/deliverable state genuinely spans durable records.'],
]

const hotPaths = [
  ['Streaming reasoning', 'O(delta)', 'One stable Thinking node is patched; collapsed/open physical height is renderer state, not canonical reasoning state.'],
  ['Streaming Markdown append', 'O(delta + mutable Markdown tail)', 'ProjectionEngine re-chunks only the mutable tail; settled chunks and sibling Blocks keep identity.'],
  ['Keyed publish', 'O(changed RenderUnits)', 'Stable node IDs patch only affected seats; order subscribers are untouched when membership is unchanged.'],
  ['Visible render', 'O(visible + overscan)', 'Virtua mounts tens of rows; 1M logical messages never become 1M Vue components.'],
  ['History shift', 'O(incoming 512 slice)', 'Retained RenderUnit objects survive; only the incoming neighboring slice is projected.'],
  ['Far jump', 'O(hot window)', 'Rebase around target; requested jump does not become reader state until the physical target is stably committed.'],
  ['Session switch', 'O(1) hot / O(window) cold', 'SessionKernel keeps running; only disposable presentation state is reused or rehydrated.'],
  ['Responsive reflow', 'O(mounted measurements)', 'Navigation controller freezes the semantic anchor, remeasures physical rows and restores the coordinate after the latest transaction commits.'],
  ['Latest count', 'O(1)', 'logicalCount - 1 - committed reader; never inferred from scrollbar remainder.'],
]

const renderers = [
  ['Markdown', 'GFM · tasks · tables · fences · sanitized HTML · long documents', 'fence-safe chunks + bounded HTML LRU; table/pre contain their own overflow'],
  ['Reasoning', 'streaming/collapsed/open + tokens/duration/status', 'stable node identity; only user-touched fold state is retained in a bounded preference LRU'],
  ['Tool execution', 'call/result · open category · model/progress · stable callId', 'generic ToolCard owns execution metadata/structured input-output, not generated media'],
  ['Media & files', '1..N image/audio/video/file attachments + provenance', 'one grouped semantic block handles user uploads and tool outputs; responsive grid/files remain contained'],
  ['Audio / transcript', 'TTS · ASR input · recording · waveform/player/transcript', 'specialized interactive media surface justified by playback/transcript behavior, independent from ToolCard'],
  ['Code / Diff', 'large source and patches', 'bounded line chunks; internal scroll; Shiki highlighting stays outside canonical state'],
  ['Rich artifact', 'sanitized HTML and future embedded output', 'contained output; scripts never execute'],
  ['Extension', 'citation · terminal · chart · file tree · subagent', 'add projector/renderer only for distinct semantics; use cross-event assembly only for real multi-record lifecycles'],
]

const invariants = [
  ['1,000,000+', 'addressable logical messages'], ['~2,048', 'hot messages/runtime'], ['≤ 4,096', 'projection cache entries'],
  ['≤ 3', 'hot runtimes'], ['≥ 4', 'simultaneous working kernels scenario'], ['< 180', 'mounted rows'],
  ['< 4 px', 'normal anchor drift budget'], ['0 px', 'virtual wrapper block decoration'],
]

const failures = [
  ['14.015625px overlap', 'Padding lived on the virtualizer measured wrapper.', 'Measured wrapper is geometry-pure; product spacing belongs inside NodeSeat.'],
  ['+1023 reader drift', 'Reader was derived from hot-window/physical probe state.', 'Reader is semantic state; physical scroll callbacks may write it only for explicit user navigation.'],
  ['False jump commit', 'Requested target was written to reader before a stable physical row existed.', 'Runtime jump only rebases the hot window; viewport commits reader after stable visible measurement.'],
  ['Overlapping Jump / Latest', 'An earlier async Latest could finish after a newer explicit Jump.', 'Programmatic navigation is latest-wins; stale transactions lose write authority and resize reconciliation queues behind them.'],
  ['False measurement-probe anchor', 'Mounted DOM was treated as committed viewport truth.', 'Anchor candidates are filtered through semantic reader policy.'],
  ['Responsive anchor disappeared', 'Programmatic jump committed an anchor before virtualizer measurement converged.', 'Explicit navigation waits for stable measurement frames before committing its semantic anchor.'],
  ['124px tail gap after composer growth', 'Virtualizer viewportSize briefly lagged the real CSS-grid scroll container.', 'Bottom detection uses physical scroll geometry; tail pin scrolls past max and lets the real container clamp.'],
  ['575px responsive drift', 'A giant partially visible row and later layout scroll could replace the intended anchor.', 'Choose the row nearest the viewport edge and freeze the committed anchor across a reflow transaction.'],
  ['Long Markdown CPU growth', 'Stable DOM chunks still came from re-scanning the whole growing source.', 'Streaming emits a semantic append patch; ProjectionEngine re-chunks only mutable tail + delta.'],
  ['Unbounded disclosure memory', 'Renderer fold state outlived rows with no retention policy.', 'Only touched disclosures are retained and the preference map is LRU-bounded.'],
  ['Phone lost Recent sessions', 'Breakpoint CSS removed a product capability.', 'Narrow layout moves Recent into a drawer; capability remains available.'],
]
</script>

<template>
  <main class="architecture-page" data-testid="architecture-page">
    <header class="architecture-nav">
      <a class="architecture-brand" href="#architecture"><span>N</span> Agent Conversation Framework</a>
      <nav><a href="#state">State</a><a href="#contracts">Contracts</a><a href="#efficiency">Efficiency</a><a href="#evidence">Evidence</a><a class="launch-lab" href="#lab" data-testid="launch-lab">Open lab →</a></nav>
    </header>

    <section class="architecture-hero">
      <div class="hero-copy">
        <span class="architecture-kicker">reference template · executable local + Pages proof</span>
        <h1>Scale the <em>conversation model and lifetimes</em>, not only the scroll list.</h1>
        <p>A production Agent workspace has independent histories, background executions, heterogeneous outputs, resumable Turns and unstable physical heights. The template makes ownership, stable identity and discardability explicit before Vue or a virtualizer is involved.</p>
        <div class="hero-actions"><a class="primary-link" href="#lab">Exercise the framework</a><a class="secondary-link" href="https://github.com/topabomb/demo1/blob/main/docs/agent-workspace-reference-architecture.md">Read canonical architecture</a></div>
      </div>
      <div class="hero-proof"><span>Normal hot path</span><strong>O(changed + hot + visible)</strong><p>Total history and cold-session count must not enter streaming, rendering or scrolling complexity.</p><div><b>Provider-neutral model</b><b>Stable business identity</b><b>Semantic viewport</b><b>Replaceable UI</b></div></div>
    </section>

    <section class="architecture-section">
      <header class="section-heading"><span>00 · Physical ownership</span><h2>Engine and Demo are separate source products, not comments inside one tree</h2><p>The repository can be read and extracted by ownership: reusable implementation points inward; the executable proof depends on it from outside.</p></header>
      <div class="invariant-grid state-grid"><article v-for="entry in ownership" :key="entry[0]"><strong>{{ entry[0] }}</strong><span>{{ entry[1] }}</span><p>{{ entry[2] }}</p></article></div>
      <div class="workspace-band"><span>Enforced dependency</span><strong>Demo → Engine · never Engine → Demo</strong><p>Architecture tests reject legacy parallel roots and prevent synthetic playback telemetry from leaking back into Engine contracts.</p></div>
    </section>

    <section id="state" class="architecture-section">
      <header class="section-heading"><span>01 · State taxonomy</span><h2>Four state lifetimes answer one question: what is safe to throw away?</h2><p>A store boundary is correct only when its lifetime matches the truth it owns.</p></header>
      <div class="invariant-grid state-grid">
        <article v-for="entry in stateClasses" :key="entry[0]"><strong>{{ entry[0] }}</strong><span>{{ entry[1] }}</span><p>{{ entry[2] }}</p></article>
      </div>
      <div class="workspace-band"><span>Critical separation</span><strong>Running SessionKernel ≠ hot Projection Runtime ≠ mounted viewport</strong><p>Many Agents may execute asynchronously while only the active/recent few allocate heavyweight presentation state.</p></div>
    </section>

    <section id="contracts" class="architecture-section">
      <header class="section-heading"><span>02 · Dependency direction</span><h2>Seven contracts, with dependencies pointing outward only</h2><p>Canonical model knows nothing about presentation. Session semantics know nothing about Vue. Viewport policy knows keys/indexes/geometry, not Markdown or CSS.</p></header>
      <div class="layer-stack">
        <article v-for="layer in contracts" :key="layer[0]" class="layer-card">
          <div class="layer-number">{{ layer[0] }}</div>
          <div class="layer-main"><div class="layer-title"><h3>{{ layer[1] }}</h3><span>{{ layer[2] }}</span></div><p>{{ layer[3] }}</p></div>
          <div class="layer-rule"><span>Invariant</span><strong>{{ layer[4] }}</strong></div>
        </article>
      </div>
    </section>

    <section class="architecture-section">
      <header class="section-heading"><span>03 · DeepSeek Harness lessons</span><h2>Borrow invariants by scenario, not a general plugin runtime</h2><p>Harness is a broader Agent runtime. demo1 only absorbs the identity, replay and publication rules that directly improve a conversation client.</p></header>
      <div class="scenario-table"><div v-for="row in harnessLessons" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}<small style="display:block;margin-top:4px;opacity:.6">{{ row[1] }}</small></strong><span>{{ row[2] }}</span></div></div>
    </section>

    <section id="efficiency" class="architecture-section split-section">
      <div>
        <header class="section-heading compact"><span>04 · Projection path</span><h2>Canonical content is not a component tree</h2></header>
        <div class="code-diagram"><pre>Backend / execution events
        │
        ▼
LogicalMessage
├─ turnId / stepId?
└─ ContentBlock[]
        │
        ▼
ProjectionEngine
├─ projector registry
├─ bounded message LRU
└─ incremental reasoning + Markdown tail
        │
        ▼
order[] + keyed RenderUnit map
        │
        ▼
Semantic Viewport
requested navigation → committed reader
        │
        ▼
ViewportNavigationController + Physical List
        │
        ▼
Renderer Registry</pre></div>
      </div>
      <div>
        <header class="section-heading compact"><span>05 · Hot-path budgets</span><h2>Complexity is part of the contract</h2></header>
        <div class="scenario-table"><div v-for="row in hotPaths" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}<small style="display:block;margin-top:4px;opacity:.65">{{ row[1] }}</small></strong><span>{{ row[2] }}</span></div></div>
      </div>
    </section>

    <section class="architecture-section">
      <header class="section-heading"><span>06 · Renderer protocol</span><h2>Semantic extensibility and physical containment are different responsibilities</h2></header>
      <div class="scenario-table"><div v-for="row in renderers" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}</strong><span>{{ row[1] }}<small style="display:block;margin-top:4px;opacity:.65">{{ row[2] }}</small></span></div></div>
    </section>

    <section class="architecture-section">
      <header class="section-heading"><span>07 · Product portability</span><h2>Responsive layout is a physical reflow transaction, not conversation state.</h2></header>
      <div class="workspace-band"><span>Desktop → tablet → phone</span><strong>freeze committed semantic anchor → product reflow → renderer/virtualizer measurement → restore the same coordinate</strong><p>Tables/code own internal overflow, attachments reserve intrinsic media ratios, Recent moves into a drawer, and the composer consumes layout space instead of overlaying history.</p></div>
    </section>

    <section id="evidence" class="architecture-section">
      <header class="section-heading"><span>08 · Executable evidence</span><h2>The template is defined by falsifiable invariants</h2><p>Diagnostics expose both product behavior and projection economics; local production and public Pages run the same Chromium scenarios.</p></header>
      <div class="invariant-grid"><article v-for="entry in invariants" :key="entry[1]"><strong>{{ entry[0] }}</strong><span>{{ entry[1] }}</span></article></div>
      <div class="scenario-table"><div class="scenario-head"><span>Failure found in practice</span><span>Permanent framework correction</span></div><div v-for="row in failures" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}<small style="display:block;margin-top:4px;opacity:.6">{{ row[1] }}</small></strong><span>{{ row[2] }}</span></div></div>
    </section>

    <section class="architecture-cta"><div><span>Reference implementation</span><h2>Do not trust the diagram—break the lab.</h2><p>Open Agent scenarios for uploads/image generation/TTS/ASR, switch background Agents, jump through million-message history, resize the composer/viewport, expand tools/reasoning, and watch projection counters while the LLM tail grows.</p></div><a href="#lab">Open interactive lab →</a></section>
  </main>
</template>
