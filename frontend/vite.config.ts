import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

const backend = process.env.LAB_BACKEND_URL ?? 'http://127.0.0.1:8000'

// Dev: Vite serves the SPA and proxies /api to Laravel (same origin => session cookies just work).
// Build: output goes to backend/public/spa and Laravel serves it behind the password gate redirect.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/spa/' : '/',
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: Number(process.env.LAB_FRONTEND_PORT ?? 5173),
    strictPort: true,
    proxy: { '/api': { target: backend, changeOrigin: false } },
  },
  build: {
    outDir: '../backend/public/spa',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
