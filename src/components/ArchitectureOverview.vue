<script setup lang="ts">
const layers = [
  {
    step: '01',
    name: 'Backend Adapter',
    life: 'backend lifetime',
    tone: 'blue',
    owns: 'Protocol translation, paging, event ingestion',
    rule: 'No OpenCode / DSH / provider shape crosses this boundary.',
    api: 'ConversationBackend → CanonicalEvent / LogicalMessage',
  },
  {
    step: '02',
    name: 'Conversation Engine',
    life: 'session lifetime',
    tone: 'purple',
    owns: 'Execution state, logical history, async live tail, semantic snapshots',
    rule: 'Agent execution survives viewport navigation and Recent switching.',
    api: 'SessionExecution + ConversationHistory + ViewportSnapshot',
  },
  {
    step: '03',
    name: 'Projection Store',
    life: 'hot semantic window',
    tone: 'green',
    owns: 'bounded RenderUnits, stable order, keyed node revisions',
    rule: 'Streaming patches one node; unchanged order and sibling identities remain stable.',
    api: 'order: NodeId[] + nodes: Map<NodeId, RenderUnit>',
  },
  {
    step: '04',
    name: 'Viewport Controller',
    life: 'mounted viewport',
    tone: 'orange',
    owns: 'dynamic measurement, physical scroll, anchor, follow, composer resize',
    rule: 'Physical DOM and scroll coordinates never represent the full logical history.',
    api: 'Virtua + semantic anchor + reader intent state machine',
  },
]

const invariants = [
  ['1,000,000', 'logical messages', 'addressable, never eagerly reactive'],
  ['2,048', 'hot messages', 'bounded semantic working set'],
  ['512', 'shift batch', 'only incoming slice is projected'],
  ['< 180', 'mounted rows', 'DOM bounded independently of history'],
  ['< 4 px', 'anchor drift', 'prepend and composer-resize budget'],
  ['3', 'hot viewports', 'workspace LRU; cold sessions rehydrate semantically'],
]

const scenarios = [
  ['Million history', 'paged logical source → hot semantic window → physical virtualizer'],
  ['LLM streaming', 'session execution → one keyed node patch → one NodeSeat update'],
  ['Long reply', 'one logical message → multiple bounded RenderUnits'],
  ['Recent switch', 'save semantic snapshot → unmount viewport → activate independent scope'],
  ['Async background run', 'execution remains session-owned while viewport is absent'],
  ['Latest', 'logical reader position computes exact messages-after; no scrollbar approximation'],
  ['Growing composer', 'layout row resizes viewport; tail re-pins or history anchor is preserved'],
  ['Rich content', 'renderer registry isolates Markdown / tool / thinking / image / HTML / diff'],
]

const rejected = [
  ['1M reactive Message[]', 'DOM virtualization alone does not bound framework/store work.'],
  ['Backend message → component', 'Couples UX to OpenCode/DSH protocol and destroys reusable projection semantics.'],
  ['Fixed 2048 replace + stale virtualizer cache', 'Far jumps reused unrelated height measurements and produced real drift.'],
  ['Manual scrollTop as source of truth', 'Dynamic measurement, programmatic follow and user intent become competing authorities.'],
  ['Component-owned execution', 'Reading history or switching Recent could accidentally stop/reset a running Agent.'],
]
</script>

<template>
  <main class="architecture-page" data-testid="architecture-page">
    <header class="architecture-nav">
      <a class="architecture-brand" href="#architecture"><span>N</span> Conversation Architecture Lab</a>
      <nav>
        <a href="#principles">Principles</a>
        <a href="#evidence">Evidence</a>
        <a class="launch-lab" href="#lab" data-testid="launch-lab">Open interactive lab →</a>
      </nav>
    </header>

    <section class="architecture-hero">
      <div class="hero-copy">
        <span class="architecture-kicker">Reference architecture · browser verified</span>
        <h1>Long Agent conversations are <em>four lifecycles</em>, not one message list.</h1>
        <p>
          The architecture separates backend semantics, asynchronous Agent execution, bounded presentation state and ephemeral physical scrolling.
          The Vue/Virtua demo is only a reference implementation used to prove these boundaries under one million heterogeneous messages.
        </p>
        <div class="hero-actions">
          <a class="primary-link" href="#lab">Run the 1M-message UX lab</a>
          <a class="secondary-link" href="https://github.com/topabomb/demo1/blob/feat/million-message-lab/docs/agent-conversation-architecture-lab.md">Read design record</a>
        </div>
      </div>
      <div class="hero-proof">
        <span>Design target</span>
        <strong>O(hot + visible)</strong>
        <p>Rendering and interaction cost must not scale with total conversation length.</p>
        <div><b>Backend neutral</b><b>Framework thin</b><b>Async safe</b><b>Dynamic height</b></div>
      </div>
    </section>

    <section id="principles" class="architecture-section">
      <header class="section-heading">
        <span>01 · Ownership model</span>
        <h2>The reusable abstraction</h2>
        <p>Every layer has one lifetime, one source of truth and a narrow contract.</p>
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
        <strong>Recent descriptors + semantic snapshots + bounded hot-session LRU</strong>
        <p>Recent can contain many conversations. Only mounted/hot viewports are expensive; session identity and restore state remain lightweight.</p>
      </div>
    </section>

    <section class="architecture-section split-section">
      <div>
        <header class="section-heading compact">
          <span>02 · Data economy</span>
          <h2>Stable keyed projection</h2>
        </header>
        <div class="code-diagram">
          <pre>CanonicalEvent
      │
      ▼
Conversation Engine
      │  incremental mutation
      ▼
┌─────────────────────────────┐
│ order: [A, B, C, D, E]      │
│ nodes: Map&lt;NodeId, Node&gt;    │
└─────────────────────────────┘
                 │
stream delta ────┴──► patch(E)
                       │
                       ▼
                 NodeSeat(E)

order is unchanged · siblings do not update</pre>
        </div>
      </div>
      <div>
        <header class="section-heading compact">
          <span>03 · Physical economy</span>
          <h2>Two coordinate systems</h2>
        </header>
        <div class="coordinate-card">
          <div><span>Logical</span><strong>0 … 999,999</strong><small>backend/storage coordinates</small></div>
          <i>⇅</i>
          <div><span>Semantic hot window</span><strong>2,048 messages</strong><small>projection coordinates</small></div>
          <i>⇅</i>
          <div><span>Physical viewport</span><strong>~20–80 rows</strong><small>browser/Virtua coordinates</small></div>
        </div>
      </div>
    </section>

    <section id="evidence" class="architecture-section">
      <header class="section-heading">
        <span>04 · Executable invariants</span>
        <h2>What the demo must prove</h2>
      </header>
      <div class="invariant-grid">
        <article v-for="entry in invariants" :key="entry[1]">
          <strong>{{ entry[0] }}</strong><span>{{ entry[1] }}</span><p>{{ entry[2] }}</p>
        </article>
      </div>

      <div class="scenario-table">
        <div class="scenario-head"><span>Product scenario</span><span>Architecture path under test</span></div>
        <div v-for="scenario in scenarios" :key="scenario[0]" class="scenario-row"><strong>{{ scenario[0] }}</strong><span>{{ scenario[1] }}</span></div>
      </div>
    </section>

    <section class="architecture-section">
      <header class="section-heading">
        <span>05 · Practice changed the design</span>
        <h2>Rejected approaches</h2>
        <p>The lab is useful only if failed implementations change the architecture.</p>
      </header>
      <div class="rejected-list">
        <article v-for="item in rejected" :key="item[0]"><strong>{{ item[0] }}</strong><p>{{ item[1] }}</p></article>
      </div>
    </section>

    <section class="architecture-cta">
      <div><span>Reference implementation</span><h2>Inspect the UX, not just the diagram.</h2><p>Switch Recent sessions, stream at 60 Hz, jump to 500k, expand tools/thinking, grow the composer and verify Latest.</p></div>
      <a href="#lab">Open interactive lab →</a>
    </section>
  </main>
</template>
