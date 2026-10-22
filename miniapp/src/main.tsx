// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { isWeb } from '@/config/appTarget'
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
}

// ── Гейт /app: miniapp открывается только внутри Telegram ────────────────────
// Вне Telegram (нет initData) и не на админке — уводим на публичный сайт,
// сохраняя экран: /app/orders/X → /orders/X, /app/balance → /balance и т.д.
// (так возврат с Platega, открытый во внешнем браузере, не теряет контекст).
// Только на проде (redonate.su), чтобы не мешать локальной разработке/preview.
if (!isWeb) {
  const inTelegram = !!window.Telegram?.WebApp?.initData
  const { pathname, search } = window.location
  const isAdmin = pathname.startsWith('/app/admin')
  const isProd = window.location.hostname === 'redonate.su'
  if (isProd && !inTelegram && !isAdmin) {
    let rest = pathname.replace(/^\/app/, '') || '/'
    if (rest.startsWith('/catalog/')) rest = rest.replace('/catalog/', '/game/')
    const known = /^\/($|catalog$|game\/|orders|balance|profile|cart|referrals)/.test(rest)
    window.location.replace('https://redonate.su' + (known ? rest + search : '/'))
  }
}

// Корневой компонент выбирается по цели сборки и грузится отдельным чанком:
// сайт не тянет каркас Mini App/админки, Mini App — код сайта.
// Рендерим только ПОСЛЕ загрузки чанка: до этого в #root остаётся готовый HTML
// с сервера (SEO-версия страницы) или сплэш — без мигания пустым экраном.
const loadRoot = isWeb ? import('@/web/WebApp') : import('./App')

loadRoot.then(({ default: RootApp }) => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RootApp />
      </QueryClientProvider>
    </React.StrictMode>
  )
})
