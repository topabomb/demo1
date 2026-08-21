<script setup lang="ts">
const layers = [
  ['01', 'Backend Adapter', 'protocol lifetime', 'Provider paging, cursors and event normalization.', 'Provider-native shapes stop here.'],
  ['02', 'Session Kernel', 'session / execution lifetime', 'Turns, run, queue, blockers, unread, last outcome and durable usage.', 'Execution survives every viewport.'],
  ['03', 'Content Projector Registry', 'presentation semantics', 'Extensible ContentBlock[] becomes bounded stable RenderUnit[].', 'New semantic outputs do not modify store or scroll code.'],
  ['04', 'Hot Projection Runtime', 'hot semantic lifetime', '~2K logical messages, stable order + keyed nodes, indexes.', 'Many sessions never imply many heavy runtimes.'],
  ['05', 'Semantic Viewport Policy', 'interaction lifetime', 'Reader, Latest, anchor, follow and restoration.', 'Mounted DOM is not semantic truth.'],
  ['06', 'Physical List Adapter', 'mounted lifetime', 'Virtua/Vue measurement, ResizeObserver and DOM row samples.', 'Replaceable; no session semantics.'],
  ['07', 'Renderer Registry + Product UI', 'replaceable presentation', 'Renderer components, containment, desktop/tablet/phone layout and theme.', 'Product design cannot become a state source.'],
]

const invariants = [
  ['1,000,000+', 'logical messages'], ['≥ 4', 'working kernels'], ['≤ 3', 'hot runtimes'],
  ['~2,048', 'hot messages/runtime'], ['< 180', 'mounted rows'], ['< 4 px', 'semantic anchor drift'],
  ['0 px', 'virtual wrapper block decoration'], ['2 registries', 'semantic projector + frontend renderer'],
]

const renderers = [
  ['Markdown', 'GFM, tasks, tables, fences, HTML sanitization, long documents', 'fence-safe ~6K chunks + bounded HTML cache'],
  ['Reasoning', 'collapsed disclosure + tokens/duration', 'dynamic height is local presentation state'],
  ['Tool call/result', 'structured input/output and status', 'session semantics stay outside renderer'],
  ['Code / Diff', 'large source/patches', 'bounded line chunks + internal scroll; Shiki worker for code'],
  ['Image', 'known intrinsic dimensions', 'reserve aspect ratio; max-width 100%'],
  ['HTML / Artifact', 'sanitized rich output', 'contain overflow; never execute scripts'],
  ['Future types', 'citation / terminal / chart / file tree / subagent', 'register projector + renderer; no core/viewport changes'],
]

const failures = [
  ['14.015625px overlap', 'Product padding was placed on the virtualizer-owned measured wrapper.', 'Measured wrapper is geometry-pure; spacing belongs inside NodeSeat.'],
  ['+1023 reader drift', 'A semantic reader was treated as the center of a 2048 window.', 'Reader is authoritative application state; physical windows are disposable.'],
  ['False anchor from measurement probe', 'Mounted DOM was treated as committed viewport truth.', 'Anchor selection filters through semantic viewport policy.'],
  ['Old DOM row disappeared on Pages', 'DOM residency was used as persistence proof.', 'Canonical addressability is the persistence invariant.'],
  ['Unbalanced Markdown fence', 'Closing-fence line was separated during chunking.', 'Chunk boundary decisions use pre-line fence state.'],
  ['Long stream reparsed from byte 0', 'One giant mutable Markdown render unit.', 'Settled chunks have stable content revisions; only the tail invalidates.'],
  ['Phone lost Recent sessions', 'Responsive CSS removed the sidebar capability.', 'Narrow layout moves sessions into a drawer.'],
]
</script>

<template>
  <main class="architecture-page" data-testid="architecture-page">
    <header class="architecture-nav">
      <a class="architecture-brand" href="#architecture"><span>N</span> Agent Conversation Presentation Framework</a>
      <nav><a href="#contracts">Contracts</a><a href="#rendering">Rendering</a><a href="#evidence">Evidence</a><a class="launch-lab" href="#lab" data-testid="launch-lab">Open interactive lab →</a></nav>
    </header>

    <section class="architecture-hero">
      <div class="hero-copy">
        <span class="architecture-kicker">portable template · executable local + Pages proof</span>
        <h1>Model <em>session, content, projection, viewport and rendering</em> as different systems.</h1>
        <p>The experiment started as a million-message virtual list. Browser failures forced it into a broader framework: asynchronous resumable SessionKernels, heterogeneous canonical ContentBlocks, two extension registries, bounded keyed presentation, semantic viewport policy and replaceable responsive UI.</p>
        <div class="hero-actions"><a class="primary-link" href="#lab">Run the interactive lab</a><a class="secondary-link" href="https://github.com/topabomb/demo1/blob/feat/million-message-lab/docs/agent-workspace-reference-architecture.md">Read canonical architecture</a></div>
      </div>
      <div class="hero-proof"><span>Hot-path target</span><strong>O(changed + hot + visible)</strong><p>Total history, number of cold sessions and product layout are not normal render-loop inputs.</p><div><b>Backend neutral</b><b>Renderer extensible</b><b>Responsive</b><b>Async safe</b></div></div>
    </section>

    <section id="contracts" class="architecture-section">
      <header class="section-heading"><span>01 · Framework contracts</span><h2>Four lifecycles, seven ownership boundaries</h2><p>Only tiny adapter contracts connect durable semantic state to physical rendering.</p></header>
      <div class="layer-stack">
        <article v-for="layer in layers" :key="layer[0]" class="layer-card">
          <div class="layer-number">{{ layer[0] }}</div>
          <div class="layer-main"><div class="layer-title"><h3>{{ layer[1] }}</h3><span>{{ layer[2] }}</span></div><p>{{ layer[3] }}</p></div>
          <div class="layer-rule"><span>Invariant</span><strong>{{ layer[4] }}</strong></div>
        </article>
      </div>
    </section>

    <section id="rendering" class="architecture-section split-section">
      <div>
        <header class="section-heading compact"><span>02 · Canonical presentation</span><h2>One message may contain many block types</h2></header>
        <div class="code-diagram"><pre>LogicalMessage
└─ ContentBlock[]
   ├─ reasoning
   ├─ markdown
   ├─ tool-call / tool-result
   ├─ code / diff
   ├─ image / html
   └─ future extension
        │
        ▼
Content Projector Registry
        │ bounded stable IDs
        ▼
RenderUnit[]
        │
        ▼
Keyed Projection Store
        │
        ▼
Renderer Registry</pre></div>
      </div>
      <div>
        <header class="section-heading compact"><span>03 · Renderer contracts</span><h2>Extensible semantics, contained physical output</h2></header>
        <div class="scenario-table"><div v-for="row in renderers" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}</strong><span>{{ row[1] }}<small style="display:block;margin-top:4px;opacity:.65">{{ row[2] }}</small></span></div></div>
      </div>
    </section>

    <section class="architecture-section">
      <header class="section-heading"><span>04 · Responsive contract</span><h2>Width changes remeasure presentation; they do not change conversation state.</h2></header>
      <div class="workspace-band"><span>Desktop → tablet → phone</span><strong>Committed semantic anchor → renderer reflow → physical measurement → semantic reconciliation</strong><p>Markdown tables/code scroll inside their renderer, images retain intrinsic ratio, Recent moves into a drawer, and page-level horizontal overflow remains zero.</p></div>
    </section>

    <section id="evidence" class="architecture-section">
      <header class="section-heading"><span>05 · Executable invariants</span><h2>The framework is a set of falsifiable constraints</h2></header>
      <div class="invariant-grid"><article v-for="entry in invariants" :key="entry[1]"><strong>{{ entry[0] }}</strong><span>{{ entry[1] }}</span></article></div>
      <div class="scenario-table"><div class="scenario-head"><span>Failure found in practice</span><span>Permanent architecture correction</span></div><div v-for="row in failures" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}<small style="display:block;margin-top:4px;opacity:.6">{{ row[1] }}</small></strong><span>{{ row[2] }}</span></div></div>
    </section>

    <section class="architecture-cta"><div><span>Reference implementation</span><h2>Inject heterogeneous Turns at runtime, then resize the product.</h2><p>The lab appends canonical mixed Turns and a Markdown compatibility gallery through SessionKernel—not DOM mocks—then validates the same source tree on local Chromium and deployed GitHub Pages.</p></div><a href="#lab">Open interactive lab →</a></section>
  </main>
</template>
