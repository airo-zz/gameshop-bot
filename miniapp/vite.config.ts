import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Цель сборки: 'web' → сайт (base /, dist-web), иначе Mini App (base /app/, dist).
// Управляется переменной окружения VITE_APP_TARGET на этапе сборки.
const APP_TARGET = process.env.VITE_APP_TARGET === 'web' ? 'web' : 'telegram'
const isWeb = APP_TARGET === 'web'

export default defineConfig({
  base: isWeb ? '/' : '/app/',
  // Пробрасываем цель в рантайм (см. src/config/appTarget.ts)
  define: {
    'import.meta.env.VITE_APP_TARGET': JSON.stringify(APP_TARGET),
  },
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  build: {
    outDir: isWeb ? 'dist-web' : 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          motion: ['framer-motion'],
          ui: ['lucide-react'],
        },
      },
    },
  },
})
