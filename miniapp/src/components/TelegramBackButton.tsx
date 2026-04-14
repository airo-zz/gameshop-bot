/**
 * TelegramBackButton.tsx
 *
 * Global controller for Telegram's native back button.
 * - On root tab pages (/, /catalog, /cart, /favorites, /profile) — hidden
 *   (Telegram shows "Close" by default)
 * - On any nested page — shows BackButton that navigates back
 */

import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const ROOT_PATHS = ['/', '/catalog', '/cart', '/favorites', '/profile']

function isRootPage(pathname: string): boolean {
  return ROOT_PATHS.includes(pathname)
}

export default function TelegramBackButton() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (!tg?.BackButton) return

    if (isRootPage(pathname)) {
      tg.BackButton.hide()
    } else {
      const handler = () => navigate(-1)
      tg.BackButton.onClick(handler)
      tg.BackButton.show()
      return () => {
        tg.BackButton.offClick(handler)
        tg.BackButton.hide()
      }
    }
  }, [pathname, navigate])

  return null
}
