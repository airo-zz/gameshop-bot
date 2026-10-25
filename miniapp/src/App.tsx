// src/App.tsx
import { lazy, Suspense, useEffect, useRef, Component, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { useTelegram } from '@/hooks/useTelegram'
import { authenticateWithTelegram } from '@/api/client'
import { useAuthStore, useCartStore } from '@/store'
import { cartApi, catalogApi, profileApi } from '@/api'

import Layout from '@/components/layout/Layout'
import TelegramBackButton from '@/components/TelegramBackButton'
import StartParamRedirect from '@/components/StartParamRedirect'
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

// Навигация между страницами — тихая, без полноэкранного сплэша
function LazyPage({ children }: { children: ReactNode }) {
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={null}>{children}</Suspense>
    </ChunkErrorBoundary>
  )
}

// Сплэш живёт в index.html (виден до загрузки JS). Гасим его CSS-переходом и удаляем.
function hideBootSplash() {
  const el = document.getElementById('boot-splash')
  if (!el) return
  el.classList.add('is-hidden')
  setTimeout(() => el.remove(), 350)
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
const PayOrderPage   = lazy(() => import('@/pages/PayOrderPage'))
const CustomOrderPage = lazy(() => import('@/pages/CustomOrderPage'))
const ReviewsPage    = lazy(() => import('@/pages/ReviewsPage'))

// Admin — structural components eagerly imported to avoid cascading Suspense flashes
import AdminLayout from '@/components/admin/AdminLayout'
import AdminGuard  from '@/components/admin/AdminGuard'
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
const AdminContent     = lazy(() => import('@/pages/admin/ContentPage'))
const AdminPricing     = lazy(() => import('@/pages/admin/PricingSettingsPage'))
const AdminHome        = lazy(() => import('@/pages/admin/HomeSettingsPage'))
const AdminReviews     = lazy(() => import('@/pages/admin/ReviewsAdminPage'))
const AdminIntegrations = lazy(() => import('@/pages/admin/IntegrationsPage'))
const AdminDecor = lazy(() => import('@/pages/admin/DecorSettingsPage'))
const AdminOrdersTrash = lazy(() => import('@/pages/admin/OrdersTrashPage'))
const AdminChatsPage   = lazy(() => import('@/pages/admin/AdminChatsPage'))

const BalancePage   = lazy(() => import('@/pages/BalancePage'))
const ReferralsPage = lazy(() => import('@/pages/ReferralsPage'))

export default function App() {
  const { initData } = useTelegram()
  const { isReady, isError, setReady, setError } = useAuthStore()
  const { setItemsCount } = useCartStore()
  const queryClient = useQueryClient()
  const initialized = useRef(false)
  const initStartedAt = useRef(Date.now())

  useEffect(() => {
    const twa = (window as any).Telegram?.WebApp
    try { if (twa?.lockOrientation) twa.lockOrientation() } catch { /* ignore */ }
    // Set CSS var for content safe area (includes Telegram buttons offset)
    const top = twa?.contentSafeAreaInset?.top ?? twa?.safeAreaInset?.top ?? 0
    document.documentElement.style.setProperty('--tg-content-safe-top', `${top}px`)
  }, [])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    async function init() {
      try {
        // 1. Аутентификация — блокирующая, все последующие запросы требуют токен
        if (initData) {
          try {
            await authenticateWithTelegram(initData)
          } catch {
            // Auth API недоступен — продолжаем без токена
          }
        }

        // 2. Параллельно грузим всё нужное для главной страницы +
        //    preload самого чанка HomePage. Без preload React.lazy
        //    выкидывает Suspense fallback после скрытия сплэша — и
        //    пользователь видит сплэш дважды.
        const [cartResult] = await Promise.allSettled([
          cartApi.get(),
          import('@/pages/HomePage'),
          queryClient.prefetchQuery({
            queryKey: ['games', 'game'],
            queryFn: () => catalogApi.getGames('game'),
            staleTime: 5 * 60_000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['trending-categories'],
            queryFn: catalogApi.getTrendingCategories,
            staleTime: 2 * 60_000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['profile'],
            queryFn: profileApi.get,
            staleTime: 5 * 60_000,
          }),
        ])

        if (cartResult.status === 'fulfilled') {
          setItemsCount(cartResult.value.items_count)
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

  // Приложение уже смонтировано под сплэшем — гасим его через 2 кадра после
  // первого рендера, чтобы тяжёлый mount главной не совпадал с анимацией.
  // Не раньше конца анимации сплэша (~2,45 с от открытия).
  useEffect(() => {
    if (!isReady && !isError) return
    // Сплэш «перо» (index.html) доигрывает до конца — ~2,45 с от старта страницы
    const SPLASH_ANIM_MS = 2450
    const splashStart = (window as Window & { __bootSplashStart?: number }).__bootSplashStart ?? initStartedAt.current
    const delay = Math.max(0, SPLASH_ANIM_MS - (Date.now() - splashStart))
    let raf = 0
    const t = setTimeout(() => {
      raf = requestAnimationFrame(() => { raf = requestAnimationFrame(hideBootSplash) })
    }, delay)
    return () => { clearTimeout(t); cancelAnimationFrame(raf) }
  }, [isReady, isError])

  if (isError) return <ErrorScreen />
  if (!isReady) return null

  return (
    <BrowserRouter basename="/app">
      <TelegramBackButton />
      <StartParamRedirect />
      <Toaster
        position="top-center"
        containerStyle={{
          top: 'calc(56px + var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px) + 8px)',
        }}
        toastOptions={{
          style: {
            background: '#15171C',
            color: '#DCEBFF',
            border: '1px solid rgba(220,235,255,0.1)',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 500,
          },
          success: { iconTheme: { primary: '#7FA6F5', secondary: '#15171C' } },
          error:   { iconTheme: { primary: '#f87171', secondary: '#15171C' } },
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
          <Route path="pay/:orderId" element={<LazyPage><PayOrderPage /></LazyPage>} />
          <Route path="custom-order" element={<LazyPage><CustomOrderPage /></LazyPage>} />
          <Route path="profile"      element={<LazyPage><ProfilePage /></LazyPage>} />
          <Route path="favorites"    element={<LazyPage><FavoritesPage /></LazyPage>} />
          <Route path="search"       element={<LazyPage><SearchPage /></LazyPage>} />
          <Route path="chat"         element={<LazyPage><ChatPage /></LazyPage>} />
          <Route path="support"      element={<LazyPage><SupportPage /></LazyPage>} />
          <Route path="balance"      element={<LazyPage><BalancePage /></LazyPage>} />
          <Route path="referrals"    element={<LazyPage><ReferralsPage /></LazyPage>} />
          <Route path="reviews"      element={<LazyPage><ReviewsPage /></LazyPage>} />
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
          <Route element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="orders/trash" element={<AdminOrdersTrash />} />
            <Route path="orders/:id" element={<AdminOrderDetail />} />
            <Route path="catalog" element={<AdminCatalog />} />
            <Route path="catalog/products/:id" element={<AdminProductEdit />} />
            <Route path="catalog/games" element={<AdminGamesList />} />
            <Route path="catalog/games/:id" element={<AdminGameEdit />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="users/:id" element={<AdminUserDetail />} />
            <Route path="discounts" element={<AdminDiscounts />} />
            <Route path="support" element={<AdminSupport />} />
            <Route path="settings/loyalty" element={<AdminLoyalty />} />
            <Route path="settings/pricing" element={<AdminPricing />} />
            <Route path="settings/home" element={<AdminHome />} />
            <Route path="reviews" element={<AdminReviews />} />
            <Route path="settings/integrations" element={<AdminIntegrations />} />
            <Route path="decor" element={<AdminDecor />} />
            <Route path="settings/content" element={<AdminContent />} />
            <Route path="chats" element={<AdminChatsPage />} />
            <Route path="chats/:id" element={<AdminChatsPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
