/// <reference lib="webworker" />

import { createHighlighterCoreSync } from '@shikijs/core'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'
import bash from '@shikijs/langs/bash'
import javascript from '@shikijs/langs/javascript'
import json from '@shikijs/langs/json'
import typescript from '@shikijs/langs/typescript'
import darkPlus from '@shikijs/themes/dark-plus'

const highlighter = createHighlighterCoreSync({
  themes: [darkPlus],
  langs: [typescript, javascript, json, bash],
  engine: createJavaScriptRegexEngine(),
})

const aliases: Record<string, string> = {
  ts: 'typescript',
  typescript: 'typescript',
  js: 'javascript',
  javascript: 'javascript',
  json: 'json',
  sh: 'bash',
  bash: 'bash',
  shell: 'bash',
}

self.onmessage = (event: MessageEvent<{ id: number; code: string; language: string }>) => {
  const { id, code, language } = event.data
  try {
    const lang = aliases[language] ?? 'typescript'
    const html = highlighter.codeToHtml(code, { lang, theme: 'dark-plus' })
    self.postMessage({ id, html })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
