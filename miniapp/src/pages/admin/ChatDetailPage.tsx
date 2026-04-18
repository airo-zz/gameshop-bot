/**
 * src/pages/admin/ChatDetailPage.tsx
 * Детальный чат с пользователем для admin-панели.
 * Polling каждые 3 секунды.
 */

import {
  useState, useEffect, useRef, useCallback,
  type FormEvent,
} from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Send, Bell, ArrowLeft, UserCheck, UserMinus, CheckCircle, HelpCircle, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi, type AdminChatDetail, type AdminChatMessage } from '@/api/admin'

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
}

function getDateKey(dateStr: string): string {
  return new Date(dateStr).toDateString()
}

function getUserLabel(chat: AdminChatDetail): string {
  const { user } = chat
  if (user.first_name) {
    return user.username ? `${user.first_name} (@${user.username})` : user.first_name
  }
  if (user.username) return `@${user.username}`
  return `ID: ${user.telegram_id}`
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
}: {
  msg: AdminChatMessage & { optimistic?: boolean }
}) {
  const isUser = msg.sender_type === 'user'
  const isAdmin = msg.sender_type === 'admin'
  const isSystem = msg.sender_type === 'system'

  if (isSystem) {
    return (
      <div style={{ textAlign: 'center', padding: '4px 0', marginBottom: 8 }}>
        <span style={{
          fontSize: 12, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic',
          display: 'inline-block', padding: '4px 12px', borderRadius: 20,
          background: 'rgba(255,255,255,0.04)',
        }}>
          {msg.text}
        </span>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isAdmin ? 'flex-end' : 'flex-start',
        marginBottom: 4,
      }}
    >
      <div style={{
        maxWidth: '75%',
        padding: '8px 12px',
        borderRadius: isAdmin ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isAdmin
          ? 'rgba(29,78,216,0.85)'
          : 'rgba(255,255,255,0.08)',
        border: isAdmin
          ? '1px solid rgba(96,165,250,0.2)'
          : '1px solid rgba(255,255,255,0.08)',
        opacity: msg.optimistic ? 0.65 : 1,
        transition: 'opacity 0.2s',
      }}>
        {isUser && (
          <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 3, margin: '0 0 3px' }}>
            Покупатель
          </p>
        )}
        {msg.text && (
          <p style={{
            fontSize: 14, color: '#fff', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', lineHeight: 1.45, margin: 0,
          }}>
            {msg.text}
          </p>
        )}
        {msg.attachments && msg.attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: msg.text ? 6 : 0 }}>
            {msg.attachments.map((url, idx) => {
              const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(url)
              return isImage ? (
                <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={url}
                    alt=""
                    style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', display: 'block' }}
                  />
                </a>
              ) : (
                <a
                  key={idx}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', fontSize: 11, textDecoration: 'none' }}
                >
                  Файл {idx + 1}
                </a>
              )
            })}
          </div>
        )}
        <p style={{
          fontSize: 10,
          color: isAdmin ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.25)',
          marginTop: 4, marginBottom: 0, textAlign: 'right',
        }}>
          {msg.optimistic ? '...' : formatTime(msg.created_at)}
        </p>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ChatDetailPage() {
  const { id: chatId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [chat, setChat] = useState<AdminChatDetail | null>(null)
  const [messages, setMessages] = useState<(AdminChatMessage & { optimistic?: boolean })[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [notifying, setNotifying] = useState(false)
  const [notifySuccess, setNotifySuccess] = useState(false)
  const [orderAction, setOrderAction] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const readMarked = useRef(false)

  const fetchDetail = useCallback(async (silent = false) => {
    if (!chatId) return
    if (!silent) setLoading(true)
    try {
      const data = await adminApi.getChatDetail(chatId)
      setChat(data)
      setMessages(data.messages)
      setError(null)
    } catch {
      setError('Не удалось загрузить чат')
    } finally {
      setLoading(false)
    }
  }, [chatId])

  // Mark read on open
  useEffect(() => {
    if (!chatId || readMarked.current) return
    readMarked.current = true
    adminApi.markChatRead(chatId).catch(() => {})
  }, [chatId])

  useEffect(() => {
    fetchDetail()
    intervalRef.current = setInterval(() => {
      fetchDetail(true)
      // Периодически помечаем прочитанным
      if (chatId) adminApi.markChatRead(chatId).catch(() => {})
    }, 3000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchDetail, chatId])

  // Скролл вниз при новых сообщениях
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = useCallback(async (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || !chatId || sending) return

    setText('')
    setSending(true)

    // Оптимистичное обновление
    const optimistic: AdminChatMessage & { optimistic: true } = {
      id: `opt-${Date.now()}`,
      chat_id: chatId,
      sender_type: 'admin',
      text: trimmed,
      attachments: [],
      created_at: new Date().toISOString(),
      optimistic: true,
    }
    setMessages(prev => [...prev, optimistic])

    try {
      const msg = await adminApi.sendChatMessage(chatId, trimmed)
      setMessages(prev => [
        ...prev.filter(m => m.id !== optimistic.id),
        msg,
      ])
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setText(trimmed)
    } finally {
      setSending(false)
    }
  }, [text, chatId, sending])

  const handleNotify = async () => {
    if (!chatId || notifying) return
    setNotifying(true)
    try {
      await adminApi.notifyUserChat(chatId)
      setNotifySuccess(true)
      setTimeout(() => setNotifySuccess(false), 3000)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Не удалось отправить уведомление')
    } finally {
      setNotifying(false)
    }
  }

  // Управление заказом из чата
  const handleOrderAction = useCallback(async (action: 'claim' | 'unclaim' | 'complete' | 'clarification' | 'cancel') => {
    if (!chat?.order || orderAction) return
    const orderId = chat.order.id
    setOrderAction(action)
    try {
      if (action === 'claim') {
        const res = await adminApi.claimOrder(orderId)
        setChat(prev => prev ? { ...prev, order: prev.order ? { ...prev.order, status: 'processing', assigned_admin_id: res.assigned_admin.id } : null } : null)
        toast.success('Заказ взят в работу')
      } else if (action === 'unclaim') {
        await adminApi.unclaimOrder(orderId)
        setChat(prev => prev ? { ...prev, order: prev.order ? { ...prev.order, status: 'paid', assigned_admin_id: null } : null } : null)
        toast.success('Заказ возвращён в очередь')
      } else {
        const statusMap: Record<string, string> = {
          complete: 'completed',
          clarification: 'clarification',
          cancel: 'cancelled',
        }
        await adminApi.updateOrderStatus(orderId, statusMap[action])
        setChat(prev => prev ? { ...prev, order: prev.order ? { ...prev.order, status: statusMap[action] } : null } : null)
        toast.success('Статус обновлён')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Ошибка')
    } finally {
      setOrderAction(null)
    }
  }, [chat, orderAction])

  // Группировка по датам
  const grouped: { dateKey: string; label: string; msgs: typeof messages }[] = []
  for (const msg of messages) {
    const key = getDateKey(msg.created_at)
    const last = grouped[grouped.length - 1]
    if (!last || last.dateKey !== key) {
      grouped.push({ dateKey: key, label: formatDateLabel(msg.created_at), msgs: [msg] })
    } else {
      last.msgs.push(msg)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <div style={{ width: 24, height: 24, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      </div>
    )
  }

  if (error || !chat) {
    return (
      <div>
        <p style={{ color: '#f87171' }}>{error || 'Чат не найден'}</p>
        <button
          onClick={() => navigate('/admin/chats')}
          style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}
        >
          Назад к чатам
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', maxHeight: 'calc(100vh - 56px)' }}>

      {/* Header */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <button
          onClick={() => navigate('/admin/chats')}
          style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 4, display: 'flex', borderRadius: 8 }}
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>
            {getUserLabel(chat)}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
            ID: {chat.user.telegram_id}
            {chat.user.username && ` · @${chat.user.username}`}
          </p>
        </div>

        {/* Notify button */}
        <button
          onClick={handleNotify}
          disabled={notifying}
          title="Уведомить в Telegram"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 10,
            background: notifySuccess
              ? 'rgba(16,185,129,0.2)'
              : 'rgba(255,255,255,0.08)',
            border: notifySuccess
              ? '1px solid rgba(16,185,129,0.3)'
              : '1px solid rgba(255,255,255,0.1)',
            color: notifySuccess ? '#34d399' : 'rgba(255,255,255,0.7)',
            cursor: 'pointer', fontSize: 12, fontWeight: 500,
            transition: 'all 0.2s',
          }}
        >
          <Bell size={14} />
          {notifySuccess ? 'Отправлено' : 'Уведомить'}
        </button>
      </div>

      {/* Order control panel */}
      {chat.order && ['paid', 'processing', 'clarification'].includes(chat.order.status) && (
        <div style={{
          flexShrink: 0,
          padding: '10px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(30,58,138,0.12)',
          display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto',
        }}>
          <span style={{ fontSize: 11, color: 'rgba(147,197,253,0.8)', fontWeight: 600, flexShrink: 0 }}>
            #{chat.order.order_number}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
            {chat.order.status === 'paid' ? 'Оплачен' : chat.order.status === 'processing' ? 'В работе' : 'Уточнение'}
          </span>

          {/* Claim / Unclaim */}
          {(chat.order.status === 'paid' || (chat.order.status === 'processing' && !chat.order.assigned_admin_id)) && (
            <button
              onClick={() => handleOrderAction('claim')}
              disabled={!!orderAction}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'rgba(59,130,246,0.2)', color: '#93c5fd',
                fontSize: 11, fontWeight: 600, flexShrink: 0,
              }}
            >
              <UserCheck size={12} />
              Взять
            </button>
          )}
          {chat.order.assigned_admin_id && chat.order.status === 'processing' && (
            <button
              onClick={() => handleOrderAction('unclaim')}
              disabled={!!orderAction}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)',
                fontSize: 11, fontWeight: 600, flexShrink: 0,
              }}
            >
              <UserMinus size={12} />
              Отпустить
            </button>
          )}

          {/* Status actions */}
          {chat.order.status === 'processing' && (
            <button
              onClick={() => handleOrderAction('complete')}
              disabled={!!orderAction}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'rgba(16,185,129,0.15)', color: '#6ee7b7',
                fontSize: 11, fontWeight: 600, flexShrink: 0,
              }}
            >
              <CheckCircle size={12} />
              Выполнен
            </button>
          )}
          {['processing', 'clarification'].includes(chat.order.status) && (
            <button
              onClick={() => handleOrderAction('clarification')}
              disabled={!!orderAction}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'rgba(251,191,36,0.12)', color: '#fcd34d',
                fontSize: 11, fontWeight: 600, flexShrink: 0,
              }}
            >
              <HelpCircle size={12} />
              Уточнение
            </button>
          )}
          <button
            onClick={() => handleOrderAction('cancel')}
            disabled={!!orderAction}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'rgba(239,68,68,0.12)', color: '#fca5a5',
              fontSize: 11, fontWeight: 600, flexShrink: 0,
            }}
          >
            <XCircle size={12} />
            Отмена
          </button>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', overscrollBehavior: 'contain' }}>
        {messages.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            paddingTop: 48, gap: 8, color: 'rgba(255,255,255,0.3)',
          }}>
            <p style={{ margin: 0, fontSize: 14 }}>Нет сообщений</p>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.dateKey}>
              {/* Date separator */}
              <div style={{ textAlign: 'center', margin: '12px 0 8px' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', padding: '3px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.05)' }}>
                  {group.label}
                </span>
              </div>
              {group.msgs.map(msg => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        flexShrink: 0, padding: '10px 12px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(17,24,39,0.98)',
      }}>
        <form
          onSubmit={handleSend}
          style={{
            display: 'flex', alignItems: 'flex-end', gap: 8,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16, padding: '6px 6px 6px 14px',
          }}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder="Написать сообщение..."
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              resize: 'none', fontSize: 14, color: '#fff',
              minHeight: 32, maxHeight: 120, lineHeight: 1.5, padding: '4px 0',
            }}
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            style={{
              flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: 'none',
              background: text.trim()
                ? 'linear-gradient(135deg, #1d4ed8, #2563eb)'
                : 'rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: text.trim() ? 'pointer' : 'default', transition: 'background 0.2s',
            }}
          >
            {sending
              ? <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              : <Send size={16} color="#fff" />
            }
          </button>
        </form>
      </div>
    </div>
  )
}
