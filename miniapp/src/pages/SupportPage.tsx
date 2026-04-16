// src/pages/SupportPage.tsx
import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Send, Plus, ArrowLeft, Paperclip, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { supportApi, ordersApi, type Ticket, type TicketMessage, type Order } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'

type View = 'list' | 'drafting' | 'chat'

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  open:         { label: 'Открыт',      color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  in_progress:  { label: 'В работе',    color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  waiting_user: { label: 'Ожидаем вас', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
  resolved:     { label: 'Решён',       color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
  closed:       { label: 'Закрыт',      color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs} ч назад`
  const days = Math.floor(hrs / 24)
  return `${days} дн назад`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function avatarInitial(subject: string): string {
  return (subject?.trim()?.[0] ?? '?').toUpperCase()
}

// Overlay component — rendered as a sibling to the page, covers the full viewport
function FullScreenOverlay({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        background: '#060f1e',
      }}
    >
      {children}
    </div>
  )
}

export default function SupportPage() {
  const { haptic } = useTelegram()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const prefillOrderId = searchParams.get('order_id')

  const [view, setView] = useState<View>('list')
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [activeTicketData, setActiveTicketData] = useState<Ticket | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)

  // Drafting state
  const [draftText, setDraftText] = useState(prefillOrderId ? '' : '')
  const [draftOrderId] = useState(prefillOrderId ?? '')
  const [draftCreating, setDraftCreating] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const draftInputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-open drafting if prefill order
  useEffect(() => {
    if (prefillOrderId) setView('drafting')
  }, [prefillOrderId])

  const { data: tickets = [], refetch: refetchTickets } = useQuery({
    queryKey: ['tickets'],
    queryFn: supportApi.list,
  })

  const { data: messages = [] } = useQuery({
    queryKey: ['ticket-messages', selectedTicketId],
    queryFn: () => supportApi.getMessages(selectedTicketId!),
    enabled: !!selectedTicketId && view === 'chat',
    refetchInterval: 5000,
  })

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus draft textarea when view changes to drafting
  useEffect(() => {
    if (view === 'drafting') {
      setTimeout(() => draftInputRef.current?.focus(), 100)
    }
  }, [view])

  const openChat = useCallback((ticketId: string, ticketData?: Ticket) => {
    setSelectedTicketId(ticketId)
    if (ticketData) setActiveTicketData(ticketData)
    setView('chat')
  }, [])

  const backToList = useCallback(() => {
    setView('list')
    setSelectedTicketId(null)
    setReplyText('')
    setDraftText('')
    setActiveTicketData(null)
    setAttachedFiles([])
  }, [])

  const handleSubmitDraft = async () => {
    if (!draftText.trim() || draftCreating) return
    setDraftCreating(true)
    haptic.impact('medium')
    try {
      const subject = draftText.trim().slice(0, 50)
      const result = await supportApi.createTicket({
        subject,
        message: draftText.trim(),
        order_id: draftOrderId || undefined,
      })
      haptic.success()
      const newTicket: Ticket = {
        id: result.ticket_id,
        subject,
        status: 'open',
        created_at: new Date().toISOString(),
        closed_at: null,
      }
      refetchTickets()
      setDraftText('')
      openChat(result.ticket_id, newTicket)
    } catch {
      haptic.error()
      toast.error('Ошибка отправки')
    } finally {
      setDraftCreating(false)
    }
  }

  const handleReply = async () => {
    if (!replyText.trim() && attachedFiles.length === 0) return
    if (!selectedTicketId) return
    setSending(true)
    haptic.impact('light')
    try {
      let attachmentUrls: string[] = []
      if (attachedFiles.length > 0) {
        setUploadingFiles(true)
        attachmentUrls = await Promise.all(attachedFiles.map(f => supportApi.upload(f).then(r => r.url)))
        setUploadingFiles(false)
      }
      await supportApi.reply(selectedTicketId, replyText.trim(), attachmentUrls)
      setReplyText('')
      setAttachedFiles([])
      queryClient.invalidateQueries({ queryKey: ['ticket-messages', selectedTicketId] })
      refetchTickets()
    } catch {
      haptic.error()
      setUploadingFiles(false)
      toast.error('Ошибка отправки')
    } finally {
      setSending(false)
    }
  }

  const selectedTicket = tickets.find(t => t.id === selectedTicketId)
  const displayTicket = selectedTicket ?? activeTicketData
  const isClosed = displayTicket?.status === 'closed' || displayTicket?.status === 'resolved'

  return (
    <div className="px-4 pt-5 pb-6">
      {/* Header (list only) */}
      {view === 'list' && (
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>
            Мои обращения
            {tickets.length > 0 && (
              <span className="ml-2 text-sm font-medium" style={{ color: 'var(--hint)' }}>
                ({tickets.length})
              </span>
            )}
          </h1>
          <button
            onClick={() => setView('drafting')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all active:scale-95"
            style={{ background: '#1d4ed8', color: '#fff' }}
          >
            <Plus size={14} />
            Написать
          </button>
        </div>
      )}

      {/* Drafting overlay */}
      {view === 'drafting' && (
        <FullScreenOverlay>
          {/* Padding for Telegram safe area */}
          <div style={{ height: 'calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px))' }} />

          {/* Header */}
          <div className="shrink-0 flex items-center gap-3 px-4 h-14 border-b border-white/5">
            <button
              onClick={backToList}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
            >
              <ArrowLeft size={18} className="text-white/60" />
            </button>
            <p className="text-sm font-semibold text-white">Новое обращение</p>
          </div>

          {/* Hint */}
          <div className="flex-1 flex flex-col justify-end px-4 py-4">
            <div className="bg-white/[0.06] rounded-2xl rounded-bl-sm px-4 py-3 mb-4 max-w-[85%]">
              <p className="text-[10px] font-semibold mb-1" style={{ color: '#3b82f6' }}>Поддержка</p>
              <p className="text-sm text-white/80">Опишите проблему, и мы поможем как можно быстрее.</p>
            </div>
          </div>

          {/* Input */}
          <div
            className="shrink-0 border-t border-white/5 px-3 py-2"
            style={{
              background: '#060f1e',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
            }}
          >
            <div
              className="flex items-end gap-2 p-2 rounded-2xl"
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
            >
              <textarea
                ref={draftInputRef}
                className="flex-1 bg-transparent text-sm resize-none outline-none py-1.5 px-2"
                style={{ color: 'var(--text)', minHeight: 36, maxHeight: 120 }}
                placeholder="Опиши проблему..."
                value={draftText}
                onChange={e => setDraftText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmitDraft()
                  }
                }}
                rows={1}
              />
              <button
                onClick={handleSubmitDraft}
                disabled={!draftText.trim() || draftCreating}
                className="p-2 rounded-xl disabled:opacity-40 transition-all active:scale-90"
                style={{ background: '#1d4ed8' }}
              >
                {draftCreating
                  ? <div className="w-[18px] h-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Send size={18} color="#fff" />
                }
              </button>
            </div>
          </div>
        </FullScreenOverlay>
      )}

      {/* Chat overlay */}
      {view === 'chat' && (
        <FullScreenOverlay>
          {/* Safe area top */}
          <div style={{ height: 'calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px))' }} />

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              const total = attachedFiles.length + files.length
              if (total > 5) { toast.error('Максимум 5 файлов'); return }
              setAttachedFiles(prev => [...prev, ...files])
              e.target.value = ''
            }}
          />

          {/* Header */}
          <div className="shrink-0 flex items-center gap-3 px-4 h-14 border-b border-white/5">
            <button
              onClick={backToList}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
            >
              <ArrowLeft size={18} className="text-white/60" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {displayTicket?.subject ?? 'Обращение'}
              </p>
            </div>
            {displayTicket && (() => {
              const s = STATUS_LABEL[displayTicket.status]
              return (
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                  style={{ color: s?.color ?? '#6b7280', background: s?.bg ?? 'rgba(107,114,128,0.15)' }}
                >
                  {s?.label ?? displayTicket.status}
                </span>
              )
            })()}
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            {displayTicket && (
              <div className="text-white/30 text-xs text-center italic py-2">
                Обращение открыто · {formatDate(displayTicket.created_at)}
              </div>
            )}

            <div className="space-y-2">
              {messages.map((msg: TicketMessage) => {
                const isUser = msg.sender_type === 'user'
                return (
                  <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={[
                        'max-w-[80%] px-3 py-2',
                        isUser
                          ? 'bg-blue-600/80 text-white rounded-2xl rounded-br-sm ml-auto'
                          : 'bg-white/[0.06] text-white rounded-2xl rounded-bl-sm mr-auto',
                      ].join(' ')}
                    >
                      {!isUser && (
                        <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#3b82f6' }}>
                          Поддержка
                        </p>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                      {msg.attachments.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <Paperclip size={10} className="text-white/40" />
                          <span className="text-[10px] text-white/40">{msg.attachments.length} вложений</span>
                        </div>
                      )}
                      <p className={`text-[10px] mt-1 text-right ${isUser ? 'text-white/50' : 'text-white/30'}`}>
                        {timeAgo(msg.created_at)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            {isClosed && displayTicket?.closed_at && (
              <div className="text-white/30 text-xs text-center italic py-2">
                Обращение закрыто · {formatDate(displayTicket.closed_at)}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Attached files */}
          {attachedFiles.length > 0 && (
            <div className="shrink-0 flex flex-wrap gap-2 px-4 pt-2 border-t border-white/5">
              {attachedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2.5 py-1">
                  <span className="text-xs text-white/60 truncate max-w-[120px]">{f.name}</span>
                  <button
                    onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}
                    className="text-white/30 hover:text-white/70"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input */}
          <div
            className="shrink-0 border-t border-white/5 px-3 py-2"
            style={{
              background: '#060f1e',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
            }}
          >
            {!isClosed ? (
              <div
                className="flex items-end gap-2 p-2 rounded-2xl"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
              >
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-xl bg-white/5 text-white/40 hover:text-white/70 transition-colors"
                >
                  <Paperclip size={18} />
                </button>
                <textarea
                  className="flex-1 bg-transparent text-sm resize-none outline-none py-1.5 px-2"
                  style={{ color: 'var(--text)', minHeight: 36, maxHeight: 120 }}
                  placeholder="Написать сообщение..."
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleReply()
                    }
                  }}
                  rows={1}
                />
                <button
                  onClick={handleReply}
                  disabled={sending || uploadingFiles || (!replyText.trim() && attachedFiles.length === 0)}
                  className="p-2 rounded-xl transition-all active:scale-90 disabled:opacity-40"
                  style={{ background: '#1d4ed8' }}
                >
                  <Send size={18} color="#fff" />
                </button>
              </div>
            ) : (
              <div
                className="text-center py-3 rounded-2xl text-sm"
                style={{ background: 'var(--bg2)', color: 'var(--hint)', border: '1px solid var(--border)' }}
              >
                Обращение закрыто
              </div>
            )}
          </div>
        </FullScreenOverlay>
      )}

      {/* List view */}
      <AnimatePresence mode="wait">
        {view === 'list' && (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ x: -30, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="space-y-1"
          >
            {tickets.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-5">
                <div
                  className="w-24 h-24 rounded-3xl flex items-center justify-center"
                  style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
                >
                  <MessageCircle size={40} style={{ color: 'var(--hint)' }} />
                </div>
                <div className="text-center">
                  <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Обращений пока нет</p>
                  <p className="text-sm" style={{ color: 'var(--hint)' }}>Опиши проблему — мы поможем</p>
                </div>
                <button
                  onClick={() => setView('drafting')}
                  className="btn-primary"
                  style={{ maxWidth: 220 }}
                >
                  Создать обращение
                </button>
              </div>
            ) : (
              tickets.map((ticket: Ticket, i: number) => {
                const status = STATUS_LABEL[ticket.status] ?? { label: ticket.status, color: '#6b7280', bg: 'rgba(107,114,128,0.15)' }
                const initial = avatarInitial(ticket.subject)
                return (
                  <motion.button
                    key={ticket.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.04 }}
                    onClick={() => openChat(ticket.id, ticket)}
                    className="flex items-center gap-3 px-3 py-3 rounded-2xl w-full text-left transition-all active:scale-[0.98]"
                    style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
                  >
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-base font-bold"
                      style={{ background: 'rgba(59,130,246,0.18)', color: '#3b82f6' }}
                    >
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                          {ticket.subject}
                        </p>
                        <span className="text-xs shrink-0" style={{ color: 'var(--hint)' }}>
                          {timeAgo(ticket.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-medium px-1.5 py-0.5 rounded-md"
                          style={{ color: status.color, background: status.bg }}
                        >
                          {status.label}
                        </span>
                      </div>
                    </div>
                  </motion.button>
                )
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
