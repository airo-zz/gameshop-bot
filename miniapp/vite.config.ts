import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Цель сборки: 'web' → сайт (base /, dist-web), 'admin' → админка admin.redonate.gg
// (base /, dist-admin), иначе Mini App (base /app/, dist).
// Управляется переменной окружения VITE_APP_TARGET на этапе сборки.
const RAW_TARGET = process.env.VITE_APP_TARGET
const APP_TARGET = RAW_TARGET === 'web' || RAW_TARGET === 'admin' ? RAW_TARGET : 'telegram'
const isWeb = APP_TARGET === 'web'
const isAdmin = APP_TARGET === 'admin'
const BASE = isWeb || isAdmin ? '/' : '/app/'

export default defineConfig({
  base: BASE,
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
          const base = BASE
          const links = files.map((f) => `<link rel="preload" href="${base}${f}" as="font" type="font/woff2" crossorigin>`).join('\n    ')
          return links ? html.replace('</head>', `    ${links}\n  </head>`) : html
        },
      },
    },
    // Сплэш из index.html нужен только Mini App — на сайте вырезаем
    {
      name: 'strip-boot-splash',
      transformIndexHtml(html) {
        if (isAdmin) {
          // Админке сплэш не нужен; SDK Telegram оставляем — вход внутри бота поддержки
          return html
            .replace(/<!-- boot-splash -->[\s\S]*?<!-- \/boot-splash -->/, '')
            .replace('<html lang="ru">', '<html lang="ru" class="admin">')
            .replace(/<title>[^<]*<\/title>/, '<title>Админка reDonate</title>')
            .replace('</head>', '  <meta name="robots" content="noindex, nofollow" />\n  </head>')
        }
        if (!isWeb) return html
        return html
          // Класс сайта с первой отрисовки: прокрутка у окна, а не у #root (src/index.css)
          .replace('<html lang="ru">', '<html lang="ru" class="web">')
          .replace(/<!-- boot-splash -->[\s\S]*?<!-- \/boot-splash -->/, '')
          // SDK Telegram нужен только Mini App — сайту лишние 25 КБ стороннего скрипта
          .replace(/\s*<script[^>]*telegram-web-app\.js[^>]*><\/script>/, '')
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
    outDir: isWeb ? 'dist-web' : isAdmin ? 'dist-admin' : 'dist',
    // Карта сборки сайта: api/routers/seo.py по ней ставит modulepreload скриптов
    // открытой страницы (без цепочки «страница → скрипт → скрипт страницы»)
    manifest: isWeb ? 'build-manifest.json' : false,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          // Сайт: framer-motion не одним куском — ядро сразу, возможности лениво (LazyMotion)
          ...(isWeb ? {} : { motion: ['framer-motion'] }),
          // Иконки Phosphor не собираем в один чанк: каждая страница грузит только свои
        },
      },
    },
  },
})
