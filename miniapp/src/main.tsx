// src/main.tsx
import { LazyMotion } from 'framer-motion'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { isAdminApp, isTelegram, isWeb } from '@/config/appTarget'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 5 * 60_000,   // 5 минут — данные считаются свежими, не перезагружаются при навигации
      refetchOnWindowFocus: false,
      // refetchOnMount оставляем true (дефолт): если данные устарели или инвалидированы —
      // при переходе на страницу они обновятся. staleTime уже предотвращает лишние запросы.
    },
  },
})

// ── Web-режим: обычный сайт, а не Mini App ──────────────────────────────────
// Разрешаем зум и нативную прокрутку (index.html заточен под Telegram WebView).
if (isWeb) {
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover')
  document.body.classList.add('web')

  // Данные страницы, которые сервер положил прямо в HTML (api/routers/seo.py):
  // кладём в кэш React Query — страница рисуется без запросов к API при старте.
  // updatedAt — время сборки на сервере, чтобы устаревшее обновилось в фоне.
  const w = window as Window & { __INITIAL_DATA__?: { t: number; q: [unknown[], unknown][] } }
  const init = w.__INITIAL_DATA__
  if (init) {
    for (const [key, data] of init.q) queryClient.setQueryData(key, data, { updatedAt: init.t })
    delete w.__INITIAL_DATA__
  }
}

// ── Гейт /app: miniapp открывается только внутри Telegram ────────────────────
// Вне Telegram (нет initData) и не на админке — уводим на публичный сайт,
// сохраняя экран: /app/orders/X → /orders/X, /app/balance → /balance и т.д.
// (так возврат с Platega, открытый во внешнем браузере, не теряет контекст).
// Только на проде (redonate.su / redonate.gg), чтобы не мешать локальной разработке/preview.
if (isTelegram) {
  const inTelegram = !!window.Telegram?.WebApp?.initData
  const { pathname, search } = window.location
  const isAdmin = pathname.startsWith('/app/admin')
  const isProd = /^redonate\.(su|gg)$/.test(window.location.hostname)
  if (isProd && !inTelegram && !isAdmin) {
    let rest = pathname.replace(/^\/app/, '') || '/'
    if (rest.startsWith('/catalog/')) rest = rest.replace('/catalog/', '/game/')
    const known = /^\/($|catalog$|game\/|orders|balance|profile|cart|referrals)/.test(rest)
    window.location.replace('https://redonate.gg' + (known ? rest + search : '/'))
  }
}

// Корневой компонент выбирается по цели сборки и грузится отдельным чанком:
// сайт не тянет каркас Mini App/админки, Mini App — код сайта.
// Рендерим только ПОСЛЕ загрузки чанка: до этого в #root остаётся готовый HTML
// с сервера (SEO-версия страницы) или сплэш — без мигания пустым экраном.
const loadRoot = isWeb ? import('@/web/WebApp') : isAdminApp ? import('@/admin/AdminApp') : import('./App')
const loadMotionFeatures = () => import('./motionFeatures').then((r) => r.default)

loadRoot.then(({ default: RootApp }) => {
  // Сигнал для SEO-страниц: сайт загрузился, текст для роботов можно не показывать
  ;(window as Window & { __appMounted?: boolean }).__appMounted = true
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        {/* Лёгкие m.* компоненты; возможности анимаций — отдельным чанком после отрисовки */}
        <LazyMotion features={loadMotionFeatures}>
          <RootApp />
        </LazyMotion>
      </QueryClientProvider>
    </React.StrictMode>
  )
})
