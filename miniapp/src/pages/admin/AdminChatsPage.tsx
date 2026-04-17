/**
 * src/pages/admin/AdminChatsPage.tsx
 * Messenger-style two-panel admin chat page.
 * Left: chat list with unread highlights + polling.
 * Right: message thread + file upload + notify button.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
  type ChangeEvent,
} from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  Send,
  Bell,
  MessageSquare,
  Paperclip,
  X,
  ChevronLeft,
  Plus,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Notify Modal ──────────────────────────────────────────────────────────────

const DEFAULT_TEMPLATES = [
  'Ваш заказ обрабатывается',
  'Ответим в ближайшее время',
  'Пожалуйста, уточните детали',
  'Товар зарезервирован',
]

const LS_KEY = 'admin_notify_templates'

function loadTemplates(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return DEFAULT_TEMPLATES
}

function saveTemplates(t: string[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(t))
}

function NotifyModal({
  onSend,
  onClose,
}: {
  onSend: (text: string) => Promise<void>
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [templates, setTemplates] = useState<string[]>(loadTemplates)
  const [newTpl, setNewTpl] = useState('')
  const [addingTpl, setAddingTpl] = useState(false)

  const handleSend = async () => {
    if (sending) return
    setSending(true)
    try {
      await onSend(text.trim())
      onClose()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Не удалось отправить уведомление')
    } finally {
      setSending(false)
    }
  }

  const addTemplate = () => {
    const t = newTpl.trim()
    if (!t || templates.includes(t)) return
    const next = [...templates, t]
    setTemplates(next)
    saveTemplates(next)
    setNewTpl('')
    setAddingTpl(false)
    setText(t)
  }

  const removeTemplate = (t: string) => {
    const next = templates.filter(x => x !== t)
    setTemplates(next)
    saveTemplates(next)
    if (text === t) setText('')
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: '#0d1626',
          border: '1px solid rgba(255,255,255,0.1)',
          borderBottom: 'none',
          borderRadius: '18px 18px 0 0',
          padding: '20px 16px 24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Уведомить пользователя</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Templates */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {templates.map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <button
                onClick={() => setText(prev => prev === t ? '' : t)}
                style={{
                  padding: '5px 8px 5px 10px', borderRadius: text === t ? '20px 0 0 20px' : 20,
                  fontSize: 12, cursor: 'pointer',
                  background: text === t ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.07)',
                  border: text === t ? '1px solid rgba(96,165,250,0.5)' : '1px solid rgba(255,255,255,0.1)',
                  borderRight: text === t ? 'none' : undefined,
                  color: text === t ? '#93c5fd' : 'rgba(255,255,255,0.6)',
                  transition: 'all 0.15s',
                }}
              >
                {t}
              </button>
              <button
                onClick={() => removeTemplate(t)}
                title="Удалить заготовку"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 26,
                  padding: 0,
                  borderRadius: text === t ? '0 20px 20px 0' : '0 20px 20px 0',
                  fontSize: 11, cursor: 'pointer',
                  background: text === t ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.07)',
                  border: text === t ? '1px solid rgba(96,165,250,0.5)' : '1px solid rgba(255,255,255,0.1)',
                  borderLeft: 'none',
                  color: 'rgba(255,255,255,0.35)',
                  transition: 'all 0.15s',
                }}
              >
                <X size={10} />
              </button>
            </div>
          ))}

          {/* Add template button */}
          {addingTpl ? (
            <div style={{ display: 'flex', gap: 4, width: '100%', marginTop: 2 }}>
              <input
                autoFocus
                value={newTpl}
                onChange={e => setNewTpl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTemplate(); if (e.key === 'Escape') setAddingTpl(false) }}
                placeholder="Текст заготовки..."
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(96,165,250,0.3)', borderRadius: 8,
                  padding: '4px 8px', fontSize: 12, color: '#fff', outline: 'none',
                }}
              />
              <button
                onClick={addTemplate}
                style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(37,99,235,0.4)', border: '1px solid rgba(96,165,250,0.4)', color: '#93c5fd', fontSize: 12, cursor: 'pointer' }}
              >
                Добавить
              </button>
              <button
                onClick={() => setAddingTpl(false)}
                style={{ padding: '4px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingTpl(true)}
              style={{
                padding: '5px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                background: 'transparent',
                border: '1px dashed rgba(255,255,255,0.2)',
                color: 'rgba(255,255,255,0.35)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <Plus size={11} /> Добавить
            </button>
          )}
        </div>

        {/* Text input */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Или введите своё сообщение..."
          rows={3}
          style={{
            width: '100%', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
            padding: '10px 12px', fontSize: 14, color: '#fff', outline: 'none',
            resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
          }}
        />

        <button
          onClick={handleSend}
          disabled={sending || !text.trim()}
          style={{
            marginTop: 12, width: '100%', padding: '12px',
            borderRadius: 12, border: 'none', cursor: (sending || !text.trim()) ? 'default' : 'pointer',
            background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
            color: '#fff', fontSize: 14, fontWeight: 600,
            opacity: (sending || !text.trim()) ? 0.5 : 1, transition: 'opacity 0.2s',
          }}
        >
          {sending ? 'Отправка...' : 'Отправить уведомление'}
        </button>
      </div>
    </div>
  )
}
import { adminApi, type AdminChatListItem, type AdminChatDetail, type AdminChatMessage } from '@/api/admin'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
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

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(url)
}

// ── Payment system message parser ─────────────────────────────────────────────

const ADMIN_PAYMENT_RE = /^(Заказ\s+#\S+\s+на\s+сумму\s+[\d\s\u00a0]+₽\s+успешно\s+оплачен\..*?)(?:\|oid=([a-f0-9-]+))?$/s

function SystemMessageBubble({ text }: { text: string | null }) {
  if (!text) return null
  const match = ADMIN_PAYMENT_RE.exec(text)

  if (match) {
    const displayText = match[1].trim()
    const orderId = match[2] ?? null
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0', marginBottom: 8 }}>
        <div style={{
          display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          padding: '10px 16px', borderRadius: 14,
          background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
          maxWidth: '85%',
        }}>
          <span style={{ fontSize: 11, color: '#34d399', fontWeight: 700 }}>Оплата подтверждена</span>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 1.5 }}>
            {displayText}
          </p>
          {orderId && (
            <Link
              to={`/admin/orders/${orderId}`}
              style={{
                fontSize: 11, color: 'rgba(255,255,255,0.45)',
                textDecoration: 'none', padding: '3px 10px',
                borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
              }}
            >
              Открыть заказ
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ textAlign: 'center', padding: '4px 0', marginBottom: 8 }}>
      <span style={{
        fontSize: 12, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic',
        display: 'inline-block', padding: '4px 12px', borderRadius: 20,
        background: 'rgba(255,255,255,0.04)',
      }}>
        {text}
      </span>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  onImageClick,
}: {
  msg: AdminChatMessage & { optimistic?: boolean }
  onImageClick: (url: string) => void
}) {
  const isAdmin = msg.sender_type === 'admin'
  const isSystem = msg.sender_type === 'system'

  if (isSystem) {
    return <SystemMessageBubble text={msg.text} />
  }

  return (
    <div style={{ display: 'flex', justifyContent: isAdmin ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
      <div style={{
        maxWidth: '75%',
        padding: '8px 12px',
        borderRadius: isAdmin ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isAdmin ? 'rgba(29,78,216,0.85)' : 'rgba(255,255,255,0.08)',
        border: isAdmin ? '1px solid rgba(96,165,250,0.2)' : '1px solid rgba(255,255,255,0.08)',
        opacity: msg.optimistic ? 0.65 : 1,
        transition: 'opacity 0.2s',
      }}>
        {!isAdmin && (
          <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', margin: '0 0 3px' }}>
            Покупатель
          </p>
        )}
        {msg.text && (
          <p style={{ fontSize: 14, color: '#fff', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45, margin: 0 }}>
            {msg.text}
          </p>
        )}
        {msg.attachments && msg.attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: msg.text ? 6 : 0 }}>
            {msg.attachments.map((url, idx) => {
              const absUrl = url.startsWith('http') ? url : `https://redonate.su${url}`
              const openFile = () => {
                const tg = (window as any).Telegram?.WebApp
                if (tg?.openLink) tg.openLink(absUrl)
                else window.open(absUrl, '_blank')
              }
              return isImageUrl(url) ? (
                <button
                  key={idx}
                  type="button"
                  onTouchStart={e => e.stopPropagation()}
                  onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); onImageClick(absUrl) }}
                  onClick={e => { e.stopPropagation(); onImageClick(absUrl) }}
                  style={{
                    width: 80, height: 80, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
                    border: '1px solid rgba(255,255,255,0.1)', padding: 0, cursor: 'pointer',
                    background: 'transparent', touchAction: 'none', WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <img src={absUrl} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none', userSelect: 'none', WebkitUserSelect: 'none' }} />
                </button>
              ) : (
                <button
                  key={idx}
                  type="button"
                  onTouchStart={e => e.stopPropagation()}
                  onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); openFile() }}
                  onClick={openFile}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
                    borderRadius: 8, background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.6)', fontSize: 11, cursor: 'pointer',
                    touchAction: 'none', WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <Paperclip size={11} /> Файл {idx + 1}
                </button>
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

// ── Chat list panel ───────────────────────────────────────────────────────────

function ChatListPanel({
  chats,
  loading,
  selectedId,
  onSelect,
}: {
  chats: AdminChatListItem[]
  loading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(255,255,255,0.01)',
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, padding: '14px 16px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>Чаты</h2>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading && chats.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 12px' }}>
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                style={{
                  height: 64, borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  animation: 'pulse 1.5s ease infinite',
                }}
              />
            ))}
          </div>
        ) : chats.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            paddingTop: 40, gap: 8, color: 'rgba(255,255,255,0.3)',
          }}>
            <MessageSquare size={32} style={{ opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 13 }}>Нет чатов</p>
          </div>
        ) : (
          chats.map(chat => {
            const isSelected = chat.id === selectedId
            const hasUnread = chat.admin_unread_count > 0
            return (
              <button
                key={chat.id}
                onClick={() => onSelect(chat.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', width: '100%', textAlign: 'left',
                  cursor: 'pointer', border: 'none',
                  background: isSelected
                    ? 'rgba(37,99,235,0.18)'
                    : hasUnread
                    ? 'rgba(37,99,235,0.08)'
                    : 'transparent',
                  borderLeft: isSelected
                    ? '2px solid rgba(96,165,250,0.7)'
                    : hasUnread
                    ? '2px solid rgba(96,165,250,0.3)'
                    : '2px solid transparent',
                  transition: 'background 0.15s',
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: '#fff',
                }}>
                  {getInitials(chat.user)}
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    <span style={{
                      fontSize: 13, fontWeight: hasUnread ? 700 : 500,
                      color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {getUserLabel(chat.user)}
                    </span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                      {formatTime(chat.last_message_at)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 2 }}>
                    <span style={{
                      fontSize: 12, color: 'rgba(255,255,255,0.4)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {chat.last_message_preview || 'Нет сообщений'}
                    </span>
                    {hasUnread && (
                      <span style={{
                        flexShrink: 0, minWidth: 18, height: 18, borderRadius: 9,
                        background: 'linear-gradient(135deg, #2d58ad, #1e3f8a)',
                        color: '#fff', fontSize: 10, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 5px',
                      }}>
                        {chat.admin_unread_count > 99 ? '99+' : chat.admin_unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Chat detail panel ─────────────────────────────────────────────────────────

function ChatDetailPanel({
  chatId,
  onBack,
}: {
  chatId: string
  onBack: () => void
}) {
  const [chat, setChat] = useState<AdminChatDetail | null>(null)
  const [messages, setMessages] = useState<(AdminChatMessage & { optimistic?: boolean })[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [notifyModalOpen, setNotifyModalOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview: string }[]>([])
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDetail = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await adminApi.getChatDetail(chatId)
      setChat(data)
      setMessages(data.messages)
    } catch {
      // ignore polling errors
    } finally {
      if (!silent) setLoading(false)
    }
  }, [chatId])

  // Initial load + polling + mark-read — all in one effect to avoid races
  useEffect(() => {
    setLoading(true)
    setMessages([])
    setChat(null)

    fetchDetail()
    adminApi.markChatRead(chatId).catch(() => {})

    const interval = setInterval(() => {
      fetchDetail(true)
      adminApi.markChatRead(chatId).catch(() => {})
    }, 3000)

    return () => clearInterval(interval)
  }, [chatId, fetchDetail])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const newPending = files.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
    }))
    setPendingFiles(prev => [...prev, ...newPending])
    e.target.value = ''
  }, [])

  const removePending = useCallback((idx: number) => {
    setPendingFiles(prev => {
      const updated = [...prev]
      if (updated[idx].preview) URL.revokeObjectURL(updated[idx].preview)
      updated.splice(idx, 1)
      return updated
    })
  }, [])

  const handleSend = useCallback(async (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = text.trim()
    if ((!trimmed && pendingFiles.length === 0) || sending || uploading) return

    setSending(true)
    setText('')

    // Upload pending files
    let uploadedUrls: string[] = []
    if (pendingFiles.length > 0) {
      setUploading(true)
      try {
        uploadedUrls = await Promise.all(
          pendingFiles.map(({ file }) => adminApi.uploadChatFile(chatId, file).then(r => r.url))
        )
        pendingFiles.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview) })
        setPendingFiles([])
      } catch {
        setSending(false)
        setUploading(false)
        return
      } finally {
        setUploading(false)
      }
    }

    // Optimistic message
    const optimistic: AdminChatMessage & { optimistic: true } = {
      id: `opt-${Date.now()}`,
      chat_id: chatId,
      sender_type: 'admin',
      text: trimmed || null,
      attachments: uploadedUrls,
      created_at: new Date().toISOString(),
      optimistic: true,
    }
    setMessages(prev => [...prev, optimistic])

    try {
      const msg = await adminApi.sendChatMessage(chatId, trimmed || null, uploadedUrls)
      setMessages(prev => [...prev.filter(m => m.id !== optimistic.id), msg])
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setText(trimmed)
    } finally {
      setSending(false)
    }
  }, [text, pendingFiles, chatId, sending, uploading])

  const handleNotifySend = async (notifyText: string) => {
    await adminApi.notifyUserChat(chatId, notifyText || undefined)
  }

  // Group messages by date
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

  const userLabel = chat ? getUserLabel(chat.user) : '...'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>

      {/* Header */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(17,24,39,0.98)',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer', padding: 4, display: 'flex', borderRadius: 8,
          }}
        >
          <ChevronLeft size={20} />
        </button>

        {chat && (
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff',
          }}>
            {getInitials(chat.user)}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {userLabel}
          </p>
          {chat && (
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
              ID: {chat.user.telegram_id}
              {chat.user.username && ` · @${chat.user.username}`}
            </p>
          )}
        </div>

        <button
          onClick={() => setNotifyModalOpen(true)}
          title="Уведомить в Telegram"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 8,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer', fontSize: 11, fontWeight: 500, flexShrink: 0,
          }}
        >
          <Bell size={13} />
          Уведомить
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', overscrollBehavior: 'contain' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <div style={{ width: 24, height: 24, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 48, gap: 8, color: 'rgba(255,255,255,0.3)' }}>
            <p style={{ margin: 0, fontSize: 14 }}>Нет сообщений</p>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.dateKey}>
              <div style={{ textAlign: 'center', margin: '12px 0 8px' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', padding: '3px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.05)' }}>
                  {group.label}
                </span>
              </div>
              {group.msgs.map(msg => (
                <MessageBubble key={msg.id} msg={msg} onImageClick={setLightboxUrl} />
              ))}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending file previews */}
      {pendingFiles.length > 0 && (
        <div style={{
          flexShrink: 0, display: 'flex', gap: 8, padding: '8px 12px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(17,24,39,0.98)',
          overflowX: 'auto',
        }}>
          {pendingFiles.map((pf, idx) => (
            <div key={idx} style={{ position: 'relative', flexShrink: 0 }}>
              {pf.preview ? (
                <img
                  src={pf.preview}
                  alt=""
                  style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' }}
                />
              ) : (
                <div style={{
                  width: 60, height: 60, borderRadius: 8, background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: 4,
                }}>
                  {pf.file.name.split('.').pop()?.toUpperCase()}
                </div>
              )}
              <button
                onClick={() => removePending(idx)}
                style={{
                  position: 'absolute', top: -4, right: -4,
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#1d4ed8', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={10} color="#fff" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div style={{
        flexShrink: 0, padding: '10px 12px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(17,24,39,0.98)',
      }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <form
          onSubmit={handleSend}
          style={{
            display: 'flex', alignItems: 'flex-end', gap: 6,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16, padding: '6px 6px 6px 12px',
          }}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              flexShrink: 0, width: 32, height: 32, borderRadius: 8, border: 'none',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            <Paperclip size={17} />
          </button>

          <textarea
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
            disabled={(!text.trim() && pendingFiles.length === 0) || sending || uploading}
            style={{
              flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: 'none',
              background: (text.trim() || pendingFiles.length > 0)
                ? 'linear-gradient(135deg, #1d4ed8, #2563eb)'
                : 'rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: (text.trim() || pendingFiles.length > 0) ? 'pointer' : 'default',
              transition: 'background 0.2s',
            }}
          >
            {(sending || uploading)
              ? <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              : <Send size={16} color="#fff" />
            }
          </button>
        </form>
      </div>

      {/* Notify modal */}
      {notifyModalOpen && (
        <NotifyModal
          onSend={handleNotifySend}
          onClose={() => setNotifyModalOpen(false)}
        />
      )}

      {/* Image lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <img
            src={lightboxUrl}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '94vw', maxHeight: '88vh', borderRadius: 12, objectFit: 'contain' }}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            style={{
              position: 'absolute', top: 16, right: 16,
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={18} color="#fff" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Root page ─────────────────────────────────────────────────────────────────

export default function AdminChatsPage() {
  const { id: chatIdParam } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [chats, setChats] = useState<AdminChatListItem[]>([])
  const [loadingChats, setLoadingChats] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(chatIdParam ?? null)

  // Detect mobile (< 768px)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Sync selectedId with URL param
  useEffect(() => {
    setSelectedId(chatIdParam ?? null)
  }, [chatIdParam])

  const fetchChats = useCallback(async (silent = false) => {
    if (!silent) setLoadingChats(true)
    try {
      const data = await adminApi.getChats()
      setChats(data)
    } catch {
      // ignore
    } finally {
      if (!silent) setLoadingChats(false)
    }
  }, [])

  useEffect(() => {
    fetchChats()
    const interval = setInterval(() => fetchChats(true), 5000)
    return () => clearInterval(interval)
  }, [fetchChats])

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    navigate(`/admin/chats/${id}`, { replace: true })
    // Мгновенно сбрасываем бейдж в списке без ожидания следующего poll
    setChats(prev => prev.map(c => c.id === id ? { ...c, admin_unread_count: 0 } : c))
  }, [navigate])

  const handleBack = useCallback(() => {
    setSelectedId(null)
    navigate('/admin/chats', { replace: true })
  }, [navigate])

  // Mobile: show list OR detail
  if (isMobile) {
    if (selectedId) {
      return (
        <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
          <ChatDetailPanel chatId={selectedId} onBack={handleBack} />
        </div>
      )
    }
    return (
      <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
        <ChatListPanel
          chats={chats}
          loading={loadingChats}
          selectedId={null}
          onSelect={handleSelect}
        />
      </div>
    )
  }

  // Desktop: two-panel
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)' }}>
      {/* Left sidebar */}
      <div style={{ width: 280, flexShrink: 0, overflow: 'hidden' }}>
        <ChatListPanel
          chats={chats}
          loading={loadingChats}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {selectedId ? (
          <ChatDetailPanel chatId={selectedId} onBack={handleBack} />
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%',
            color: 'rgba(255,255,255,0.2)',
          }}>
            <MessageSquare size={48} style={{ opacity: 0.2 }} />
            <p style={{ margin: '12px 0 0', fontSize: 14 }}>Выберите чат</p>
          </div>
        )}
      </div>
    </div>
  )
}
