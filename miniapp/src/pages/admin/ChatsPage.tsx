/**
 * src/pages/admin/ChatsPage.tsx
 * Список чатов пользователей с продавцом.
 * Polling каждые 5 секунд.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { adminApi, type AdminChatListItem } from '@/api/admin'

function formatTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

function getUserLabel(user: AdminChatListItem['user']): string {
  if (user.first_name) {
    return user.username ? `${user.first_name} @${user.username}` : user.first_name
  }
  return user.username ? `@${user.username}` : `ID: ${user.telegram_id}`
}

function getInitials(user: AdminChatListItem['user']): string {
  if (user.first_name) return user.first_name.slice(0, 1).toUpperCase()
  if (user.username) return user.username.slice(0, 1).toUpperCase()
  return '#'
}

export default function ChatsPage() {
  const navigate = useNavigate()
  const [chats, setChats] = useState<AdminChatListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchChats = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await adminApi.getChats()
      // Сортируем: сначала с непрочитанными, затем по времени последнего сообщения
      const sorted = [...data].sort((a, b) => {
        if (a.admin_unread_count > 0 && b.admin_unread_count === 0) return -1
        if (a.admin_unread_count === 0 && b.admin_unread_count > 0) return 1
        const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
        const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
        return tb - ta
      })
      setChats(sorted)
      setError(null)
    } catch {
      setError('Не удалось загрузить чаты')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchChats()
    intervalRef.current = setInterval(() => fetchChats(true), 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  if (loading) {
    return (
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, color: '#fff' }}>Чаты</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              style={{
                height: 72,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.06)',
                animation: 'pulse 1.5s ease infinite',
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, color: '#fff' }}>Чаты</h1>
        <p style={{ color: '#f87171' }}>{error}</p>
        <button
          onClick={() => fetchChats()}
          style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}
        >
          Повторить
        </button>
      </div>
    )
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, color: '#fff' }}>Чаты</h1>

      {chats.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '48px 0', gap: 12, color: 'rgba(255,255,255,0.35)',
        }}>
          <MessageSquare size={40} style={{ opacity: 0.3 }} />
          <p style={{ margin: 0, fontSize: 14 }}>Нет чатов</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {chats.map(chat => (
            <button
              key={chat.id}
              onClick={() => navigate(`/admin/chats/${chat.id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 12,
                background: chat.admin_unread_count > 0
                  ? 'rgba(37,99,235,0.12)'
                  : 'rgba(255,255,255,0.04)',
                border: chat.admin_unread_count > 0
                  ? '1px solid rgba(96,165,250,0.2)'
                  : '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'background 0.15s',
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, color: '#fff',
              }}>
                {getInitials(chat.user)}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{
                    fontSize: 14, fontWeight: chat.admin_unread_count > 0 ? 700 : 500,
                    color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {getUserLabel(chat.user)}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
                    {formatTime(chat.last_message_at)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 3 }}>
                  <span style={{
                    fontSize: 13, color: 'rgba(255,255,255,0.45)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {chat.last_message_preview || 'Нет сообщений'}
                  </span>
                  {chat.admin_unread_count > 0 && (
                    <span style={{
                      flexShrink: 0,
                      minWidth: 20, height: 20, borderRadius: 10,
                      background: 'linear-gradient(135deg, #2d58ad, #1e3f8a)',
                      color: '#fff', fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 6px',
                    }}>
                      {chat.admin_unread_count > 99 ? '99+' : chat.admin_unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
