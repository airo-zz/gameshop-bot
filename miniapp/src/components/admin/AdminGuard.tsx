/**
 * src/components/admin/AdminGuard.tsx
 * Route guard для admin-раздела: GET /admin/me → 200 = сотрудник.
 *
 * Админка admin.redonate.gg (сборка admin):
 *   • внутри Telegram (бот поддержки) — вход сам, по подписанным данным Telegram;
 *   • в браузере — страница входа (/admin/login?next=…).
 * Старая админка внутри /app: в браузере — /admin/login, в Mini App — на главную.
 */

import { useEffect, useRef } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { isAdminApp } from '@/config/appTarget'
import { useAdminStore, type AdminMe } from '@/store/adminStore'
import LoadingScreen from '@/components/ui/LoadingScreen'

const tgInitData = () => window.Telegram?.WebApp?.initData || ''
const isBrowser = !tgInitData()

async function loadMe(): Promise<AdminMe> {
  return (await apiClient.get<AdminMe>('/admin/me')).data
}

export default function AdminGuard() {
  const { isAdmin, isChecked, setAdmin, setChecked, setMe } = useAdminStore()
  const checked = useRef(false)
  const location = useLocation()

  useEffect(() => {
    if (checked.current) return
    checked.current = true

    ;(async () => {
      try {
        setMe(await loadMe())
        setAdmin(true)
      } catch (e) {
        const status = (e as { response?: { status?: number } }).response?.status
        if (isAdminApp && status === 401 && tgInitData()) {
          try {
            await apiClient.post('/admin/auth/webapp', { init_data: tgInitData() })
            setMe(await loadMe())
            setAdmin(true)
            return
          } catch {
            /* нет доступа — ниже на страницу входа */
          }
        }
        setAdmin(false)
      } finally {
        setChecked()
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!isChecked) return <LoadingScreen />
  if (!isAdmin) {
    if (isAdminApp) {
      const next = encodeURIComponent(location.pathname + location.search)
      return <Navigate to={`/admin/login?next=${next}`} replace />
    }
    return <Navigate to={isBrowser ? '/admin/login' : '/'} replace />
  }

  return <Outlet />
}
