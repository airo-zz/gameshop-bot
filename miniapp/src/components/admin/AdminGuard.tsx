/**
 * src/components/admin/AdminGuard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Route guard для admin-раздела.
 *
 * Проверяет права через GET /admin/me при монтировании.
 * Если пользователь не admin — редиректит на /.
 * Пока идёт проверка — показывает LoadingScreen.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { useAdminStore } from '@/store/adminStore'
import LoadingScreen from '@/components/ui/LoadingScreen'

interface AdminMeResponse {
  is_admin: boolean
}

export default function AdminGuard() {
  const { isAdmin, isChecked, setAdmin, setChecked } = useAdminStore()
  const checked = useRef(false)

  useEffect(() => {
    if (checked.current) return
    checked.current = true

    apiClient
      .get<AdminMeResponse>('/admin/me')
      .then((res) => {
        setAdmin(res.data.is_admin)
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
  if (!isAdmin) return <Navigate to="/" replace />

  return <Outlet />
}
