/**
 * src/web/components/TelegramLoginButton.tsx
 * Кнопка «Войти через Telegram» (официальный Telegram Login Widget).
 * Работает только на домене, зарегистрированном в @BotFather (/setdomain).
 */

import { useEffect, useRef } from 'react'
import { BOT_USERNAME } from '@/config/appTarget'
import type { TelegramWidgetUser } from '@/api/client'

let seq = 0

interface Props {
  onAuth: (user: TelegramWidgetUser) => void
  size?: 'small' | 'medium' | 'large'
}

export default function TelegramLoginButton({ onAuth, size = 'large' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const onAuthRef = useRef(onAuth)
  onAuthRef.current = onAuth

  useEffect(() => {
    const cbName = `__tgLogin_${++seq}`
    ;(window as any)[cbName] = (user: TelegramWidgetUser) => onAuthRef.current(user)

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', BOT_USERNAME)
    script.setAttribute('data-size', size)
    script.setAttribute('data-userpic', 'true')
    script.setAttribute('data-request-access', 'write')
    script.setAttribute('data-radius', '10')
    script.setAttribute('data-onauth', `${cbName}(user)`)

    const el = ref.current
    el?.appendChild(script)

    return () => {
      delete (window as any)[cbName]
      if (el) el.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  return <div ref={ref} className="inline-block min-h-[48px]" />
}
