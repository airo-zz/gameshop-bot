/**
 * src/pages/admin/LoginPage.tsx
 * Страница входа в админку через Telegram Login Widget.
 */

import { useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { apiClient } from '@/api/client'
import { setTokens } from '@/api/client'
import { useAdminStore } from '@/store/adminStore'

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME ?? 'redonate_bot'

interface TelegramLoginData {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const { setAdmin, setChecked } = useAdminStore()
  const widgetRef = useRef<HTMLDivElement>(null)
  const scriptLoaded = useRef(false)

  const handleAuth = useCallback(async (data: TelegramLoginData) => {
    try {
      const res = await apiClient.post<{ access_token: string; refresh_token: string }>(
        '/admin/auth/telegram-login',
        data,
      )
      setTokens(res.data.access_token, res.data.refresh_token)
      setAdmin(true)
      setChecked()
      navigate('/admin', { replace: true })
    } catch {
      alert('Нет доступа. Убедитесь что ваш аккаунт добавлен в администраторы.')
    }
  }, [navigate, setAdmin, setChecked])

  useEffect(() => {
    if (scriptLoaded.current) return
    scriptLoaded.current = true

    // Telegram Login Widget вызывает глобальную callback-функцию
    ;(window as any).onTelegramAuth = (data: TelegramLoginData) => {
      handleAuth(data)
    }

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', BOT_USERNAME)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '12')
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')
    script.setAttribute('data-request-access', 'write')

    widgetRef.current?.appendChild(script)

    return () => {
      delete (window as any).onTelegramAuth
    }
  }, [handleAuth])

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
    </div>
  )
}
