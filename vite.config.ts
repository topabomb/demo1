import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: process.env.GITHUB_PAGES === 'true' ? '/demo1/' : '/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
