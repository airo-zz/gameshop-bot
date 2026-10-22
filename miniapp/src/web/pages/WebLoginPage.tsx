/**
 * src/web/pages/WebLoginPage.tsx
 * Вход на сайт: по коду из письма (регистрация — тем же шагом) или через
 * Telegram Login Widget. Почта показывается, когда подключена отправка писем.
 */

import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import TelegramLoginButton from '@/web/components/TelegramLoginButton'
import EmailCodeForm from '@/web/components/EmailCodeForm'
import { useWebAuth } from '@/web/auth/useWebAuth'
import { getAuthMethods, requestEmailCode, type TelegramWidgetUser } from '@/api/client'
import { SHOP_NAME } from '@/config/appTarget'
import logoMark from '@/assets/logo-mark.png'
import { openChat } from '@/web/chat/chatStore'

export default function WebLoginPage() {
  const { login, loginWithEmail, isAuthenticated, ready } = useWebAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/'

  const { data: methods } = useQuery({
    queryKey: ['web', 'auth-methods'],
    queryFn: getAuthMethods,
    staleTime: 10 * 60_000,
  })
  const emailEnabled = !!methods?.email

  useEffect(() => {
    if (ready && isAuthenticated) navigate(redirectTo, { replace: true })
  }, [ready, isAuthenticated, navigate, redirectTo])

  const handleTelegram = async (user: TelegramWidgetUser) => {
    try {
      await login(user)
      toast.success('Вы вошли')
      navigate(redirectTo, { replace: true })
    } catch {
      toast.error('Не удалось войти')
    }
  }

  const handleEmail = async (email: string, code: string) => {
    const isNew = await loginWithEmail(email, code)
    if (isNew) {
      toast.success('Аккаунт создан. Покупали в нашем Telegram-боте? Привяжите Telegram в профиле — заказы и баланс объединятся.', { duration: 7000 })
    } else {
      toast.success('Вы вошли')
    }
    navigate(redirectTo, { replace: true })
  }

  return (
    <div className="web-container flex items-center justify-center py-16 md:py-24">
      <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--bg2)] p-7 md:p-8 text-center">
        <img src={logoMark} alt="" className="w-12 h-12 mx-auto mb-5 object-contain" />
        <h1 className="text-2xl text-[var(--text)]" style={{ margin: 0 }}>Вход в {SHOP_NAME}</h1>
        <p className="text-sm text-[var(--hint)] mt-2 mb-7">
          {emailEnabled
            ? 'Введите почту — пришлём код. Если аккаунта ещё нет, он создастся автоматически.'
            : 'Войдите через Telegram, чтобы оформлять заказы и следить за ними.'}
        </p>

        {emailEnabled && (
          <>
            <EmailCodeForm onRequest={requestEmailCode} onVerify={handleEmail} />
            <div className="flex items-center gap-3 my-6 text-xs text-[var(--hint)]">
              <span className="flex-1 h-px bg-[var(--border)]" />
              или
              <span className="flex-1 h-px bg-[var(--border)]" />
            </div>
          </>
        )}

        <div className="flex justify-center">
          <TelegramLoginButton onAuth={handleTelegram} />
        </div>

        {emailEnabled && (
          <p className="text-xs text-[var(--hint)] mt-5 leading-relaxed">
            Нет доступа к почте? Войдите через Telegram, если он привязан к аккаунту, или{' '}
            <button type="button" onClick={() => openChat()} className="underline hover:text-[var(--text-2)]">напишите в чат</button>.
          </p>
        )}

        <p className="text-xs text-[var(--hint)] mt-6">
          Входя на сайт, вы соглашаетесь с{' '}
          <a href="/app/legal/terms.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--text-2)]">условиями сервиса</a>
          {' '}и{' '}
          <a href="/app/legal/privacy.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--text-2)]">политикой конфиденциальности</a>.
        </p>
      </div>
    </div>
  )
}
