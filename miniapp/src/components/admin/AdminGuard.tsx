/**
 * src/components/admin/AdminGuard.tsx
 * Route guard для admin-раздела.
 * GET /admin/me → 200 = админ, 403/401 = не админ.
 * В браузере → редирект на /admin/login.
 * В MiniApp → редирект на /.
 */

import { useEffect, useRef } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { useAdminStore } from '@/store/adminStore'
import LoadingScreen from '@/components/ui/LoadingScreen'

const isBrowser = !window.Telegram?.WebApp?.initData

export default function AdminGuard() {
  const { isAdmin, isChecked, setAdmin, setChecked } = useAdminStore()
  const checked = useRef(false)

  useEffect(() => {
    if (checked.current) return
    checked.current = true

    apiClient
      .get('/admin/me')
      .then(() => {
        setAdmin(true)
      })
      .catch(() => {
        setAdmin(false)
      })
      .finally(() => {
        setChecked()
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!isChecked) return <LoadingScreen />
  if (!isAdmin) {
    return <Navigate to={isBrowser ? '/admin/login' : '/'} replace />
  }

  return <Outlet />
}
