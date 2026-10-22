/**
 * src/web/WebApp.tsx
 * Корневой компонент публичного сайта (web-сборка, base /).
 * Изолирован от Telegram-инициализации App.tsx — никакого initData/splash.
 * Каталог публичен; вход — по коду из письма или через Telegram Login Widget.
 */

import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { ROUTER_BASENAME } from '@/config/appTarget'
import WebLayout from './WebLayout'
import RequireWebAuth from './auth/RequireWebAuth'
import ChatRoute from './chat/ChatRoute'
import './web.css'

const WebHomePage = lazy(() => import('./pages/WebHomePage'))
const WebCatalogPage = lazy(() => import('./pages/WebCatalogPage'))
const WebCashbackPage = lazy(() => import('./pages/WebCashbackPage'))
const WebRequestPage = lazy(() => import('./pages/WebRequestPage'))
const WebGamePage = lazy(() => import('./pages/WebGamePage'))
const WebLoginPage = lazy(() => import('./pages/WebLoginPage'))
const WebCartPage = lazy(() => import('./pages/WebCartPage'))
const WebCheckoutPage = lazy(() => import('./pages/WebCheckoutPage'))
const WebOrderPage = lazy(() => import('./pages/WebOrderPage'))
const WebOrdersPage = lazy(() => import('./pages/WebOrdersPage'))
const WebBalancePage = lazy(() => import('./pages/WebBalancePage'))
const WebProfilePage = lazy(() => import('./pages/WebProfilePage'))

export default function WebApp() {
  return (
    <BrowserRouter basename={ROUTER_BASENAME}>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#15171C',
            color: '#fff',
            border: '1px solid transparent',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 500,
          },
          success: { iconTheme: { primary: '#7FA6F5', secondary: '#15171C' } },
          error: { iconTheme: { primary: '#f87171', secondary: '#15171C' } },
        }}
      />
      <Routes>
        <Route element={<WebLayout />}>
          <Route index element={<Suspense fallback={null}><WebHomePage /></Suspense>} />
          <Route path="catalog" element={<Suspense fallback={null}><WebCatalogPage /></Suspense>} />
          <Route path="cashback" element={<Suspense fallback={null}><WebCashbackPage /></Suspense>} />
          <Route path="request" element={<RequireWebAuth><Suspense fallback={null}><WebRequestPage /></Suspense></RequireWebAuth>} />
          <Route path="game/:slug" element={<Suspense fallback={null}><WebGamePage /></Suspense>} />
          <Route path="login" element={<Suspense fallback={null}><WebLoginPage /></Suspense>} />
          <Route path="cart" element={<RequireWebAuth><Suspense fallback={null}><WebCartPage /></Suspense></RequireWebAuth>} />
          <Route path="checkout" element={<RequireWebAuth><Suspense fallback={null}><WebCheckoutPage /></Suspense></RequireWebAuth>} />
          <Route path="orders" element={<RequireWebAuth><Suspense fallback={null}><WebOrdersPage /></Suspense></RequireWebAuth>} />
          <Route path="orders/:id" element={<RequireWebAuth><Suspense fallback={null}><WebOrderPage /></Suspense></RequireWebAuth>} />
          <Route path="balance" element={<RequireWebAuth><Suspense fallback={null}><WebBalancePage /></Suspense></RequireWebAuth>} />
          <Route path="chat" element={<ChatRoute />} />
          <Route path="profile" element={<RequireWebAuth><Suspense fallback={null}><WebProfilePage /></Suspense></RequireWebAuth>} />
          <Route path="referrals" element={<Navigate to="/profile" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
