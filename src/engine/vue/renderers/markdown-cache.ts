import DOMPurify from 'dompurify'
import { marked } from 'marked'

const MAX_ENTRIES = 256
const cache = new Map<string, string>()

export function renderMarkdownCached(id: string, revision: number, markdown: string): string {
  const key = `${id}@${revision}`
  const cached = cache.get(key)
  if (cached !== undefined) {
    cache.delete(key)
    cache.set(key, cached)
    return cached
  }
  const raw = marked.parse(markdown, { async: false, gfm: true, breaks: false }) as string
  const html = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
  cache.set(key, html)
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  return html
}

export function markdownCacheSize(): number { return cache.size }
