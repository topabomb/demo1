import { block, type AppendCanonicalMessage, type ContentBlock } from './content-model'

export const MARKDOWN_COMPATIBILITY_FIXTURES = [
  { id: 'gfm-basics', title: 'GFM basics', markdown: `# Markdown compatibility\n\n## Typography\n\n**bold**, *italic*, ~~strike~~, \`inline code\`, and [a link](https://example.com).\n\n> Blockquotes should wrap naturally without affecting the viewport contract.\n\n---\n\nParagraphs can contain very_long_unbroken_identifiers_that_must_not_expand_the_page_width_beyond_the_conversation_viewport.` },
  { id: 'lists-tasks', title: 'Lists and tasks', markdown: `## Lists and tasks\n\n- first item\n  - nested item\n    - deeply nested item\n- second item\n\n1. ordered\n2. ordered\n\n- [x] projected from canonical content\n- [ ] preserve semantic anchor during reflow\n- [ ] keep physical DOM bounded` },
  { id: 'wide-table', title: 'Wide GFM table', markdown: `## Wide table\n\n| Layer | Ownership | Durable | Framework | Notes |\n| --- | --- | --- | --- | --- |\n| SessionKernel | execution, turns, blockers, usage | yes | no | can outlive every viewport |\n| Projection | bounded keyed nodes | rebuildable | no | hot only |\n| Viewport | reader, anchor, follow | snapshot | no | semantic coordinates |\n| Adapter | physical measurement | no | yes | replaceable |\n| Renderer | presentation | no | yes | extensible registry |` },
  { id: 'fences', title: 'Fenced code', markdown: `## Fenced code\n\n\`\`\`ts\ninterface ConversationRenderer {\n  id: string\n  render(node: RenderUnit): unknown\n}\n\nconst stable = true\n\`\`\`\n\n\`\`\`json\n{ "cacheHit": 0.83, "input": 125000, "output": 8400 }\n\`\`\`\n\nA fence must never be split in the middle by the presentation chunker.` },
  { id: 'raw-html', title: 'HTML sanitization', markdown: `## Embedded HTML\n\n<div class="markdown-inline-artifact"><strong>Allowed semantic HTML</strong><span> stays inside the Markdown renderer.</span></div>\n\n<script>window.__markdownUnsafe = true</script>\n\nThe script element must not survive sanitization.` },
  { id: 'long-document', title: 'Long document', markdown: Array.from({ length: 24 }, (_, i) => `### Section ${i + 1}\n\nA long assistant document deliberately exercises repeated headings, paragraphs, inline \`code_${i}\`, **emphasis**, links, and variable wrapping. ${'conversation projection semantic viewport renderer cache '.repeat(12)}`).join('\n\n') },
] as const

/** Each case is an addressable canonical message so the browser can jump to and verify it independently. */
export function createMarkdownGalleryTurn(scope: string, ordinal: number): AppendCanonicalMessage[] {
  const turnId = `${scope}:fixture-markdown-${ordinal}`
  return MARKDOWN_COMPATIBILITY_FIXTURES.map(item => ({
    turnId,
    role: 'assistant' as const,
    variant: `markdown-gallery:${item.id}`,
    blocks: [block(item.id, 'markdown', { markdown: item.markdown, flavor: 'gfm' })],
  }))
}

export function createMixedDemoTurn(scope: string, ordinal: number): AppendCanonicalMessage[] {
  const turnId = `${scope}:fixture-mixed-${ordinal}`
  const callId = `fixture_call_${ordinal}`
  const visual = ordinal % 4
  const rich: ContentBlock[] = [
    block('reasoning', 'reasoning', { text: `I will inspect the current session state, preserve stable identities, and verify the viewport after this runtime-injected turn ${ordinal}.`, tokenCount: 58 + ordinal, durationMs: 1200 + ordinal * 73, defaultOpen: false }),
    block('answer', 'markdown', { markdown: `## Runtime-injected heterogeneous turn ${ordinal}\n\nThis content was appended to the **canonical SessionKernel**, then projected through the same registry as historical and streamed content.\n\n- stable block identity\n- bounded RenderUnits\n- responsive containment\n- no DOM-side fixture shortcut`, flavor: 'gfm' }),
  ]
  if (visual === 0) rich.push(block('code', 'code', { language: 'typescript', filename: `src/runtime-fixture-${ordinal}.ts`, code: Array.from({ length: 46 }, (_, i) => `const fixture_${ordinal}_${i} = project(blocks[${i}], { stable: true })`).join('\n') }))
  if (visual === 1) rich.push(block('diff', 'diff', { file: `src/runtime-${ordinal}.ts`, lines: Array.from({ length: 64 }, (_, i) => `${i % 3 === 0 ? '+' : i % 5 === 0 ? '-' : ' '} line ${i + 1}: renderer registry invariant ${ordinal}`) }))
  if (visual === 2) rich.push(block('image', 'image', { width: 1440, height: 810, seed: 9000 + ordinal, alt: `Synthetic responsive image fixture ${ordinal}` }))
  if (visual === 3) rich.push(block('html', 'html', { html: `<section class="synthetic-html"><h3>Runtime artifact ${ordinal}</h3><p>Sanitized HTML follows the same ContentBlock contract.</p><div class="html-chip">responsive container</div><script>window.__fixtureUnsafe=true</script></section>` }))
  return [
    { turnId, role: 'user', variant: 'fixture-user', blocks: [block('request', 'markdown', { markdown: `Please execute runtime fixture **${ordinal}** and demonstrate a mixed Agent turn.` })] },
    { turnId, role: 'assistant', variant: 'fixture-assistant', blocks: rich },
    { turnId, role: 'assistant', variant: 'fixture-tool-call', blocks: [block('tool-call', 'tool-call', { name: ordinal % 2 ? 'search' : 'read_file', callId, input: { path: `/workspace/fixture-${ordinal}.ts`, query: `renderer ${ordinal}`, limit: 20 }, durationMs: 18, status: 'success', defaultOpen: false })] },
    { turnId, role: 'tool', variant: 'fixture-tool-result', blocks: [block('tool-result', 'tool-result', { name: ordinal % 2 ? 'search' : 'read_file', callId, output: { rows: [{ line: 12, preview: 'stable keyed content' }, { line: 41, preview: 'responsive renderer containment' }], exitCode: 0 }, durationMs: 32, status: 'success', defaultOpen: false })] },
    { turnId, role: 'assistant', variant: 'fixture-summary', blocks: [block('summary', 'markdown', { markdown: `### Verified\n\nFixture ${ordinal} crossed **SessionKernel → Content Projector Registry → keyed projection → virtualizer → Renderer Registry**.` })] },
  ]
}

export function createMixedDemoTurns(scope: string, startOrdinal: number, count: number): AppendCanonicalMessage[] {
  return Array.from({ length: count }, (_, i) => createMixedDemoTurn(scope, startOrdinal + i)).flat()
}
