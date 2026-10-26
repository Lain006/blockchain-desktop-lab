import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  root: fileURLToPath(new URL('./renderer', import.meta.url)), base: './',
  plugins: [vue()], build: { outDir: '../ui', emptyOutDir: true },
})
