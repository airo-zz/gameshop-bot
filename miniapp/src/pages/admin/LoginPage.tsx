/**
 * src/pages/admin/LoginPage.tsx
 * Страница входа в админку через Telegram Login Widget.
 */

import { useEffect, useRef, useState } from 'react'
import { Shield, Loader2 } from '@/components/ui/icons'
import axios from 'axios'

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME ?? 'reDonate_robot'
const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

// Глобальный callback вне React — гарантированно доступен для виджета
;(window as any).onTelegramAuth = async (user: any) => {
  const statusEl = document.getElementById('login-status')
  if (statusEl) statusEl.textContent = 'Авторизация...'

  try {
    const res = await axios.post(`${BASE_URL}/admin/auth/telegram-login`, user)
    localStorage.setItem('access_token', res.data.access_token)
    localStorage.setItem('refresh_token', res.data.refresh_token)
    window.location.href = '/app/admin'
  } catch {
    if (statusEl) statusEl.textContent = 'Нет доступа. Убедитесь что ваш аккаунт в администраторах.'
  }
}

export default function AdminLoginPage() {
  const widgetRef = useRef<HTMLDivElement>(null)
  const scriptLoaded = useRef(false)
  const [loading] = useState(false)

  useEffect(() => {
    if (scriptLoaded.current) return
    scriptLoaded.current = true

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', BOT_USERNAME)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '12')
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')
    script.setAttribute('data-request-access', 'write')

    widgetRef.current?.appendChild(script)
  }, [])

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: '#101C36' }}
    >
      {/* Card */}
      <div className="w-full max-w-sm bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-8 flex flex-col items-center gap-6 shadow-[0_0_40px_rgba(0,0,0,0.4)] backdrop-blur-sm">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-blue-600/10 border border-blue-500/20">
          <Shield size={32} className="text-[var(--link)]" />
        </div>

        {/* Heading */}
        <div className="text-center space-y-1.5">
          <h1 className="text-xl font-bold text-[var(--text)]">
            Панель управления
          </h1>
          <p className="text-sm text-[var(--hint)] leading-relaxed">
            Войдите через Telegram для доступа к администрированию
          </p>
        </div>

        {/* Telegram widget */}
        <div ref={widgetRef} className="flex justify-center" />

        {/* Status */}
        <p
          id="login-status"
          className="text-sm text-center text-[var(--hint)] min-h-[20px]"
        >
          {loading && <Loader2 size={16} className="animate-spin inline mr-1" />}
        </p>
      </div>
    </div>
  )
}
