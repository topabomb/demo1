interface Pending {
  resolve: (value: string) => void
  reject: (reason?: unknown) => void
}

const MAX_CACHE = 256
const cache = new Map<string, string>()
const pending = new Map<number, Pending>()
let sequence = 0
let worker: Worker | null = null

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../../workers/highlight.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<{ id: number; html?: string; error?: string }>) => {
    const request = pending.get(event.data.id)
    if (!request) return
    pending.delete(event.data.id)
    if (event.data.error) request.reject(new Error(event.data.error))
    else request.resolve(event.data.html ?? '')
  }
  return worker
}

function remember(key: string, html: string): void {
  cache.delete(key)
  cache.set(key, html)
  if (cache.size <= MAX_CACHE) return
  const oldest = cache.keys().next().value as string | undefined
  if (oldest) cache.delete(oldest)
}

export function highlightCode(code: string, language: string): Promise<string> {
  const key = `${language}\u0000${code}`
  const hit = cache.get(key)
  if (hit !== undefined) {
    cache.delete(key)
    cache.set(key, hit)
    return Promise.resolve(hit)
  }

  const id = ++sequence
  return new Promise<string>((resolve, reject) => {
    pending.set(id, {
      resolve: html => {
        remember(key, html)
        resolve(html)
      },
      reject,
    })
    getWorker().postMessage({ id, code, language })
  })
}

export function highlightCacheSize(): number {
  return cache.size
}
