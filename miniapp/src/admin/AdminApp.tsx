/**
 * src/admin/AdminApp.tsx
 * Корень отдельной сборки админки — admin.redonate.gg (VITE_APP_TARGET=admin).
 *
 * Вход — cookie-сессия (api/routers/admin/session_auth.py): в браузере через бот
 * поддержки или почту, внутри Telegram — сам (AdminGuard). Ссылки из уведомлений
 * бота поддержки t.me/<бот>?startapp=order_<id> открывают нужный экран.
 * Адреса страниц те же, что у старой админки (/admin/...), корень → /admin.
 */

import { Component, lazy, Suspense, useEffect, useRef, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import AdminLayout from '@/components/admin/AdminLayout'
import AdminGuard from '@/components/admin/AdminGuard'

const AdminLogin       = lazy(() => import('@/admin/LoginPage'))
const AdminDashboard   = lazy(() => import('@/pages/admin/DashboardPage'))
const AdminOrders      = lazy(() => import('@/pages/admin/OrdersPage'))
const AdminOrderDetail = lazy(() => import('@/pages/admin/OrderDetailPage'))
const AdminOrdersTrash = lazy(() => import('@/pages/admin/OrdersTrashPage'))
const AdminCatalog     = lazy(() => import('@/pages/admin/CatalogPage'))
const AdminProductEdit = lazy(() => import('@/pages/admin/ProductEditPage'))
const AdminGamesList   = lazy(() => import('@/pages/admin/GamesListPage'))
const AdminGameEdit    = lazy(() => import('@/pages/admin/GameEditPage'))
const AdminUsers       = lazy(() => import('@/pages/admin/UsersPage'))
const AdminUserDetail  = lazy(() => import('@/pages/admin/UserDetailPage'))
const AdminDiscounts   = lazy(() => import('@/pages/admin/DiscountsPage'))
const AdminSupport     = lazy(() => import('@/pages/admin/SupportPage'))
const AdminLoyalty     = lazy(() => import('@/pages/admin/LoyaltySettingsPage'))
const AdminPricing     = lazy(() => import('@/pages/admin/PricingSettingsPage'))
const AdminHome        = lazy(() => import('@/pages/admin/HomeSettingsPage'))
const AdminReviews     = lazy(() => import('@/pages/admin/ReviewsAdminPage'))
const AdminIntegrations = lazy(() => import('@/pages/admin/IntegrationsPage'))
const AdminContent     = lazy(() => import('@/pages/admin/ContentPage'))
const AdminChats       = lazy(() => import('@/pages/admin/AdminChatsPage'))
const AdminStaff       = lazy(() => import('@/pages/admin/StaffPage'))
const AdminAudit       = lazy(() => import('@/pages/admin/AuditPage'))
const AdminSecurity    = lazy(() => import('@/pages/admin/SecurityPage'))

// Новая сборка на сервере — старые чанки пропали: перезагружаем страницу
class ChunkErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch() { window.location.reload() }
  render() { return this.state.hasError ? null : this.props.children }
}

const page = (el: ReactNode) => (
  <ChunkErrorBoundary><Suspense fallback={null}>{el}</Suspense></ChunkErrorBoundary>
)

/** startapp из ссылок бота поддержки: order_<id>, chat_<id>, ticket_<id> (и старые admin_order_…). */
const START_ROUTES: Array<[string, (rest: string) => string]> = [
  ['order_', (id) => `/admin/orders/${id}`],
  ['chat_', (id) => `/admin/chats/${id}`],
  ['ticket_', (id) => `/admin/support?ticket=${id}`],
]

function StartParam() {
  const navigate = useNavigate()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    const raw = window.Telegram?.WebApp?.initDataUnsafe?.start_param
    if (!raw) return
    const param = raw.replace(/^admin_/, '')
    for (const [prefix, build] of START_ROUTES) {
      if (param.startsWith(prefix) && param.length > prefix.length) {
        navigate(build(param.slice(prefix.length)))
        return
      }
    }
  }, [navigate])
  return null
}

export default function AdminApp() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp
    try { tg?.ready?.(); tg?.expand?.() } catch { /* вне Telegram */ }
  }, [])

  return (
    <BrowserRouter>
      <StartParam />
      <Toaster
        position="top-center"
        toastOptions={{
          style: { background: '#15171C', color: '#DCEBFF', border: '1px solid rgba(220,235,255,0.1)', borderRadius: '12px', fontSize: '14px', fontWeight: 500 },
          success: { iconTheme: { primary: '#7FA6F5', secondary: '#15171C' } },
          error: { iconTheme: { primary: '#f87171', secondary: '#15171C' } },
        }}
      />
      <Routes>
        <Route path="/admin/login" element={page(<AdminLogin />)} />
        <Route path="/admin" element={page(<AdminGuard />)}>
          <Route element={<AdminLayout />}>
            <Route index element={page(<AdminDashboard />)} />
            <Route path="orders" element={page(<AdminOrders />)} />
            <Route path="orders/trash" element={page(<AdminOrdersTrash />)} />
            <Route path="orders/:id" element={page(<AdminOrderDetail />)} />
            <Route path="catalog" element={page(<AdminCatalog />)} />
            <Route path="catalog/products/:id" element={page(<AdminProductEdit />)} />
            <Route path="catalog/games" element={page(<AdminGamesList />)} />
            <Route path="catalog/games/:id" element={page(<AdminGameEdit />)} />
            <Route path="users" element={page(<AdminUsers />)} />
            <Route path="users/:id" element={page(<AdminUserDetail />)} />
            <Route path="discounts" element={page(<AdminDiscounts />)} />
            <Route path="support" element={page(<AdminSupport />)} />
            <Route path="settings/loyalty" element={page(<AdminLoyalty />)} />
            <Route path="settings/pricing" element={page(<AdminPricing />)} />
            <Route path="settings/home" element={page(<AdminHome />)} />
            <Route path="settings/integrations" element={page(<AdminIntegrations />)} />
            <Route path="settings/content" element={page(<AdminContent />)} />
            <Route path="reviews" element={page(<AdminReviews />)} />
            <Route path="chats" element={page(<AdminChats />)} />
            <Route path="chats/:id" element={page(<AdminChats />)} />
            <Route path="staff" element={page(<AdminStaff />)} />
            <Route path="audit" element={page(<AdminAudit />)} />
            <Route path="security" element={page(<AdminSecurity />)} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
