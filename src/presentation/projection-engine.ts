import type { ContentBlock, LogicalMessage } from '../model/conversation'
import type { RenderUnit } from './render-unit'
import { splitMarkdown } from './markdown-chunks'
import {
  ContentProjectorRegistry,
  createDefaultContentProjectors,
  estimateMarkdown,
  makeRenderUnit,
  projectMessage as projectMessageWithRegistry,
} from './projector-registry'

interface ProjectionCacheEntry {
  revision: number
  units: readonly RenderUnit[]
  markdownBlockId: string | null
  markdownSource: string | null
}

export interface ProjectionEngineStats {
  cacheSize: number
  cacheHits: number
  fullProjects: number
  incrementalPatches: number
  evictions: number
}

/**
 * Owns rebuildable presentation work for one hot conversation runtime.
 *
 * The registry is semantic policy; this engine adds bounded message-level memoization
 * and a true append-only Markdown fast path. Session/domain state never depends on it.
 */
export class ProjectionEngine {
  readonly registry: ContentProjectorRegistry
  readonly maxMessages: number

  #cache = new Map<string, ProjectionCacheEntry>()
  #cacheHits = 0
  #fullProjects = 0
  #incrementalPatches = 0
  #evictions = 0

  constructor(registry = createDefaultContentProjectors(), maxMessages = 4096) {
    this.registry = registry
    this.maxMessages = Math.max(128, Math.floor(maxMessages))
  }

  get stats(): ProjectionEngineStats {
    return {
      cacheSize: this.#cache.size,
      cacheHits: this.#cacheHits,
      fullProjects: this.#fullProjects,
      incrementalPatches: this.#incrementalPatches,
      evictions: this.#evictions,
    }
  }

  projectMessage(message: LogicalMessage): readonly RenderUnit[] {
    const revision = message.revision ?? 0
    const cached = this.#cache.get(message.id)
    if (cached && cached.revision === revision) {
      this.#cacheHits += 1
      this.#touch(message.id, cached)
      return cached.units
    }

    this.#fullProjects += 1
    const units = projectMessageWithRegistry(message, this.registry)
    return this.#remember(message, units)
  }

  projectMessages(messages: readonly LogicalMessage[]): RenderUnit[] {
    const units: RenderUnit[] = []
    for (const message of messages) units.push(...this.projectMessage(message))
    return units
  }

  /**
   * Append-only Markdown fast path used by live LLM output.
   * Only the previous mutable tail plus the new delta is re-chunked; settled prefix
   * RenderUnit objects remain byte/identity stable. Multi-block or non-append updates
   * intentionally fall back to the general projector.
   */
  appendMarkdownDelta(message: LogicalMessage, blockId: string, delta: string): readonly RenderUnit[] {
    const cached = this.#cache.get(message.id)
    const contentBlock = message.blocks?.find(entry => entry.id === blockId && entry.type === 'markdown') as ContentBlock<'markdown'> | undefined
    if (!cached || !contentBlock || !delta || cached.markdownBlockId !== blockId || cached.markdownSource === null) {
      return this.projectMessage(message)
    }

    const currentSource = contentBlock.data.markdown
    // The SessionKernel event is authoritative that this is append-only. Length +
    // suffix validation protects callers that accidentally route a replacement here
    // without rescanning the already-settled prefix.
    if (currentSource.length !== cached.markdownSource.length + delta.length || !currentSource.endsWith(delta)) {
      return this.projectMessage(message)
    }

    const blockUnits = cached.units.filter(unit => unit.payload.blockId === blockId)
    if (blockUnits.length === 0 || blockUnits.length !== cached.units.length) return this.projectMessage(message)

    const oldTail = blockUnits[blockUnits.length - 1]!
    const oldTailText = String(oldTail.payload.markdown ?? '')
    const settledPrefix = blockUnits.slice(0, -1)
    const chunks = splitMarkdown(`${oldTailText}${delta}`)
    const baseIndex = settledPrefix.length
    const tailUnits = chunks.map((chunk, localIndex) => {
      if (localIndex === 0 && chunk.text === oldTailText && chunk.hash === oldTail.revision) return oldTail
      return makeRenderUnit(
        message,
        contentBlock,
        `md-${baseIndex + localIndex}`,
        'markdown',
        estimateMarkdown(chunk.text),
        { markdown: chunk.text, markdownHash: chunk.hash },
        chunk.hash,
      )
    })

    const units = [...settledPrefix, ...tailUnits]
    this.#incrementalPatches += 1
    return this.#remember(message, units)
  }

  clear(): void { this.#cache.clear() }

  #remember(message: LogicalMessage, units: readonly RenderUnit[]): readonly RenderUnit[] {
    const ownedUnits = Object.freeze([...units])
    const markdownBlocks = message.blocks?.filter(entry => entry.type === 'markdown') ?? []
    const singleMarkdown = markdownBlocks.length === 1 && ownedUnits.length > 0 && ownedUnits.every(unit => unit.payload.blockId === markdownBlocks[0]!.id)
    const markdownBlock = singleMarkdown ? markdownBlocks[0] as ContentBlock<'markdown'> : null
    const entry: ProjectionCacheEntry = {
      revision: message.revision ?? 0,
      units: ownedUnits,
      markdownBlockId: markdownBlock?.id ?? null,
      markdownSource: markdownBlock?.data.markdown ?? null,
    }
    this.#touch(message.id, entry)
    while (this.#cache.size > this.maxMessages) {
      const oldest = this.#cache.keys().next().value as string | undefined
      if (!oldest) break
      this.#cache.delete(oldest)
      this.#evictions += 1
    }
    return ownedUnits
  }

  #touch(id: string, entry: ProjectionCacheEntry): void {
    this.#cache.delete(id)
    this.#cache.set(id, entry)
  }
}
