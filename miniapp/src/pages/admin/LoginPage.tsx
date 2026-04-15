/**
 * src/pages/admin/LoginPage.tsx
 * Страница входа в админку через Telegram Login Widget.
 */

import { useEffect, useRef, useState } from 'react'
import { Shield, Loader2 } from 'lucide-react'
import axios from 'axios'

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME ?? 'redonate_bot'
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
      className="min-h-screen flex flex-col items-center justify-center gap-8 px-4"
      style={{ background: '#060f1e' }}
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(45,88,173,0.15)', border: '1px solid rgba(45,88,173,0.3)' }}
        >
          <Shield size={32} style={{ color: '#6b9de8' }} />
        </div>
        <h1 className="text-xl font-bold" style={{ color: '#fff' }}>
          Панель управления
        </h1>
        <p className="text-sm text-center max-w-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Войдите через Telegram для доступа к администрированию
        </p>
      </div>

      <div ref={widgetRef} />

      <p
        id="login-status"
        className="text-sm h-5"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      >
        {loading && <Loader2 size={16} className="animate-spin inline mr-1" />}
      </p>
    </div>
  )
}
