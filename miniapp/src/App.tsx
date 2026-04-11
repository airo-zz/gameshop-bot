// src/App.tsx
import { lazy, Suspense, useEffect, useRef, Component, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useTelegram } from '@/hooks/useTelegram'
import { authenticateWithTelegram } from '@/api/client'
import { useAuthStore, useCartStore } from '@/store'
import { cartApi } from '@/api'

import Layout from '@/components/layout/Layout'
import LoadingScreen from '@/components/ui/LoadingScreen'
import ErrorScreen from '@/components/ui/ErrorScreen'

// ErrorBoundary для lazy-loaded chunk'ов — при ошибке загрузки перезагружает страницу
class ChunkErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error: Error) {
    // Если chunk не загрузился — перезагрузить страницу один раз
    if (error.message?.includes('Failed to fetch dynamically imported module') ||
        error.message?.includes('Loading chunk') ||
        error.message?.includes('Loading CSS chunk')) {
      const key = 'chunk_reload'
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1')
        window.location.reload()
        return
      }
      sessionStorage.removeItem(key)
    }
  }
  render() {
    if (this.state.hasError) return <ErrorScreen />
    return this.props.children
  }
}

function LazyPage({ children }: { children: ReactNode }) {
  return (
    <ChunkErrorBoundary>
      <LazyPage>{children}</LazyPage>
    </ChunkErrorBoundary>
  )
}

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
          <Route index element={<LazyPage><HomePage /></LazyPage>} />
          <Route path="catalog"      element={<LazyPage><CatalogPage /></LazyPage>} />
          <Route path="catalog/:slug" element={<LazyPage><GamePage /></LazyPage>} />
          <Route path="product/:id"  element={<LazyPage><ProductPage /></LazyPage>} />
          <Route path="cart"         element={<LazyPage><CartPage /></LazyPage>} />
          <Route path="checkout"     element={<LazyPage><CheckoutPage /></LazyPage>} />
          <Route path="orders"       element={<LazyPage><OrdersPage /></LazyPage>} />
          <Route path="orders/:id"   element={<LazyPage><OrderDetailPage /></LazyPage>} />
          <Route path="profile"      element={<LazyPage><ProfilePage /></LazyPage>} />
          <Route path="favorites"    element={<LazyPage><FavoritesPage /></LazyPage>} />
          <Route path="search"       element={<LazyPage><SearchPage /></LazyPage>} />
          <Route path="support"      element={<LazyPage><SupportPage /></LazyPage>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
