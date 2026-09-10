/**
 * src/web/auth/RequireWebAuth.tsx
 * Гард: пускает только авторизованных. Иначе — редирект на /login,
 * запоминая, куда пользователь шёл (location.state.from).
 */

import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useWebAuth } from '@/web/auth/useWebAuth'

export default function RequireWebAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, ready } = useWebAuth()
  const location = useLocation()

  if (!ready) {
    return <div className="web-container py-24 text-center text-sm text-white/40">Загрузка...</div>
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <>{children}</>
}
