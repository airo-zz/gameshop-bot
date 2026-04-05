// src/App.tsx
import { lazy, Suspense, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useTelegram } from '@/hooks/useTelegram'
import { authenticateWithTelegram } from '@/api/client'
import { useAuthStore, useCartStore } from '@/store'
import { cartApi } from '@/api'

import Layout from '@/components/layout/Layout'
import LoadingScreen from '@/components/ui/LoadingScreen'
import ErrorScreen from '@/components/ui/ErrorScreen'

const HomePage       = lazy(() => import('@/pages/HomePage'))
const CatalogPage    = lazy(() => import('@/pages/CatalogPage'))
const GamePage       = lazy(() => import('@/pages/GamePage'))
const ProductPage    = lazy(() => import('@/pages/ProductPage'))
const CartPage       = lazy(() => import('@/pages/CartPage'))
const CheckoutPage   = lazy(() => import('@/pages/CheckoutPage'))
const OrdersPage     = lazy(() => import('@/pages/OrdersPage'))
const OrderDetailPage = lazy(() => import('@/pages/OrderDetailPage'))
const ProfilePage    = lazy(() => import('@/pages/ProfilePage'))
const FavoritesPage  = lazy(() => import('@/pages/FavoritesPage'))
const SearchPage     = lazy(() => import('@/pages/SearchPage'))
const SupportPage    = lazy(() => import('@/pages/SupportPage'))

export default function App() {
  const { initData } = useTelegram()
  const { isReady, isError, setReady, setError } = useAuthStore()
  const { setItemsCount } = useCartStore()
  // Гарантируем что init() выполнится ровно один раз,
  // независимо от нестабильности ссылок в deps
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    async function init() {
      try {
        // Авторизуемся через Telegram initData
        if (initData) {
          try {
            await authenticateWithTelegram(initData)
          } catch {
            // Auth API может быть недоступен — продолжаем без токена
          }
        }

        // Загружаем корзину (не критично если упадёт)
        try {
          const cart = await cartApi.get()
          setItemsCount(cart.items_count)
        } catch {
          // OK — пользователь не авторизован или API недоступен
        }

        setReady()
      } catch (err) {
        console.error('Init failed:', err)
        setError()
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isError) return <ErrorScreen />
  if (!isReady) return <LoadingScreen />

  return (
    <BrowserRouter basename="/app">
      <Toaster
        position="top-center"
        containerStyle={{
          top: 'calc(56px + var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px) + 8px)',
        }}
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
          error:   { iconTheme: { primary: '#f87171', secondary: '#060f1e' } },
        }}
      />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Suspense fallback={<LoadingScreen />}><HomePage /></Suspense>} />
          <Route path="catalog"      element={<Suspense fallback={<LoadingScreen />}><CatalogPage /></Suspense>} />
          <Route path="catalog/:slug" element={<Suspense fallback={<LoadingScreen />}><GamePage /></Suspense>} />
          <Route path="product/:id"  element={<Suspense fallback={<LoadingScreen />}><ProductPage /></Suspense>} />
          <Route path="cart"         element={<Suspense fallback={<LoadingScreen />}><CartPage /></Suspense>} />
          <Route path="checkout"     element={<Suspense fallback={<LoadingScreen />}><CheckoutPage /></Suspense>} />
          <Route path="orders"       element={<Suspense fallback={<LoadingScreen />}><OrdersPage /></Suspense>} />
          <Route path="orders/:id"   element={<Suspense fallback={<LoadingScreen />}><OrderDetailPage /></Suspense>} />
          <Route path="profile"      element={<Suspense fallback={<LoadingScreen />}><ProfilePage /></Suspense>} />
          <Route path="favorites"    element={<Suspense fallback={<LoadingScreen />}><FavoritesPage /></Suspense>} />
          <Route path="search"       element={<Suspense fallback={<LoadingScreen />}><SearchPage /></Suspense>} />
          <Route path="support"      element={<Suspense fallback={<LoadingScreen />}><SupportPage /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
