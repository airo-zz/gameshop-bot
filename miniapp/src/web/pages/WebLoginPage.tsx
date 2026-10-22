/**
 * src/web/pages/WebLoginPage.tsx
 * Вход на сайт: по коду из письма (регистрация — тем же шагом) или через
 * Telegram Login Widget. Почта показывается, когда подключена отправка писем.
 * Согласие на обработку персональных данных обязательно (без него способы
 * входа неактивны), согласие на рассылку — необязательное, снято по умолчанию.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Send } from '@/components/ui/icons'
import TelegramLoginButton from '@/web/components/TelegramLoginButton'
import EmailCodeForm from '@/web/components/EmailCodeForm'
import { useWebAuth } from '@/web/auth/useWebAuth'
import { getAuthMethods, requestEmailCode, type TelegramWidgetUser } from '@/api/client'
import { SHOP_NAME } from '@/config/appTarget'
import logoMark from '@/assets/logo-mark.png'
import { openChat } from '@/web/chat/chatStore'

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer text-left text-[13px] leading-snug text-[var(--text-2)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--accent)] cursor-pointer"
      />
      <span>{children}</span>
    </label>
  )
}

const docLink = 'underline hover:text-[var(--text)]'

export default function WebLoginPage() {
  const { login, loginWithEmail, isAuthenticated, ready } = useWebAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/'
  const [pd, setPd] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const consents = { pd_consent: pd, marketing_consent: marketing }

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
      await login(user, consents)
      toast.success('Вы вошли')
      navigate(redirectTo, { replace: true })
    } catch {
      toast.error('Не удалось войти')
    }
  }

  const handleEmail = async (email: string, code: string) => {
    const isNew = await loginWithEmail(email, code, consents)
    if (isNew) {
      toast.success('Аккаунт создан. Покупали в нашем Telegram-боте? Привяжите Telegram в профиле — заказы и баланс объединятся.', { duration: 7000 })
    } else {
      toast.success('Вы вошли')
    }
    navigate(redirectTo, { replace: true })
  }

  const requestCode = async (email: string) => {
    if (!pd) throw { response: { data: { detail: 'Отметьте согласие на обработку персональных данных' } } }
    await requestEmailCode(email)
  }

  return (
    <div className="web-container flex items-center justify-center py-16 md:py-24">
      <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--bg2)] p-7 md:p-8 text-center">
        <img src={logoMark} alt="" className="w-12 h-12 mx-auto mb-5 object-contain" />
        <h1 className="text-2xl text-[var(--text)]" style={{ margin: 0 }}>Вход в {SHOP_NAME}</h1>
        <p className="text-sm text-[var(--hint)] mt-2 mb-6">
          {emailEnabled
            ? 'Введите почту — пришлём код. Если аккаунта ещё нет, он создастся автоматически.'
            : 'Войдите через Telegram, чтобы оформлять заказы и следить за ними.'}
        </p>

        <div className="space-y-3 mb-6 rounded-2xl bg-[var(--bg3)] p-4">
          <Check checked={pd} onChange={setPd}>
            Я принимаю{' '}
            <a href="/app/legal/terms.html" target="_blank" rel="noopener noreferrer" className={docLink}>пользовательское соглашение</a>
            {' '}и даю{' '}
            <a href="/app/legal/consent.html" target="_blank" rel="noopener noreferrer" className={docLink}>согласие на обработку персональных данных</a>
            {' '}в соответствии с{' '}
            <a href="/app/legal/privacy.html" target="_blank" rel="noopener noreferrer" className={docLink}>политикой конфиденциальности</a>
          </Check>
          <Check checked={marketing} onChange={setMarketing}>
            Хочу получать письма об акциях и скидках (можно отписаться в любой момент)
          </Check>
        </div>

        <div className={pd ? '' : 'opacity-50'}>
          {emailEnabled && (
            <>
              <EmailCodeForm onRequest={requestCode} onVerify={handleEmail} />
              <div className="flex items-center gap-3 my-6 text-xs text-[var(--hint)]">
                <span className="flex-1 h-px bg-[var(--border)]" />
                или
                <span className="flex-1 h-px bg-[var(--border)]" />
              </div>
            </>
          )}

          <div className="flex justify-center">
            {pd ? (
              <TelegramLoginButton onAuth={handleTelegram} />
            ) : (
              <button
                type="button"
                onClick={() => toast.error('Отметьте согласие на обработку персональных данных')}
                className="inline-flex items-center gap-2 h-12 px-5 rounded-xl text-sm font-medium text-white bg-[#54a9eb]"
              >
                <Send size={18} /> Войти через Telegram
              </button>
            )}
          </div>
        </div>

        {emailEnabled && (
          <p className="text-xs text-[var(--hint)] mt-5 leading-relaxed">
            Нет доступа к почте? Войдите через Telegram, если он привязан к аккаунту, или{' '}
            <button type="button" onClick={() => openChat()} className="underline hover:text-[var(--text-2)]">напишите в чат</button>.
          </p>
        )}
      </div>
    </div>
  )
}
