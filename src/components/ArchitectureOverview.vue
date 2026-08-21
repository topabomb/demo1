<script setup lang="ts">
const layers = [
  {
    step: '01',
    name: 'Backend Adapter',
    life: 'backend lifetime',
    tone: 'blue',
    owns: 'Protocol translation, paging, canonical event ingestion',
    rule: 'No OpenCode / DSH / provider-native shape crosses this boundary.',
    api: 'ConversationBackend → Canonical LogicalMessage / Session event',
  },
  {
    step: '02',
    name: 'Conversation Engine',
    life: 'session lifetime',
    tone: 'purple',
    owns: 'Lightweight SessionKernel registry: execution, appended turns, queue, pending input, unread state',
    rule: 'Agent execution survives viewport navigation, Recent switching and hot-runtime eviction.',
    api: 'SessionKernel + ExecutionController + semantic session snapshot',
  },
  {
    step: '03',
    name: 'Projection Store',
    life: 'hot semantic lifetime',
    tone: 'green',
    owns: 'Disposable ConversationSessionRuntime: bounded history segment, stable RenderUnits and page indexes',
    rule: 'Many working sessions do not imply many heavyweight viewports; hot runtimes stay LRU-bounded.',
    api: 'order: NodeId[] + nodes: Map<NodeId, RenderUnit> + range ≈ 2,048 messages',
  },
  {
    step: '04',
    name: 'Viewport Controller',
    life: 'mounted physical lifetime',
    tone: 'orange',
    owns: 'Committed semantic viewport, dynamic measurement, physical scroll, anchor/follow and composer resize',
    rule: 'Mounted DOM is not viewport truth: measurement probes never become semantic anchors.',
    api: 'CommittedViewport → Virtua → Vue visible seats',
  },
]

const invariants = [
  ['1,000,000+', 'logical messages', 'addressable without eager framework state'],
  ['≥ 4', 'working kernels', 'background Agent runs may execute concurrently'],
  ['≤ 3', 'hot runtimes', 'heavy projection/viewports stay LRU-bounded'],
  ['~2,048', 'hot messages', 'bounded semantic working set per hot runtime'],
  ['< 180', 'mounted rows', 'DOM remains independent of total history'],
  ['< 4 px', 'anchor drift', 'prepend and composer-resize semantic budget'],
]

const scenarios = [
  ['Million history', 'paged backend → SessionKernel → bounded runtime → physical virtualizer'],
  ['Resume historical session', 'old history + new user turn + live assistant revision → persisted kernel state'],
  ['Multiple async Agents', 'many working SessionKernels → only active/recent sessions get hot runtimes'],
  ['Runtime eviction while working', 'destroy projection/runtime → execution continues → semantic rehydrate on return'],
  ['Queued follow-up', 'submit while working → session-owned queue → survives Recent switching'],
  ['Approval / question', 'pending interaction belongs to the session → blocks composer → survives eviction'],
  ['LLM streaming', 'kernel delta → changed canonical message → keyed RenderUnit patch only'],
  ['Long reply', 'one canonical assistant message → multiple bounded presentation chunks'],
  ['Latest', 'logical reader computes exact messages-after; no scrollbar approximation'],
  ['Growing composer', 'layout row resizes viewport; committed semantic anchor is reconciled'],
  ['Rich content', 'renderer registry isolates Markdown / tool / thinking / image / HTML / diff'],
]

const rejected = [
  ['Execution controller owns hot runtime', 'Running sessions became non-evictable, so concurrency broke the hot-runtime bound.'],
  ['“Completed history” is read-only', 'Real Agent sessions are resumable; historical data and execution state are separate concerns.'],
  ['1M reactive Message[]', 'DOM virtualization alone does not bound framework/store work.'],
  ['Backend message → component', 'Couples UX to one runtime protocol and prevents canonical projection semantics.'],
  ['DOM presence = navigation complete', 'Virtua can mount measurement probes before programmatic navigation commits.'],
  ['Any mounted row = viewport anchor', 'A temporary measurement probe was captured as the composer-resize anchor.'],
  ['Semantic reader = hot-window center', 'Produced repeatable +1023 restore drift for a 2048-message window.'],
  ['Decorated virtualizer wrapper', '7px + 7px wrapper padding produced a measured 14.015625px row overlap.'],
]
</script>

<template>
  <main class="architecture-page" data-testid="architecture-page">
    <header class="architecture-nav">
      <a class="architecture-brand" href="#architecture"><span>N</span> Agent Workspace Architecture Lab</a>
      <nav>
        <a href="#principles">Principles</a>
        <a href="#evidence">Evidence</a>
        <a class="launch-lab" href="#lab" data-testid="launch-lab">Open interactive lab →</a>
      </nav>
    </header>

    <section class="architecture-hero">
      <div class="hero-copy">
        <span class="architecture-kicker">v2 reference architecture · executable proof</span>
        <h1>Long Agent workspaces are <em>four lifecycles</em>, not one giant message list.</h1>
        <p>
          The reusable design separates backend semantics, lightweight session execution, bounded hot presentation state and ephemeral physical scrolling.
          A million-message conversation is only one case: the same architecture must support many asynchronous, resumable sessions without keeping a heavyweight viewport alive for each run.
        </p>
        <div class="hero-actions">
          <a class="primary-link" href="#lab">Run the multi-session 1M lab</a>
          <a class="secondary-link" href="https://github.com/topabomb/demo1/blob/feat/million-message-lab/docs/agent-workspace-architecture-v2.md">Read v2 design record</a>
        </div>
      </div>
      <div class="hero-proof">
        <span>Design target</span>
        <strong>O(kernels + hot + visible)</strong>
        <p>Execution scales with active sessions; rendering scales only with hot/visible content, never total history.</p>
        <div><b>Backend neutral</b><b>Resumable</b><b>Async safe</b><b>Dynamic height</b></div>
      </div>
    </section>

    <section id="principles" class="architecture-section">
      <header class="section-heading">
        <span>01 · Ownership model</span>
        <h2>The reusable abstraction</h2>
        <p>Every layer has a distinct lifetime and source of truth. The critical v2 split is SessionKernel versus disposable hot runtime.</p>
      </header>

      <div class="layer-stack">
        <article v-for="layer in layers" :key="layer.step" class="layer-card" :class="`tone-${layer.tone}`">
          <div class="layer-number">{{ layer.step }}</div>
          <div class="layer-main">
            <div class="layer-title"><h3>{{ layer.name }}</h3><span>{{ layer.life }}</span></div>
            <p>{{ layer.owns }}</p>
            <code>{{ layer.api }}</code>
          </div>
          <div class="layer-rule"><span>Invariant</span><strong>{{ layer.rule }}</strong></div>
        </article>
      </div>

      <div class="workspace-band">
        <span>Workspace scope</span>
        <strong>Recent descriptors + lightweight SessionKernels + semantic snapshots + ≤3 hot runtimes</strong>
        <p>Ten background runs may remain alive while only the active/recent viewport projections consume heavyweight rendering state.</p>
      </div>
    </section>

    <section class="architecture-section split-section">
      <div>
        <header class="section-heading compact"><span>02 · Session economy</span><h2>Execution outlives rendering</h2></header>
        <div class="code-diagram"><pre>Session registry
├─ A  working ───────────────┐
├─ B  idle                   │ lightweight
├─ C  needs approval         │ session state
├─ D  working ───────────────┘
│
│ activate / recent LRU
▼
Hot ConversationRuntime ≤ 3
├─ bounded logical segment
├─ keyed RenderUnit projection
└─ page / height indexes
        │
        ▼
Committed semantic viewport
        │
        ▼
Virtua + Vue rows</pre></div>
      </div>
      <div>
        <header class="section-heading compact"><span>03 · Coordinate economy</span><h2>Three truths, not one scrollTop</h2></header>
        <div class="coordinate-card">
          <div><span>Logical session</span><strong>0 … 999,999+</strong><small>backend/kernel coordinates</small></div><i>⇅</i>
          <div><span>Semantic hot window</span><strong>~2,048 messages</strong><small>projection coordinates</small></div><i>⇅</i>
          <div><span>Committed viewport</span><strong>~20–100 rows</strong><small>visible semantic rows; probes excluded</small></div>
        </div>
      </div>
    </section>

    <section id="evidence" class="architecture-section">
      <header class="section-heading"><span>04 · Executable invariants</span><h2>What the reference implementation must prove</h2></header>
      <div class="invariant-grid">
        <article v-for="entry in invariants" :key="entry[1]"><strong>{{ entry[0] }}</strong><span>{{ entry[1] }}</span><p>{{ entry[2] }}</p></article>
      </div>
      <div class="scenario-table">
        <div class="scenario-head"><span>Product scenario</span><span>Architecture path under test</span></div>
        <div v-for="scenario in scenarios" :key="scenario[0]" class="scenario-row"><strong>{{ scenario[0] }}</strong><span>{{ scenario[1] }}</span></div>
      </div>
    </section>

    <section class="architecture-section">
      <header class="section-heading"><span>05 · Practice changed the design</span><h2>Rejected approaches</h2><p>Failures are part of the result: each one tightened a reusable invariant.</p></header>
      <div class="rejected-list"><article v-for="item in rejected" :key="item[0]"><strong>{{ item[0] }}</strong><p>{{ item[1] }}</p></article></div>
    </section>

    <section class="architecture-cta">
      <div><span>Reference implementation</span><h2>Inspect the Agent workflow, not just the diagram.</h2><p>Run several sessions, queue work, resolve approval, resume old history, evict active runs, grow the composer and verify the million-message viewport stays bounded.</p></div>
      <a href="#lab">Open interactive lab →</a>
    </section>
  </main>
</template>
