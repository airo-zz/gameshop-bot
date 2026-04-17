// src/App.tsx
import { lazy, Suspense, useEffect, useRef, useState, Component, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useTelegram } from '@/hooks/useTelegram'
import { authenticateWithTelegram } from '@/api/client'
import { useAuthStore, useCartStore } from '@/store'
import { cartApi } from '@/api'

import Layout from '@/components/layout/Layout'
import TelegramBackButton from '@/components/TelegramBackButton'
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
      <Suspense fallback={<LoadingScreen />}>{children}</Suspense>
    </ChunkErrorBoundary>
  )
}

const HomePage       = lazy(() => import('@/pages/HomePage'))
const CatalogPage    = lazy(() => import('@/pages/CatalogPage'))
const GamePage       = lazy(() => import('@/pages/GamePage'))
const CartPage       = lazy(() => import('@/pages/CartPage'))
const CheckoutPage   = lazy(() => import('@/pages/CheckoutPage'))
const OrdersPage     = lazy(() => import('@/pages/OrdersPage'))
const OrderDetailPage = lazy(() => import('@/pages/OrderDetailPage'))
const ProfilePage    = lazy(() => import('@/pages/ProfilePage'))
const FavoritesPage  = lazy(() => import('@/pages/FavoritesPage'))
const SearchPage     = lazy(() => import('@/pages/SearchPage'))
const SupportPage    = lazy(() => import('@/pages/SupportPage'))
const ChatPage       = lazy(() => import('@/pages/ChatPage'))

// Admin
const AdminLayout      = lazy(() => import('@/components/admin/AdminLayout'))
const AdminGuard       = lazy(() => import('@/components/admin/AdminGuard'))
const AdminDashboard   = lazy(() => import('@/pages/admin/DashboardPage'))
const AdminOrders      = lazy(() => import('@/pages/admin/OrdersPage'))
const AdminOrderDetail = lazy(() => import('@/pages/admin/OrderDetailPage'))
const AdminCatalog     = lazy(() => import('@/pages/admin/CatalogPage'))
const AdminUsers       = lazy(() => import('@/pages/admin/UsersPage'))
const AdminUserDetail  = lazy(() => import('@/pages/admin/UserDetailPage'))
const AdminDiscounts   = lazy(() => import('@/pages/admin/DiscountsPage'))
const AdminProductEdit = lazy(() => import('@/pages/admin/ProductEditPage'))
const AdminGameEdit    = lazy(() => import('@/pages/admin/GameEditPage'))
const AdminGamesList   = lazy(() => import('@/pages/admin/GamesListPage'))
const AdminSupport     = lazy(() => import('@/pages/admin/SupportPage'))
const AdminLogin       = lazy(() => import('@/pages/admin/LoginPage'))
const AdminLoyalty     = lazy(() => import('@/pages/admin/LoyaltySettingsPage'))
const AdminOrdersTrash = lazy(() => import('@/pages/admin/OrdersTrashPage'))
const AdminChatsPage   = lazy(() => import('@/pages/admin/AdminChatsPage'))

const BalancePage   = lazy(() => import('@/pages/BalancePage'))
const ReferralsPage = lazy(() => import('@/pages/ReferralsPage'))

export default function App() {
  const { initData } = useTelegram()
  const { isReady, isError, setReady, setError } = useAuthStore()
  const { setItemsCount } = useCartStore()
  const initialized = useRef(false)
  // Плавный fade-out сплэша: exiting=true запускает анимацию, затем убираем сплэш
  const [splashExiting, setSplashExiting] = useState(false)
  const [splashGone, setSplashGone] = useState(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    async function init() {
      try {
        if (initData) {
          try {
            await authenticateWithTelegram(initData)
          } catch {
            // Auth API может быть недоступен — продолжаем без токена
          }
        }

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

  // Когда приложение готово — запускаем fade-out сплэша
  useEffect(() => {
    if (!isReady) return
    setSplashExiting(true)
    const t = setTimeout(() => setSplashGone(true), 380)
    return () => clearTimeout(t)
  }, [isReady])

  if (isError) return <ErrorScreen />
  if (!splashGone) return <LoadingScreen exiting={splashExiting} />

  return (
    <BrowserRouter basename="/app">
      <TelegramBackButton />
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
          <Route path="cart"         element={<LazyPage><CartPage /></LazyPage>} />
          <Route path="checkout"     element={<LazyPage><CheckoutPage /></LazyPage>} />
          <Route path="orders"       element={<LazyPage><OrdersPage /></LazyPage>} />
          <Route path="orders/:id"   element={<LazyPage><OrderDetailPage /></LazyPage>} />
          <Route path="profile"      element={<LazyPage><ProfilePage /></LazyPage>} />
          <Route path="favorites"    element={<LazyPage><FavoritesPage /></LazyPage>} />
          <Route path="search"       element={<LazyPage><SearchPage /></LazyPage>} />
          <Route path="chat"         element={<LazyPage><ChatPage /></LazyPage>} />
          <Route path="support"      element={<LazyPage><SupportPage /></LazyPage>} />
          <Route path="balance"      element={<LazyPage><BalancePage /></LazyPage>} />
          <Route path="referrals"    element={<LazyPage><ReferralsPage /></LazyPage>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>

        {/* Admin login — outside guard */}
        <Route path="/admin/login" element={<LazyPage><AdminLogin /></LazyPage>} />

        {/* Admin routes — guarded, separate layout, no main nav */}
        <Route
          path="/admin"
          element={
            <LazyPage>
              <AdminGuard />
            </LazyPage>
          }
        >
          <Route
            element={
              <LazyPage>
                <AdminLayout />
              </LazyPage>
            }
          >
            <Route index element={<LazyPage><AdminDashboard /></LazyPage>} />
            <Route path="orders" element={<LazyPage><AdminOrders /></LazyPage>} />
            <Route path="orders/trash" element={<LazyPage><AdminOrdersTrash /></LazyPage>} />
            <Route path="orders/:id" element={<LazyPage><AdminOrderDetail /></LazyPage>} />
            <Route path="catalog" element={<LazyPage><AdminCatalog /></LazyPage>} />
            <Route path="catalog/products/:id" element={<LazyPage><AdminProductEdit /></LazyPage>} />
            <Route path="catalog/games" element={<LazyPage><AdminGamesList /></LazyPage>} />
            <Route path="catalog/games/:id" element={<LazyPage><AdminGameEdit /></LazyPage>} />
            <Route path="users" element={<LazyPage><AdminUsers /></LazyPage>} />
            <Route path="users/:id" element={<LazyPage><AdminUserDetail /></LazyPage>} />
            <Route path="discounts" element={<LazyPage><AdminDiscounts /></LazyPage>} />
            <Route path="support" element={<LazyPage><AdminSupport /></LazyPage>} />
            <Route path="settings/loyalty" element={<LazyPage><AdminLoyalty /></LazyPage>} />
            <Route path="chats" element={<LazyPage><AdminChatsPage /></LazyPage>} />
            <Route path="chats/:id" element={<LazyPage><AdminChatsPage /></LazyPage>} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
