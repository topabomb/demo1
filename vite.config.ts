import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

function pagesBase(): string {
  if (process.env.GITHUB_PAGES !== 'true') return '/'
  const repository = process.env.GITHUB_REPOSITORY?.split('/')[1]
  if (!repository || repository.endsWith('.github.io')) return '/'
  return `/${repository}/`
}

export default defineConfig({
  plugins: [vue()],
  base: pagesBase(),
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
