/**
 * src/web/chat/ChatRoute.tsx
 * /chat (ссылки из писем «Открыть чат») — открывает виджет чата развёрнутым
 * поверх главной.
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { openChat } from './chatStore'

export default function ChatRoute() {
  const navigate = useNavigate()
  useEffect(() => {
    openChat({ expanded: true })
    navigate('/', { replace: true })
  }, [navigate])
  return null
}
