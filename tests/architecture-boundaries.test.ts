import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const srcRoot = resolve(process.cwd(), 'src')
const engineLayers = ['model', 'conversation', 'presentation', 'viewport', 'runtime', 'engine'] as const
const forbidden: Record<(typeof engineLayers)[number], ReadonlySet<string>> = {
  model: new Set(['conversation', 'presentation', 'viewport', 'runtime', 'vue', 'components', 'demo']),
  conversation: new Set(['presentation', 'viewport', 'runtime', 'vue', 'components', 'demo']),
  presentation: new Set(['conversation', 'viewport', 'runtime', 'vue', 'components', 'demo']),
  viewport: new Set(['conversation', 'presentation', 'runtime', 'vue', 'components', 'demo']),
  runtime: new Set(['vue', 'components', 'demo']),
  engine: new Set(['vue', 'components', 'demo']),
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
  const rel = relative(srcRoot, target)
  if (rel.startsWith('..')) return null
  return rel.split(sep)[0] ?? null
}

describe('engine architecture boundaries', () => {
  it('keeps dependency direction acyclic and demo/framework adapters outside engine layers', () => {
    const violations: string[] = []
    for (const layer of engineLayers) {
      const root = join(srcRoot, layer)
      for (const file of sourceFiles(root)) {
        for (const specifier of importsOf(file)) {
          const target = targetLayer(file, specifier)
          if (target && forbidden[layer].has(target)) {
            violations.push(`${relative(srcRoot, file)} -> ${specifier}`)
          }
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })

  it('keeps the framework-neutral public entry free of demo and Vue implementation imports', () => {
    const source = readFileSync(join(srcRoot, 'engine/index.ts'), 'utf8')
    expect(source).not.toMatch(/\.\.\/(?:demo|vue|components)\//)
  })

  it('loads only separated demo, engine and architecture styles', () => {
    const main = readFileSync(join(srcRoot, 'main.ts'), 'utf8')
    expect(main).toContain("./styles/demo.css")
    expect(main).toContain("./styles/engine.css")
    expect(main).toContain("./architecture.css")
    for (const legacy of ['styles.css', 'agent-renderers.css', 'virtua-layout.css', 'renderer-content.css', 'product-ux.css', 'responsive-ux.css']) {
      expect(main).not.toContain(`'./${legacy}'`)
    }
  })

  it('keeps engine CSS host-scoped', () => {
    const css = readFileSync(join(srcRoot, 'styles/engine.css'), 'utf8')
    expect(css).toContain('[data-conversation-engine].conversation-shell')
    expect(css).not.toMatch(/(^|\n)\s*:root\s*\{/)
    expect(css).not.toMatch(/(^|\n)\s*(?:html|body|#app)(?:\s|,|\{)/)
  })
})
