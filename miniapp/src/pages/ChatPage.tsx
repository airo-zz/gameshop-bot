// src/pages/ChatPage.tsx
import {
  useState, useEffect, useRef, useCallback,
  type ReactNode, type FormEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Send, ArrowLeft, Paperclip, X, ZoomIn, MessageCircle, Plus, Package } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { supportApi, type Ticket, type TicketMessage } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs} ч назад`
  return `${Math.floor(hrs / 24)} дн назад`
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  open:         { label: 'Активен',    color: '#3b82f6' },
  in_progress:  { label: 'В работе',   color: '#a78bfa' },
  waiting_user: { label: 'Ждём вас',   color: '#fbbf24' },
  resolved:     { label: 'Решён',      color: '#6b7280' },
  closed:       { label: 'Закрыт',     color: '#6b7280' },
}

// ── Portal overlay (fixed, no stacking context issues) ───────────────────────

function Overlay({ children }: { children: ReactNode }) {
  return createPortal(
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 200, display: 'flex', flexDirection: 'column', background: '#060f1e',
    }}>
      {children}
    </div>,
    document.body
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  onImageClick,
}: {
  msg: TicketMessage & { optimistic?: boolean }
  onImageClick: (url: string) => void
}) {
  const isUser = msg.sender_type === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-1`}>
      <div
        style={{
          maxWidth: '80%',
          padding: '8px 12px',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          background: isUser ? 'rgba(29,78,216,0.85)' : 'rgba(255,255,255,0.07)',
          border: isUser ? '1px solid rgba(96,165,250,0.2)' : '1px solid rgba(255,255,255,0.06)',
          opacity: msg.optimistic ? 0.65 : 1,
          transition: 'opacity 0.2s',
        }}
      >
        {!isUser && (
          <p style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', marginBottom: 3 }}>
            Продавец
          </p>
        )}
        {msg.text && (
          <p style={{ fontSize: 14, color: '#fff', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45 }}>
            {msg.text}
          </p>
        )}
        {msg.attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: msg.text ? 6 : 0 }}>
            {msg.attachments.map((url, idx) => {
              const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(url)
              return isImage ? (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onImageClick(url)}
                  style={{ width: 80, height: 80, borderRadius: 10, overflow: 'hidden', flexShrink: 0, position: 'relative' }}
                >
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0 }}
                    className="group-active:opacity-100">
                    <ZoomIn size={18} color="#fff" />
                  </div>
                </button>
              ) : (
                <a key={idx} href={url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>
                  <Paperclip size={11} /> Файл {idx + 1}
                </a>
              )
            })}
          </div>
        )}
        <p style={{ fontSize: 10, color: isUser ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.25)', marginTop: 4, textAlign: 'right' }}>
          {msg.optimistic ? '...' : formatTime(msg.created_at)}
        </p>
      </div>
    </div>
  )
}

// ── Chat view ─────────────────────────────────────────────────────────────────

function ChatView({
  ticket,
  orderId,
  onBack,
}: {
  ticket: Ticket
  orderId: string | null
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const { haptic } = useTelegram()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved'
  const statusInfo = STATUS_LABEL[ticket.status]

  const { data: messages = [] } = useQuery<(TicketMessage & { optimistic?: boolean })[]>({
    queryKey: ['chat-messages', ticket.id],
    queryFn: () => supportApi.getMessages(ticket.id),
    refetchInterval: isClosed ? false : 2000,
    staleTime: 0,
  })

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = useCallback(async (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = text.trim()
    if (!trimmed && attachedFiles.length === 0) return
    if (sending) return

    haptic.impact('light')
    const localText = trimmed
    setText('')
    setSending(true)

    // Optimistic update — add message to cache immediately
    const optimisticMsg: TicketMessage & { optimistic: true } = {
      id: `opt-${Date.now()}`,
      ticket_id: ticket.id,
      sender_type: 'user',
      sender_id: '',
      text: localText,
      attachments: [],
      is_template_response: false,
      created_at: new Date().toISOString(),
      optimistic: true,
    }
    queryClient.setQueryData<(TicketMessage & { optimistic?: boolean })[]>(
      ['chat-messages', ticket.id],
      prev => [...(prev ?? []), optimisticMsg]
    )

    try {
      let attachmentUrls: string[] = []
      if (attachedFiles.length > 0) {
        setUploading(true)
        attachmentUrls = await Promise.all(attachedFiles.map(f => supportApi.upload(f).then(r => r.url)))
        setAttachedFiles([])
        setUploading(false)
      }
      await supportApi.reply(ticket.id, localText, attachmentUrls)
      // Refetch to get real message with server timestamp
      queryClient.invalidateQueries({ queryKey: ['chat-messages', ticket.id] })
      queryClient.invalidateQueries({ queryKey: ['chat-tickets'] })
    } catch {
      haptic.error()
      toast.error('Ошибка отправки')
      setText(localText)
      // Remove optimistic message on error
      queryClient.setQueryData<(TicketMessage & { optimistic?: boolean })[]>(
        ['chat-messages', ticket.id],
        prev => prev?.filter(m => m.id !== optimisticMsg.id) ?? []
      )
    } finally {
      setSending(false)
      setUploading(false)
    }
  }, [text, attachedFiles, sending, ticket.id, haptic, queryClient])

  return (
    <Overlay>
      {/* Safe area */}
      <div style={{ height: 'calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top,0px)) + var(--tg-content-safe-area-inset-top,0px))' }} />

      {/* Header */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 16px', height: 56,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(6,15,30,0.95)',
      }}>
        <button onClick={onBack} style={{
          width: 34, height: 34, borderRadius: 10,
          background: 'rgba(255,255,255,0.06)', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.6)', cursor: 'pointer', flexShrink: 0,
        }}>
          <ArrowLeft size={18} />
        </button>

        {/* Avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Package size={16} color="#fff" />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {orderId ? `Заказ · ${ticket.subject}` : ticket.subject}
          </p>
          <p style={{ fontSize: 11, color: statusInfo?.color ?? '#6b7280', margin: 0, lineHeight: 1 }}>
            {statusInfo?.label ?? ticket.status}
          </p>
        </div>
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => {
          const files = Array.from(e.target.files ?? [])
          if (attachedFiles.length + files.length > 5) { toast.error('Максимум 5 файлов'); return }
          setAttachedFiles(prev => [...prev, ...files])
          e.target.value = ''
        }}
      />

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', overscrollBehavior: 'contain' }}>
        {/* Opening marker */}
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginBottom: 12, fontStyle: 'italic' }}>
          Чат открыт · {formatDate(ticket.created_at)}
        </p>

        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} onImageClick={setLightboxUrl} />
        ))}

        {isClosed && (
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 12, fontStyle: 'italic' }}>
            Чат закрыт
          </p>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Attached files preview */}
      {attachedFiles.length > 0 && (
        <div style={{
          flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap',
          padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          {attachedFiles.map((f, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={URL.createObjectURL(f)} alt=""
                style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
              <button onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}
                style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={10} color="#fff" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div style={{
        flexShrink: 0, padding: '8px 12px',
        paddingBottom: 'max(env(safe-area-inset-bottom,16px),16px)',
        background: '#060f1e', borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        {!isClosed ? (
          <form onSubmit={handleSend}
            style={{
              display: 'flex', alignItems: 'flex-end', gap: 8,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 20, padding: '6px 6px 6px 14px',
            }}>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 10, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
              <Paperclip size={18} />
            </button>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Написать сообщение..."
              rows={1}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                resize: 'none', fontSize: 14, color: '#fff', minHeight: 32, maxHeight: 120,
                lineHeight: 1.5, padding: '4px 0',
              }}
            />
            <button
              type="submit"
              disabled={(!text.trim() && attachedFiles.length === 0) || sending || uploading}
              style={{
                flexShrink: 0, width: 36, height: 36, borderRadius: 12, border: 'none',
                background: (text.trim() || attachedFiles.length > 0) ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : 'rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {sending || uploading
                ? <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                : <Send size={16} color="#fff" />
              }
            </button>
          </form>
        ) : (
          <div style={{ textAlign: 'center', padding: '12px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
            Чат закрыт
          </div>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxUrl && createPortal(
          <motion.div
            key="lb"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxUrl(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <button onClick={() => setLightboxUrl(null)}
              style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top,0px) + 52px)', right: 16, zIndex: 301, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 20, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={18} color="#fff" />
            </button>
            <motion.img src={lightboxUrl} alt="" onClick={e => e.stopPropagation()}
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.88, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.34, 1.26, 0.64, 1] }}
              style={{ maxWidth: '92vw', maxHeight: '78vh', borderRadius: 12, objectFit: 'contain' }}
            />
          </motion.div>,
          document.body
        )}
      </AnimatePresence>
    </Overlay>
  )
}

// ── New conversation draft ────────────────────────────────────────────────────

function DraftView({
  orderId,
  onBack,
  onCreated,
}: {
  orderId: string | null
  onBack: () => void
  onCreated: (ticket: Ticket) => void
}) {
  const queryClient = useQueryClient()
  const { haptic } = useTelegram()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [creating, setCreating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 100)
  }, [])

  const handleCreate = async () => {
    if (!text.trim() && files.length === 0) return
    if (creating) return
    setCreating(true)
    haptic.impact('medium')
    try {
      let attachmentUrls: string[] = []
      if (files.length > 0) {
        attachmentUrls = await Promise.all(files.map(f => supportApi.upload(f).then(r => r.url)))
      }
      const subject = (orderId ? `Заказ #${orderId.slice(0, 8)}` : (text.trim().slice(0, 50) || 'Обращение'))
      const result = await supportApi.createTicket({
        subject,
        message: text.trim() || ' ',
        order_id: orderId ?? undefined,
        attachments: attachmentUrls,
      })
      haptic.success()
      const newTicket: Ticket = {
        id: result.ticket_id, subject, status: 'open',
        created_at: new Date().toISOString(), closed_at: null,
      }
      queryClient.invalidateQueries({ queryKey: ['chat-tickets'] })
      onCreated(newTicket)
    } catch {
      haptic.error()
      toast.error('Ошибка отправки')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Overlay>
      <div style={{ height: 'calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top,0px)) + var(--tg-content-safe-area-inset-top,0px))' }} />
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', height: 56, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
          <ArrowLeft size={18} />
        </button>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>Новое сообщение</p>
      </div>

      {/* Welcome message from seller */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={14} color="#fff" />
          </div>
          <div style={{ padding: '10px 14px', borderRadius: '18px 18px 18px 4px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.06)', maxWidth: '80%' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', marginBottom: 4 }}>Продавец</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', margin: 0, lineHeight: 1.45 }}>
              {orderId
                ? 'Ваш заказ принят! Напишите если есть вопросы.'
                : 'Здравствуйте! Чем можем помочь?'}
            </p>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => {
          const f = Array.from(e.target.files ?? [])
          if (files.length + f.length > 5) { toast.error('Максимум 5 файлов'); return }
          setFiles(prev => [...prev, ...f])
          e.target.value = ''
        }}
      />
      {files.length > 0 && (
        <div style={{ flexShrink: 0, display: 'flex', gap: 8, padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {files.map((f, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={URL.createObjectURL(f)} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8 }} />
              <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={10} color="#fff" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ flexShrink: 0, padding: '8px 12px', paddingBottom: 'max(env(safe-area-inset-bottom,16px),16px)', background: '#060f1e', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '6px 6px 6px 14px' }}>
          <button type="button" onClick={() => fileInputRef.current?.click()}
            style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 10, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
            <Paperclip size={18} />
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCreate() } }}
            placeholder={orderId ? 'Вопрос по заказу...' : 'Написать сообщение...'}
            rows={1}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontSize: 14, color: '#fff', minHeight: 32, maxHeight: 120, lineHeight: 1.5, padding: '4px 0' }}
          />
          <button type="button" onClick={handleCreate}
            disabled={(!text.trim() && files.length === 0) || creating}
            style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 12, border: 'none', background: (text.trim() || files.length > 0) ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s' }}>
            {creating
              ? <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              : <Send size={16} color="#fff" />
            }
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ── Main ChatPage ─────────────────────────────────────────────────────────────

type View = 'list' | 'drafting' | 'chat'

export default function ChatPage() {
  const { haptic } = useTelegram()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const orderIdParam = searchParams.get('order_id')
  const ticketIdParam = searchParams.get('ticket_id')

  const [view, setView] = useState<View>('list')
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null)
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null)

  const { data: tickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ['chat-tickets'],
    queryFn: supportApi.list,
    staleTime: 5000,
    refetchInterval: view === 'list' ? 10000 : false,
  })

  const openChat = useCallback((ticket: Ticket, orderId?: string | null) => {
    setActiveTicket(ticket)
    setActiveOrderId(orderId ?? ticket.order_id ?? null)
    setView('chat')
  }, [])

  const backToList = useCallback(() => {
    setView('list')
    setActiveTicket(null)
    setActiveOrderId(null)
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  // Handle ?order_id param — auto-find or create ticket
  useEffect(() => {
    if (!orderIdParam) return
    const existing = tickets.find(t => t.order_id === orderIdParam)
    if (existing) {
      openChat(existing, orderIdParam)
      return
    }
    // Not in cache yet — try API
    supportApi.getByOrderId(orderIdParam)
      .then(ticket => openChat(ticket, orderIdParam))
      .catch(() => {
        // Ticket doesn't exist → open drafting view for this order
        setActiveOrderId(orderIdParam)
        setView('drafting')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderIdParam, tickets.length])

  // Handle ?ticket_id param
  useEffect(() => {
    if (!ticketIdParam) return
    const existing = tickets.find(t => t.id === ticketIdParam)
    if (existing) {
      openChat(existing)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketIdParam, tickets.length])

  if (view === 'chat' && activeTicket) {
    return (
      <ChatView
        ticket={activeTicket}
        orderId={activeOrderId}
        onBack={backToList}
      />
    )
  }

  if (view === 'drafting') {
    return (
      <DraftView
        orderId={activeOrderId}
        onBack={backToList}
        onCreated={ticket => {
          setSearchParams({}, { replace: true })
          openChat(ticket, activeOrderId)
        }}
      />
    )
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px 16px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Чат</h1>
        <button
          onClick={() => { haptic.impact('light'); setActiveOrderId(null); setView('drafting') }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 20,
            background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)',
            border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={14} />
          Новый чат
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 72, borderRadius: 18, background: 'var(--bg2)', border: '1px solid var(--border)', animation: 'pulse 1.5s ease infinite' }} />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 64, gap: 16 }}>
          <div style={{ width: 72, height: 72, borderRadius: 24, background: 'rgba(29,78,216,0.12)', border: '1px solid rgba(29,78,216,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle size={32} style={{ color: '#3b82f6' }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', margin: '0 0 6px' }}>Чатов пока нет</p>
            <p style={{ fontSize: 13, color: 'var(--hint)', margin: 0 }}>Напишите нам — ответим быстро</p>
          </div>
          <button
            onClick={() => { setActiveOrderId(null); setView('drafting') }}
            style={{ padding: '12px 28px', borderRadius: 14, background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Написать
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tickets.map(ticket => {
            const status = STATUS_LABEL[ticket.status]
            const isClosed = ticket.status === 'closed' || ticket.status === 'resolved'
            const initial = (ticket.subject?.trim()?.[0] ?? '?').toUpperCase()
            return (
              <button
                key={ticket.id}
                onClick={() => { haptic.select(); openChat(ticket) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 18, width: '100%', textAlign: 'left',
                  background: 'var(--bg2)', border: '1px solid var(--border)',
                  cursor: 'pointer', transition: 'transform 0.12s ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
                className="active:scale-[0.98]"
              >
                {/* Avatar */}
                <div style={{
                  width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
                  background: isClosed ? 'rgba(255,255,255,0.06)' : 'rgba(29,78,216,0.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 700,
                  color: isClosed ? 'rgba(255,255,255,0.25)' : '#3b82f6',
                }}>
                  {ticket.order_id ? <Package size={18} color={isClosed ? 'rgba(255,255,255,0.25)' : '#3b82f6'} /> : initial}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ticket.subject}
                    </p>
                    <span style={{ fontSize: 11, color: 'var(--hint)', flexShrink: 0 }}>
                      {timeAgo(ticket.created_at)}
                    </span>
                  </div>
                  <span style={{
                    display: 'inline-block', fontSize: 11, fontWeight: 500,
                    padding: '2px 8px', borderRadius: 6,
                    color: status?.color ?? '#6b7280',
                    background: `${status?.color ?? '#6b7280'}22`,
                  }}>
                    {status?.label ?? ticket.status}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
