/**
 * src/web/WebApp.tsx
 * Корневой компонент публичного сайта (web-сборка, base /).
 * Изолирован от Telegram-инициализации App.tsx — никакого initData/splash.
 * Каталог публичен, авторизация (Telegram Login Widget) добавится в фазе web-auth.
 */

import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { ROUTER_BASENAME } from '@/config/appTarget'
import WebLayout from './WebLayout'
import './web.css'

const WebHomePage = lazy(() => import('./pages/WebHomePage'))
const WebCatalogPage = lazy(() => import('./pages/WebCatalogPage'))
const WebGamePage = lazy(() => import('./pages/WebGamePage'))

export default function WebApp() {
  return (
    <BrowserRouter basename={ROUTER_BASENAME}>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#060f1e',
            color: '#fff',
            border: '1px solid rgba(45,88,173,0.4)',
            borderRadius: '14px',
            fontSize: '14px',
            fontWeight: 500,
          },
          success: { iconTheme: { primary: '#6b9de8', secondary: '#060f1e' } },
          error: { iconTheme: { primary: '#f87171', secondary: '#060f1e' } },
        }}
      />
      <Routes>
        <Route element={<WebLayout />}>
          <Route index element={<Suspense fallback={null}><WebHomePage /></Suspense>} />
          <Route path="catalog" element={<Suspense fallback={null}><WebCatalogPage /></Suspense>} />
          <Route path="game/:slug" element={<Suspense fallback={null}><WebGamePage /></Suspense>} />
          {/* Корзина/чекаут на вебе — следующая фаза (после Telegram-авторизации) */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
