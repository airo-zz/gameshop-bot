/**
 * StartParamRedirect.tsx
 *
 * Обрабатывает deep-link `t.me/<bot>?startapp=<param>` один раз при запуске
 * Mini App: уведомления бота ведут сразу на нужный экран, а не на главную.
 * Навигация push (не replace) — чтобы «Назад» вёл на главную.
 */

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTelegram } from '@/hooks/useTelegram'

const ROUTES: Array<[prefix: string, build: (rest: string) => string]> = [
  ['admin_order_', (id) => `/admin/orders/${id}`],
  ['admin_chat_', (id) => `/admin/chats/${id}`],
  ['admin_ticket_', (id) => `/admin/support?ticket=${id}`],
  ['order_', (id) => `/orders/${id}`],
  ['support_', () => '/support'], // SupportPage сам откроет тикет по startParam
  ['game_', (slug) => `/catalog/${slug}`],
]

const EXACT: Record<string, string> = {
  chat: '/chat',
  orders: '/orders',
  balance: '/balance',
  profile: '/profile',
  referrals: '/referrals',
  catalog: '/catalog',
  cart: '/cart',
  admin: '/admin',
}

export function resolveStartParam(param: string): string | null {
  if (EXACT[param]) return EXACT[param]
  for (const [prefix, build] of ROUTES) {
    if (param.startsWith(prefix) && param.length > prefix.length) {
      return build(param.slice(prefix.length))
    }
  }
  return null
}

export default function StartParamRedirect() {
  const { startParam } = useTelegram()
  const navigate = useNavigate()
  const done = useRef(false)

  useEffect(() => {
    if (done.current || !startParam) return
    done.current = true
    const target = resolveStartParam(startParam)
    if (target) navigate(target)
  }, [startParam, navigate])

  return null
}
