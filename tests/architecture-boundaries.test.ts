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
  it('physically separates reusable engine and executable demo ownership', () => {
    expect(statSync(engineRoot).isDirectory()).toBe(true)
    expect(statSync(demoRoot).isDirectory()).toBe(true)
    const legacyRoots = ['core', 'model', 'conversation', 'presentation', 'viewport', 'runtime', 'vue', 'components', 'styles', 'workers']
    for (const name of legacyRoots) expect(() => statSync(join(srcRoot, name))).toThrow()
  })

  it('keeps every engine relative import inside engine and preserves internal dependency direction', () => {
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

  it('allows demo to consume engine while engine never consumes demo', () => {
    const engineSource = sourceFiles(engineRoot).map(file => readFileSync(file, 'utf8')).join('\n')
    expect(engineSource).not.toMatch(/(?:^|['"])\.\.\/(?:\.\.\/)*demo\//m)
    const demoSource = sourceFiles(demoRoot).map(file => readFileSync(file, 'utf8')).join('\n')
    expect(demoSource).toMatch(/\.\.\/(?:engine|\.\.\/engine)\//)
  })

  it('keeps the framework-neutral public entry free of demo and Vue implementation imports', () => {
    const source = readFileSync(join(engineRoot, 'index.ts'), 'utf8')
    expect(source).not.toMatch(/(?:demo|\.\/vue\/)/)
  })

  it('keeps synthetic playback and provider policy out of engine session truth', () => {
    const contracts = readFileSync(join(engineRoot, 'conversation/contracts.ts'), 'utf8')
    const kernel = readFileSync(join(engineRoot, 'conversation/session-kernel.ts'), 'utf8')
    const mutations = readFileSync(join(engineRoot, 'model/message-mutations.ts'), 'utf8')
    const runtime = readFileSync(join(engineRoot, 'runtime/session-runtime.ts'), 'utf8')
    const engineSource = `${contracts}\n${kernel}\n${mutations}\n${runtime}`

    expect(engineSource).not.toMatch(/\b(?:streamRate|streamIngressTicks|streamRenderTicks|setStreamRate|incrementIngress)\b/)
    expect(kernel).not.toMatch(/\b(?:beginTurn|appendCurrentReasoningDelta|appendAssistantDelta|completeCurrent|abortCurrent|failCurrent|estimateTokens)\b/)
    expect(kernel).not.toContain('Completed.')
    expect(kernel).not.toContain('Stopped by user')
    expect(mutations).not.toContain('estimateTokens')
    expect(contracts).not.toMatch(/\bage:\s*string/)
    expect(runtime).not.toMatch(/\b(?:mountedRows|jumpInput)\b/)

    const demoStream = readFileSync(join(demoRoot, 'stream-controller.ts'), 'utf8')
    const liveScript = readFileSync(join(demoRoot, 'live-run-script.ts'), 'utf8')
    expect(demoStream).toMatch(/\brate\s*=\s*20/)
    expect(demoStream).toMatch(/\bingressTicks\s*=\s*0/)
    expect(demoStream).toMatch(/\bpublishTicks\s*=\s*0/)
    expect(demoStream).toContain('estimateTokens')
    expect(liveScript).toContain('applyLiveScenarioMilestone')
    expect(liveScript).toContain("'tool-call'")
    expect(liveScript).toContain("'diff'")
    expect(liveScript).toContain("'attachments'")
  })

  it('keeps the public workspace scenario-focused while diagnostics remain an explicit engine surface', () => {
    const workspace = readFileSync(join(demoRoot, 'components/AgentWorkspace.vue'), 'utf8')
    const diagnostics = readFileSync(join(demoRoot, 'components/DemoDiagnosticsPanel.vue'), 'utf8')
    const viewport = readFileSync(join(engineRoot, 'vue/ConversationViewport.vue'), 'utf8')

    expect(workspace).toContain("./DemoDiagnosticsPanel.vue")
    expect(workspace).toContain("from '../../engine/vue'")
    expect(workspace).not.toContain('../../engine/vue/ConversationViewport.vue')
    expect(workspace).not.toContain('data-testid="session-search"')
    expect(workspace).not.toContain('data-testid="scenario-launch"')
    expect(workspace).not.toContain('Synthetic playback')
    expect(workspace).not.toContain('canonical blocks · bounded projection')
    expect(workspace).not.toContain('Demo conversations')
    expect(workspace).toContain('<div class="session-section-label">Recent</div>')
    expect(workspace).toContain('data-testid="diagnostics-open"')
    expect(workspace).toContain('navigator.webdriver')
    expect(workspace).not.toContain('data-testid="metrics"')
    expect(diagnostics).toContain('Session diagnostics')
    expect(diagnostics).toContain('data-testid="metrics"')
    expect(diagnostics).not.toMatch(/virtual epoch|renderer registry|fold state|highlight LRU|markdown LRU|Fenwick leaves/i)
    expect(workspace).toContain('#header-actions')
    expect(workspace).not.toContain('data-conversation-engine=')
    expect(viewport).toContain('data-conversation-engine="vue"')
    expect(viewport).not.toContain('conversation / {{ runtime.id }}')
    expect(viewport).toContain("./viewport-navigation-controller")
    expect(viewport).not.toContain('function restoreListAnchor')
    expect(viewport).not.toContain('function pinMeasuredEnd')
    expect(viewport).toContain("emit('viewportMetrics'")
    expect(viewport).not.toMatch(/Synthetic Agent|Reasoning · balanced|Search conversation|title="Attach"|>Agent ▾<|>Model ▾</)
  })

  it('uses one GFM parser contract for chunk boundaries and HTML rendering', () => {
    const chunks = readFileSync(join(engineRoot, 'presentation/markdown-chunks.ts'), 'utf8')
    const renderer = readFileSync(join(engineRoot, 'vue/renderers/markdown-cache.ts'), 'utf8')
    expect(chunks).toContain("import { marked } from 'marked'")
    expect(chunks).toContain('marked.lexer(source, MARKDOWN_OPTIONS)')
    expect(chunks).not.toContain('cleanBoundary')
    expect(renderer).toContain("MARKDOWN_OPTIONS")
    expect(renderer).toContain("from '../../presentation/markdown-chunks'")
  })

  it('keeps realistic public scenario tails as canonical Demo history, not renderer shortcuts', () => {
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

  it('supports per-viewport renderer customization without requiring global registry mutation', () => {
    const registry = readFileSync(join(engineRoot, 'vue/renderers/registry.ts'), 'utf8')
    const viewport = readFileSync(join(engineRoot, 'vue/ConversationViewport.vue'), 'utf8')
    const nodeSeat = readFileSync(join(engineRoot, 'vue/ConversationNodeSeat.vue'), 'utf8')

    expect(registry).toContain('export class RendererRegistry')
    expect(registry).toContain('clone(): RendererRegistry')
    expect(registry).toContain('defaultRendererRegistry')
    expect(viewport).toContain('renderers?: RendererResolver')
    expect(viewport).toContain(':renderers="renderers"')
    expect(nodeSeat).toContain(':renderers="renderers"')
  })

  it('keeps Demo and Engine CSS ownership compact and explicit', () => {
    const main = readFileSync(join(demoRoot, 'main.ts'), 'utf8')
    const demoCss = readFileSync(join(demoRoot, 'styles/demo.css'), 'utf8')
    const shellCss = readFileSync(join(engineRoot, 'vue/engine.css'), 'utf8')
    expect(main).toContain("./styles/demo.css")
    expect(main).not.toContain('scenario.css')
    expect(main).toContain("../engine/vue/engine.css")
    expect(main).toContain("./styles/architecture.css")
    expect(demoCss).not.toMatch(/\.session-search|\.scenario-button|\.workspace-context|\.demo-context-(?:chip|copy)|\.sidebar-version|\.session-empty/)
    expect(shellCss).toContain("@import './renderers.css'")
    expect(shellCss).not.toContain('.conversation-title span')
  })

  it('keeps both engine css responsibilities host-scoped', () => {
    for (const name of ['engine.css', 'renderers.css']) {
      const css = readFileSync(join(engineRoot, `vue/${name}`), 'utf8')
      expect(css).toContain('[data-conversation-engine].conversation-shell')
      expect(css).not.toMatch(/(^|\n)\s*:root\s*\{/)
      expect(css).not.toMatch(/(^|\n)\s*(?:html|body|#app)(?:\s|,|\{)/)
    }
    const shellCss = readFileSync(join(engineRoot, 'vue/engine.css'), 'utf8')
    expect(shellCss).not.toMatch(/\.model-chip|\.mode-button|\.conversation-meta-strip/)
  })

  it('isolates main release concurrency from merged-PR cleanup', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8')
    expect(workflow).toContain('group: ci-${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}')
    expect(workflow).toContain("github.event_name == 'push' && github.ref == 'refs/heads/main'")
    expect(workflow).toContain("github.event.action == 'closed'")
  })
})
