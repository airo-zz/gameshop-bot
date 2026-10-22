/**
 * src/web/pages/WebLoginPage.tsx
 * Вход на сайт через Telegram Login Widget.
 */

import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Send } from '@/components/ui/icons'
import TelegramLoginButton from '@/web/components/TelegramLoginButton'
import { useWebAuth } from '@/web/auth/useWebAuth'
import type { TelegramWidgetUser } from '@/api/client'
import { SHOP_NAME } from '@/config/appTarget'

export default function WebLoginPage() {
  const { login, isAuthenticated, ready } = useWebAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/'

  useEffect(() => {
    if (ready && isAuthenticated) navigate(redirectTo, { replace: true })
  }, [ready, isAuthenticated, navigate, redirectTo])

  const handleAuth = async (user: TelegramWidgetUser) => {
    try {
      await login(user)
      toast.success('Вы вошли')
      navigate(redirectTo, { replace: true })
    } catch {
      toast.error('Не удалось войти')
    }
  }

  return (
    <div className="web-container flex items-center justify-center py-24">
      <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--bg2)] p-8 text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ background: 'rgba(37,99,235,0.15)', color: 'var(--link)' }}
        >
          <Send size={24} />
        </div>
        <h1 className="text-2xl font-semibold text-[var(--text)]">Вход в {SHOP_NAME}</h1>
        <p className="text-sm text-[var(--hint)] mt-2 mb-7">
          Войдите через Telegram, чтобы оформлять заказы и следить за ними.
        </p>

        <div className="flex justify-center">
          <TelegramLoginButton onAuth={handleAuth} />
        </div>

        <p className="text-xs text-[var(--hint)] mt-6">
          Нажимая «Войти», вы соглашаетесь с{' '}
          <a href="/app/legal/terms.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--text-2)]">условиями сервиса</a>
          {' '}и{' '}
          <a href="/app/legal/privacy.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--text-2)]">политикой конфиденциальности</a>.
        </p>
      </div>
    </div>
  )
}
