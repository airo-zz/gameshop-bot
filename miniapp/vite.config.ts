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
  plugins: [
    react(),
    // Шрифт Onest (кириллица + латиница) — preload в <head>: без этого текст
    // сначала рисуется запасным шрифтом и «прыгает» при подмене
    {
      name: 'preload-onest',
      transformIndexHtml: {
        order: 'post',
        handler(html, ctx) {
          const files = Object.keys(ctx.bundle ?? {}).filter((f) => /onest-(cyrillic|latin)-wght-normal.*\.woff2$/.test(f))
          const base = isWeb ? '/' : '/app/'
          const links = files.map((f) => `<link rel="preload" href="${base}${f}" as="font" type="font/woff2" crossorigin>`).join('\n    ')
          return links ? html.replace('</head>', `    ${links}\n  </head>`) : html
        },
      },
    },
    // Сплэш из index.html нужен только Mini App — на сайте вырезаем
    {
      name: 'strip-boot-splash',
      transformIndexHtml(html) {
        return isWeb ? html.replace(/<!-- boot-splash -->[\s\S]*?<!-- \/boot-splash -->/, '') : html
      },
    },
  ],
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
          // Иконки Phosphor не собираем в один чанк: каждая страница грузит только свои
        },
      },
    },
  },
})
