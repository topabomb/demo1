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

    // Decide whether to flush using the state *before* this line. In particular,
    // a closing-fence line belongs to the currently open chunk and must never be
    // separated from its opener.
    const wouldOverflow = buffer.length > 0 && buffer.length + line.length > targetChars
    const cleanBoundary = !fence && /\n\s*$/.test(buffer)
    if (wouldOverflow && cleanBoundary) {
      chunks.push(buffer)
      buffer = ''
    }

    if (marker) {
      const markerChar = marker[0]!
      if (!fence) fence = markerChar
      else if (markerChar === fence) fence = null
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
