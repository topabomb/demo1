import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const srcRoot = resolve(process.cwd(), 'src')
const engineRoot = join(srcRoot, 'engine')
const demoRoot = join(srcRoot, 'demo')
const engineLayers = ['core', 'model', 'conversation', 'presentation', 'viewport', 'runtime', 'vue', 'workers'] as const
const forbidden: Record<(typeof engineLayers)[number], ReadonlySet<string>> = {
  core: new Set(['model', 'conversation', 'presentation', 'viewport', 'runtime', 'vue', 'workers']),
  model: new Set(['conversation', 'presentation', 'viewport', 'runtime', 'vue', 'workers']),
  conversation: new Set(['presentation', 'viewport', 'runtime', 'vue', 'workers']),
  presentation: new Set(['conversation', 'viewport', 'runtime', 'vue', 'workers']),
  viewport: new Set(['conversation', 'presentation', 'runtime', 'vue', 'workers']),
  runtime: new Set(['vue', 'workers']),
  vue: new Set(['workers']),
  workers: new Set(['model', 'conversation', 'presentation', 'viewport', 'runtime', 'vue']),
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const file = join(dir, name)
    if (statSync(file).isDirectory()) return sourceFiles(file)
    return /\.(?:ts|vue)$/.test(name) ? [file] : []
  })
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const result: string[] = []
  const pattern = /(?:from\s*|import\s*)['"]([^'"]+)['"]/g
  for (const match of source.matchAll(pattern)) if (match[1]?.startsWith('.')) result.push(match[1])
  return result
}

function targetLayer(file: string, specifier: string): string | null {
  const target = resolve(dirname(file), specifier)
  const rel = relative(engineRoot, target)
  if (rel.startsWith('..')) return null
  return rel.split(sep)[0] ?? null
}

describe('engine architecture boundaries', () => {
  it('physically separates reusable Engine and executable Demo ownership', () => {
    expect(statSync(engineRoot).isDirectory()).toBe(true)
    expect(statSync(demoRoot).isDirectory()).toBe(true)
    const legacyRoots = ['core', 'model', 'conversation', 'presentation', 'viewport', 'runtime', 'vue', 'components', 'styles', 'workers']
    for (const name of legacyRoots) expect(() => statSync(join(srcRoot, name))).toThrow()
  })

  it('keeps every Engine relative import inside Engine and preserves dependency direction', () => {
    const violations: string[] = []
    for (const layer of engineLayers) {
      const root = join(engineRoot, layer)
      if (!statSync(root).isDirectory()) continue
      for (const file of sourceFiles(root)) {
        for (const specifier of importsOf(file)) {
          const target = resolve(dirname(file), specifier)
          if (relative(engineRoot, target).startsWith('..')) {
            violations.push(`${relative(srcRoot, file)} escapes engine -> ${specifier}`)
            continue
          }
          const targetName = targetLayer(file, specifier)
          if (targetName && forbidden[layer].has(targetName)) violations.push(`${relative(srcRoot, file)} -> ${specifier}`)
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })

  it('allows Demo to consume Engine while Engine never consumes Demo', () => {
    const engineSource = sourceFiles(engineRoot).map(file => readFileSync(file, 'utf8')).join('\n')
    expect(engineSource).not.toMatch(/(?:^|['"])\.\.\/(?:\.\.\/)*demo\//m)
    const demoSource = sourceFiles(demoRoot).map(file => readFileSync(file, 'utf8')).join('\n')
    expect(demoSource).toMatch(/\.\.\/(?:engine|\.\.\/engine)\//)
  })

  it('keeps the framework-neutral public entry small and free of adapter tuning details', () => {
    const source = readFileSync(join(engineRoot, 'index.ts'), 'utf8')
    expect(source).not.toMatch(/(?:demo|\.\/vue\/)/)
    expect(source).toContain('ConversationHistorySource')
    expect(source).toContain('InteractionResolution')
    expect(source).not.toMatch(/ConversationBackend|ConversationHistoryAdapter/)
    expect(source).not.toMatch(/SessionUiSnapshot|ShiftPlan|WINDOW_MESSAGES|SHIFT_MESSAGES/)
  })

  it('keeps the synchronous history contract honest about async IO ownership', () => {
    const contracts = readFileSync(join(engineRoot, 'conversation/contracts.ts'), 'utf8')
    const adapter = readFileSync(join(demoRoot, 'history-adapter.ts'), 'utf8')
    expect(contracts).toContain('export interface ConversationHistorySource')
    expect(contracts).toContain('async fetching and caching outside this')
    expect(contracts).not.toContain('interface ConversationBackend')
    expect(adapter).toContain('implements ConversationHistorySource')
    expect(adapter).toContain('async DB/network fetching stays')
  })

  it('never infers provider execution, blocker policy or Turn outcomes inside SessionKernel', () => {
    const contracts = readFileSync(join(engineRoot, 'conversation/contracts.ts'), 'utf8')
    const kernel = readFileSync(join(engineRoot, 'conversation/session-kernel.ts'), 'utf8')
    const runtime = readFileSync(join(engineRoot, 'runtime/session-runtime.ts'), 'utf8')
    const demoStream = readFileSync(join(demoRoot, 'stream-controller.ts'), 'utf8')
    const workspace = readFileSync(join(demoRoot, 'workspace-runtime.ts'), 'utf8')
    const turnReasonDeclaration = contracts.slice(
      contracts.indexOf('export type TurnEndReasonKind'),
      contracts.indexOf('export interface LlmFailure'),
    )

    expect(contracts).toContain("| { kind: 'question'; answer: string | null }")
    expect(contracts).toContain('activeAssistantIndex?: number | null')
    expect(turnReasonDeclaration).not.toContain("'blocked'")
    expect(kernel).toContain('descriptor.activeAssistantIndex')
    expect(kernel).not.toMatch(/(?:history|backend)\.count\s*-\s*1/)
    expect(kernel).toContain('requestInteraction(interaction: PendingInteraction)')
    expect(kernel).toContain('resolveInteraction(resolution: InteractionResolution)')
    expect(kernel).not.toContain('resolution.approved')
    expect(kernel).not.toContain('resolution.answer === null')
    expect(kernel).not.toContain('defaultTurnReason')
    expect(kernel).not.toContain('agent-loop')
    expect(kernel).not.toContain('estimateTokens')
    expect(runtime).not.toMatch(/streamTarget|liveChunkCount|mountedRows|jumpInput/)
    expect(demoStream).toContain('resolveInteraction(resolution: InteractionResolution)')
    expect(workspace).toContain('activeAssistantIndex: descriptor.logicalCount - 1')
  })

  it('keeps synthetic playback and Agent-loop policy in Demo', () => {
    const demoStream = readFileSync(join(demoRoot, 'stream-controller.ts'), 'utf8')
    const liveScript = readFileSync(join(demoRoot, 'live-run-script.ts'), 'utf8')
    expect(demoStream).toMatch(/\brate\s*=\s*20/)
    expect(demoStream).toMatch(/\bingressTicks\s*=\s*0/)
    expect(demoStream).toMatch(/\bpublishTicks\s*=\s*0/)
    expect(demoStream).toContain('estimateTokens')
    expect(demoStream).toContain("DemoPlaybackMode = 'standard' | 'stress' | 'agent-loop'")
    expect(demoStream).toContain('continueExecutionAt')
    expect(liveScript).toContain('createLiveToolResult')
    expect(liveScript).toContain("category: 'filesystem'")
    expect(liveScript).toContain("category: 'search'")
    expect(liveScript).toContain("category: 'shell'")
  })

  it('keeps Vue adapter generic while Demo diagnostics owns playback controls', () => {
    const workspace = readFileSync(join(demoRoot, 'components/AgentWorkspace.vue'), 'utf8')
    const diagnostics = readFileSync(join(demoRoot, 'components/DemoDiagnosticsPanel.vue'), 'utf8')
    const viewport = readFileSync(join(engineRoot, 'vue/ConversationViewport.vue'), 'utf8')

    expect(workspace).toContain(':execution="activeExecution"')
    expect(workspace).toContain(':stream="activeExecution"')
    expect(workspace).toContain('uiState.activeMessageId')
    expect(viewport).toContain('execution: ConversationExecutionController')
    expect(viewport).not.toContain('stream: ConversationExecutionController')
    expect(viewport).toContain('data-testid="question-answer"')
    expect(viewport).toContain("{ kind: 'question', answer: normalized }")
    expect(diagnostics).toContain('Demo observability')
    expect(diagnostics).toContain('Demo playback')
    expect(diagnostics).toContain('uiState.activeRenderUnitCount')
    expect(diagnostics).toContain('last turn outcome')
    expect(diagnostics).toContain("lastTurnReason ?? 'none'")
  })

  it('keeps the public workspace focused and diagnostics explicit', () => {
    const workspace = readFileSync(join(demoRoot, 'components/AgentWorkspace.vue'), 'utf8')
    const viewport = readFileSync(join(engineRoot, 'vue/ConversationViewport.vue'), 'utf8')
    expect(workspace).toContain("from '../../engine/vue'")
    expect(workspace).not.toContain('../../engine/vue/ConversationViewport.vue')
    expect(workspace).not.toContain('data-testid="session-search"')
    expect(workspace).not.toContain('data-testid="scenario-launch"')
    expect(workspace).not.toContain('Synthetic playback')
    expect(workspace).toContain('<div class="session-section-label">Recent</div>')
    expect(workspace).toContain('data-testid="diagnostics-open"')
    expect(workspace).toContain('navigator.webdriver')
    expect(viewport).toContain('data-conversation-engine="vue"')
    expect(viewport).not.toContain('conversation / {{ runtime.id }}')
    expect(viewport).not.toMatch(/Synthetic Agent|Search conversation|title="Attach"|>Agent ▾<|>Model ▾</)
  })

  it('keeps the Vue public adapter surface instance-oriented rather than globally mutable', () => {
    const publicVue = readFileSync(join(engineRoot, 'vue/index.ts'), 'utf8')
    const registry = readFileSync(join(engineRoot, 'vue/renderers/registry.ts'), 'utf8')
    const viewport = readFileSync(join(engineRoot, 'vue/ConversationViewport.vue'), 'utf8')
    expect(publicVue).toContain('ConversationViewport')
    expect(publicVue).toContain('RenderUnitView')
    expect(publicVue).toContain('RendererRegistry')
    expect(publicVue).toContain('createDefaultRendererRegistry')
    expect(publicVue).not.toMatch(/ConversationNodeSeat|defaultRendererRegistry|registerRenderer|resolveRenderer|registeredRendererIds/)
    expect(registry).toContain('export class RendererRegistry')
    expect(registry).toContain('clone(): RendererRegistry')
    expect(viewport).toContain('renderers?: RendererResolver')
  })

  it('uses one GFM parser contract for chunk boundaries and HTML rendering', () => {
    const chunks = readFileSync(join(engineRoot, 'presentation/markdown-chunks.ts'), 'utf8')
    const renderer = readFileSync(join(engineRoot, 'vue/renderers/markdown-cache.ts'), 'utf8')
    expect(chunks).toContain("import { marked } from 'marked'")
    expect(chunks).toContain('marked.lexer(source, MARKDOWN_OPTIONS)')
    expect(chunks).not.toContain('cleanBoundary')
    expect(renderer).toContain('MARKDOWN_OPTIONS')
    expect(renderer).toContain("from '../../presentation/markdown-chunks'")
  })

  it('keeps realistic public scenarios canonical and renderer-neutral', () => {
    const scenarios = readFileSync(join(demoRoot, 'session-scenarios.ts'), 'utf8')
    const adapter = readFileSync(join(demoRoot, 'history-adapter.ts'), 'utf8')
    expect(scenarios).toContain("block('request', 'markdown'")
    expect(scenarios).toContain("'tool-call'")
    expect(scenarios).toContain("'tool-result'")
    expect(scenarios).toContain("'code'")
    expect(scenarios).toContain("'diff'")
    expect(scenarios).toContain("'attachments'")
    expect(adapter).toContain('ReadonlyMap<number, LogicalMessage>')
    expect(adapter).toContain('this.#source.getRange')
  })

  it('keeps Demo and Engine CSS ownership compact, scoped and separate', () => {
    const main = readFileSync(join(demoRoot, 'main.ts'), 'utf8')
    const demoCss = readFileSync(join(demoRoot, 'styles/demo.css'), 'utf8')
    expect(main).toContain("./styles/demo.css")
    expect(main).toContain("../engine/vue/engine.css")
    expect(main).toContain("./styles/architecture.css")
    expect(demoCss).not.toMatch(/\.session-search|\.scenario-button|\.workspace-context|\.demo-context-(?:chip|copy)|\.sidebar-version|\.session-empty/)
    for (const name of ['engine.css', 'renderers.css']) {
      const css = readFileSync(join(engineRoot, `vue/${name}`), 'utf8')
      expect(css).toContain('[data-conversation-engine].conversation-shell')
      expect(css).not.toMatch(/(^|\n)\s*:root\s*\{/)
      expect(css).not.toMatch(/(^|\n)\s*(?:html|body|#app)(?:\s|,|\{)/)
    }
  })

  it('keeps the architecture page aligned with current repository boundaries', () => {
    const page = readFileSync(join(demoRoot, 'components/ArchitectureOverview.vue'), 'utf8')
    expect(page).toContain('docs/architecture.md')
    expect(page).toContain('package publishing disabled')
    expect(page).not.toContain('Private Vite application')
    expect(page).not.toContain('agent-workspace-reference-architecture.md')
    expect(page).not.toContain('DeepSeek Harness')
    expect(page).not.toContain('Session + Workspace Kernel')
  })

  it('isolates main release concurrency from merged-PR cleanup', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8')
    expect(workflow).toContain('group: ci-${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}')
    expect(workflow).toContain("github.event_name == 'push' && github.ref == 'refs/heads/main'")
    expect(workflow).toContain("github.event.action == 'closed'")
  })
})
