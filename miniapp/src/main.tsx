// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { isWeb } from '@/config/appTarget'
import App from './App'
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

// Корневой компонент выбирается по цели сборки. Web-версия изолирована от
// Telegram-инициализации (App.tsx), чтобы не влиять на /app.
function Root() {
  if (isWeb) {
    const WebApp = React.lazy(() => import('@/web/WebApp'))
    return (
      <React.Suspense fallback={null}>
        <WebApp />
      </React.Suspense>
    )
  }
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </React.StrictMode>
)
