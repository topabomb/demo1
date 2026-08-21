export interface MarkdownChunk {
  text: string
  index: number
  hash: number
}

/**
 * Split long Markdown at block boundaries while never cutting an open fenced code block.
 * Existing prefix chunks remain byte-identical as a stream appends to the tail.
 */
export function splitMarkdown(source: string, targetChars = 6000): MarkdownChunk[] {
  if (!source) return [{ text: '', index: 0, hash: hashText('') }]
  const lines = source.split(/(?<=\n)/)
  const chunks: string[] = []
  let buffer = ''
  let fence: string | null = null

  for (const line of lines) {
    const trimmed = line.trimStart()
    const marker = trimmed.match(/^(```+|~~~+)/)?.[1] ?? null
    if (marker) {
      if (!fence) fence = marker[0]!
      else if (marker[0] === fence) fence = null
    }

    const wouldOverflow = buffer.length > 0 && buffer.length + line.length > targetChars
    const cleanBoundary = !fence && /\n\s*$/.test(buffer)
    if (wouldOverflow && cleanBoundary) {
      chunks.push(buffer)
      buffer = ''
    }
    buffer += line
  }
  if (buffer || chunks.length === 0) chunks.push(buffer)

  return chunks.map((text, index) => ({ text, index, hash: hashText(text) }))
}

export function hashText(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
