<script setup lang="ts">
const layers = [
  {
    step: '01', name: 'Backend Adapter', life: 'protocol lifetime', tone: 'blue',
    owns: 'Protocol translation, paging, canonical event ingestion and provider capability mapping.',
    rule: 'No OpenCode / DSH / provider-native shape crosses into the core session model.',
    api: 'ConversationBackend → canonical message/event stream',
  },
  {
    step: '02', name: 'Session Kernel', life: 'session / execution lifetime', tone: 'purple',
    owns: 'Execution, appended turns, queue, blockers, unread attention, last-turn outcome and durable usage/context projections.',
    rule: 'A session remains resumable and may keep running even with no hot viewport runtime.',
    api: 'SessionKernel + ExecutionController + immutable summary projection',
  },
  {
    step: '03', name: 'Hot Projection Runtime', life: 'hot semantic lifetime', tone: 'green',
    owns: 'Bounded logical segment, stable keyed RenderUnits, page-height index and semantic reader snapshot.',
    rule: 'Many sessions/runs never imply many heavyweight projections; the hot cache is independently bounded.',
    api: 'order: NodeId[] + nodes: Map<NodeId, RenderUnit> + ~2,048 logical messages',
  },
  {
    step: '04', name: 'Semantic Viewport Policy', life: 'framework-neutral interaction lifetime', tone: 'orange',
    owns: 'Committed reader, messages-after, anchors, follow intent, end semantics and restoration budgets.',
    rule: 'Mounted DOM is not semantic truth; measurement probes and raw scrollTop never become application state.',
    api: 'PhysicalListPort + row samples → committed semantic viewport',
  },
  {
    step: '05', name: 'Virtualizer / Framework Adapter', life: 'mounted physical lifetime', tone: 'blue',
    owns: 'Virtua/Vue handles, ResizeObserver, DOM geometry sampling and renderer mounting.',
    rule: 'Replaceable adapter translates physical measurements; it does not own session semantics.',
    api: 'Virtua VList ↔ PhysicalListPort ↔ NodeSeat',
  },
  {
    step: '06', name: 'Product UI / CSS', life: 'replaceable presentation', tone: 'purple',
    owns: 'Sidebar width, colors, typography, message style, row gap, composer limits, labels and icons.',
    rule: 'Product CSS may change freely except for the tiny documented virtualizer geometry contract.',
    api: 'Reference theme variables + renderer components',
  },
]

const invariants = [
  ['1,000,000+', 'logical messages', 'addressable without eager framework state'],
  ['≥ 4', 'working kernels', 'background Agent runs may execute concurrently'],
  ['≤ 3', 'hot runtimes', 'heavy projection/viewports stay LRU-bounded'],
  ['~2,048', 'hot messages', 'bounded semantic working set per hot runtime'],
  ['< 180', 'mounted rows', 'DOM remains independent of total history'],
  ['< 4 px', 'anchor drift', 'prepend and composer-resize semantic budget'],
  ['0 px', 'wrapper block decoration', 'virtualizer-owned measured boxes stay geometry-pure'],
]

const sessionSemantics = [
  ['Live execution', 'idle · working · waiting · interrupted', 'What the session is doing now.'],
  ['Last turn result', 'completed · aborted · blocked · error · max-tokens · interrupted', 'Why the most recently settled turn ended; a failure never makes history non-resumable.'],
  ['Blocker', 'approval · question', 'Session-owned pending human input; survives switching and runtime eviction.'],
  ['Attention', 'unread + queued follow-ups', 'Workspace-level routing state independent of viewport mounting.'],
  ['Durable LLM stats', 'input · output · cache read/write · reasoning · context', 'Whole-session projections; never folded from the current 2K hot window.'],
]

const separation = [
  ['Core algorithm', 'SessionKernel, SegmentManager, keyed projection, semantic reader/messages-after, anchor selection, follow state', 'No Vue, Virtua, selectors, colors or layout widths'],
  ['Physical adapter', 'VList handle, ResizeObserver, DOM row sampling, buffer/item-size hints', 'May be replaced by another virtualizer/framework'],
  ['Required CSS contract', 'scroll stage can shrink; VList fills it; measured wrapper has zero vertical margin/padding', 'Tiny non-negotiable geometry boundary'],
  ['Reference product theme', 'sidebar/content width, row gap, composer 56–180px, colors, bubbles, icons, diagnostics placement', 'Fully replaceable without changing semantic algorithms'],
]

const scenarios = [
  ['Million history', 'paged backend → SessionKernel → bounded projection → physical adapter'],
  ['Resume after failure', 'lastTurn=error remains history metadata → new prompt starts a new working turn'],
  ['Multiple async Agents', 'many working SessionKernels → only active/recent sessions get hot runtimes'],
  ['Runtime eviction while working', 'destroy projection/runtime → execution continues → semantic rehydrate on return'],
  ['Queued follow-up', 'submit while working → session-owned queue → survives Recent switching'],
  ['Approval / question', 'blocker belongs to session → blocks composer → survives eviction'],
  ['Usage / cache', 'provider-neutral usage events → durable kernel projection → sidebar/composer stats'],
  ['LLM streaming', 'kernel delta → changed canonical message → keyed RenderUnit patch only'],
  ['Long reply', 'one canonical assistant message → bounded presentation chunks'],
  ['Latest', 'logical reader computes exact messages-after; no scrollbar approximation'],
  ['Growing composer', 'product layout changes viewport size → semantic anchor policy reconciles it'],
  ['Theme/layout swap', 'CSS variables change width/gap/composer cap → semantic and geometry gates remain green'],
]

const rejected = [
  ['Execution controller owns hot runtime', 'Running sessions became non-evictable, so concurrency broke the hot-runtime bound.'],
  ['“Completed history” is read-only', 'Real Agent sessions are resumable; historical data and current execution are separate concerns.'],
  ['One status string means everything', 'Working/blocked/failed/completed describe different dimensions; live execution and turn outcome must be separate.'],
  ['Viewport-derived token totals', 'Paging/compaction changes the window; usage/cache/context must be durable whole-session projections.'],
  ['1M reactive Message[]', 'DOM virtualization alone does not bound framework/store work.'],
  ['Backend message → component', 'Couples UX to one runtime protocol and prevents canonical projection semantics.'],
  ['DOM presence = navigation complete', 'Virtua can mount measurement probes before programmatic navigation commits.'],
  ['Any mounted row = viewport anchor', 'A temporary measurement probe was captured as the composer-resize anchor.'],
  ['Semantic reader = hot-window center', 'Produced repeatable +1023 restore drift for a 2048-message window.'],
  ['Decorated virtualizer wrapper', '7px + 7px wrapper padding produced a measured 14.015625px row overlap.'],
  ['DOM residency = persistence', 'A slower public deployment correctly evicted an older user row while canonical history remained intact.'],
]
</script>

<template>
  <main class="architecture-page" data-testid="architecture-page">
    <header class="architecture-nav">
      <a class="architecture-brand" href="#architecture"><span>N</span> Agent Workspace Reference Architecture</a>
      <nav><a href="#principles">Boundaries</a><a href="#semantics">Semantics</a><a href="#evidence">Evidence</a><a class="launch-lab" href="#lab" data-testid="launch-lab">Open interactive lab →</a></nav>
    </header>

    <section class="architecture-hero">
      <div class="hero-copy">
        <span class="architecture-kicker">portable template · executable browser proof</span>
        <h1>Long Agent workspaces need <em>separate ownership boundaries</em>, not one giant message component.</h1>
        <p>The reusable design separates provider protocol, durable session execution, bounded semantic projection, framework-neutral viewport policy, physical virtualizer integration and replaceable product styling.</p>
        <div class="hero-actions"><a class="primary-link" href="#lab">Run the multi-session 1M lab</a><a class="secondary-link" href="https://github.com/topabomb/demo1/blob/feat/million-message-lab/docs/agent-workspace-reference-architecture.md">Read canonical architecture</a></div>
      </div>
      <div class="hero-proof"><span>Hot-path target</span><strong>O(changed + hot + visible)</strong><p>Total historical messages do not enter normal render/update complexity.</p><div><b>Backend neutral</b><b>Framework portable</b><b>Async safe</b><b>Theme replaceable</b></div></div>
    </section>

    <section id="principles" class="architecture-section">
      <header class="section-heading"><span>01 · Ownership</span><h2>Six boundaries, four independent lifetimes</h2><p>The first four define the reusable architecture. The last two are adapters/presentation and can be replaced.</p></header>
      <div class="layer-stack"><article v-for="layer in layers" :key="layer.step" class="layer-card" :class="`tone-${layer.tone}`"><div class="layer-number">{{ layer.step }}</div><div class="layer-main"><div class="layer-title"><h3>{{ layer.name }}</h3><span>{{ layer.life }}</span></div><p>{{ layer.owns }}</p><code>{{ layer.api }}</code></div><div class="layer-rule"><span>Invariant</span><strong>{{ layer.rule }}</strong></div></article></div>
      <div class="workspace-band"><span>Workspace scope</span><strong>Recent summaries + lightweight SessionKernels + semantic snapshots + independently bounded hot runtime LRU</strong><p>Ten background runs may remain alive while only the active/recent projections consume heavyweight rendering state.</p></div>
    </section>

    <section id="semantics" class="architecture-section">
      <header class="section-heading"><span>02 · Session semantics</span><h2>Do not collapse execution, outcome, blockers and statistics into one status.</h2><p>The vocabulary follows DSH-compatible concepts while remaining provider-neutral.</p></header>
      <div class="scenario-table semantic-table"><div class="scenario-head"><span>Dimension</span><span>Portable vocabulary and ownership</span></div><div v-for="row in sessionSemantics" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}</strong><span><b>{{ row[1] }}</b> — {{ row[2] }}</span></div></div>
    </section>

    <section class="architecture-section split-section">
      <div><header class="section-heading compact"><span>03 · Store economy</span><h2>Execution outlives rendering</h2></header><div class="code-diagram"><pre>Session registry
├─ A  working ───────────────┐
├─ B  completed              │ lightweight
├─ C  blocked: approval      │ durable state
├─ D  failed last turn       │
├─ E  working ───────────────┘
│
│ activate / recent LRU
▼
Hot ConversationRuntime ≤ 3
├─ ~2,048 logical messages
├─ stable keyed projection
└─ page / height indexes
        │
        ▼
Semantic viewport policy
        │
        ▼
Virtua/Vue adapter → product UI</pre></div></div>
      <div><header class="section-heading compact"><span>04 · Style independence</span><h2>Algorithm is not CSS</h2></header><div class="scenario-table"><div v-for="row in separation" :key="row[0]" class="scenario-row"><strong>{{ row[0] }}</strong><span>{{ row[1] }}<small style="display:block;margin-top:4px;opacity:.65">{{ row[2] }}</small></span></div></div></div>
    </section>

    <section id="evidence" class="architecture-section">
      <header class="section-heading"><span>05 · Executable invariants</span><h2>What the template must prove</h2></header>
      <div class="invariant-grid"><article v-for="entry in invariants" :key="entry[1]"><strong>{{ entry[0] }}</strong><span>{{ entry[1] }}</span><p>{{ entry[2] }}</p></article></div>
      <div class="scenario-table"><div class="scenario-head"><span>Product scenario</span><span>Architecture path under test</span></div><div v-for="scenario in scenarios" :key="scenario[0]" class="scenario-row"><strong>{{ scenario[0] }}</strong><span>{{ scenario[1] }}</span></div></div>
    </section>

    <section class="architecture-section"><header class="section-heading"><span>06 · Practice changed the design</span><h2>Rejected approaches</h2><p>Failures are preserved as architectural evidence, not hidden by looser tests.</p></header><div class="rejected-list"><article v-for="item in rejected" :key="item[0]"><strong>{{ item[0] }}</strong><p>{{ item[1] }}</p></article></div></section>

    <section class="architecture-cta"><div><span>Reference implementation</span><h2>Change the layout and exercise real session states.</h2><p>Run several sessions, resume a failed one, resolve approval/question blockers, inspect token/cache projections, resize the composer and verify the million-message viewport remains bounded.</p></div><a href="#lab">Open interactive lab →</a></section>
  </main>
</template>
