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

  it('loads demo and engine styles from their owning trees only', () => {
    const main = readFileSync(join(demoRoot, 'main.ts'), 'utf8')
    expect(main).toContain("./styles/demo.css")
    expect(main).toContain("../engine/vue/engine.css")
    expect(main).toContain("./styles/architecture.css")
  })

  it('keeps engine CSS host-scoped', () => {
    const css = readFileSync(join(engineRoot, 'vue/engine.css'), 'utf8')
    expect(css).toContain('[data-conversation-engine].conversation-shell')
    expect(css).not.toMatch(/(^|\n)\s*:root\s*\{/)
    expect(css).not.toMatch(/(^|\n)\s*(?:html|body|#app)(?:\s|,|\{)/)
  })
})
