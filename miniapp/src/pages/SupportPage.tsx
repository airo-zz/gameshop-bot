// src/pages/SupportPage.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Send, Plus, ArrowLeft, Paperclip, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { supportApi, type Ticket, type TicketMessage } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'

type View = 'list' | 'new' | 'chat'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  open:         { label: 'Открыт',      color: '#34d399' },
  in_progress:  { label: 'В работе',    color: '#6b9de8' },
  waiting_user: { label: 'Ожидаем вас', color: '#fbbf24' },
  resolved:     { label: 'Решён',       color: '#34d399' },
  closed:       { label: 'Закрыт',      color: 'var(--hint)' },
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

export default function SupportPage() {
  const { haptic } = useTelegram()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const prefillOrderId = searchParams.get('order_id')

  const [view, setView] = useState<View>(prefillOrderId ? 'new' : 'list')
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [subject, setSubject] = useState(prefillOrderId ? `Заказ #${prefillOrderId.slice(0, 8)}` : '')
  const [message, setMessage] = useState('')
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const openChat = useCallback((ticketId: string) => {
    setSelectedTicketId(ticketId)
    setView('chat')
  }, [])

  const backToList = useCallback(() => {
    setView('list')
    setSelectedTicketId(null)
    setReplyText('')
  }, [])

  const handleCreate = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error('Заполни тему и сообщение')
      return
    }
    setSending(true)
    haptic.impact('medium')
    try {
      const result = await supportApi.createTicket({
        subject: subject.trim(),
        message: message.trim(),
        order_id: prefillOrderId || undefined,
      })
      haptic.success()
      toast.success('Обращение создано!')
      setSubject('')
      setMessage('')
      refetchTickets()
      openChat(result.ticket_id)
    } catch {
      haptic.error()
      toast.error('Ошибка отправки')
    } finally {
      setSending(false)
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
  const isClosed = selectedTicket?.status === 'closed' || selectedTicket?.status === 'resolved'

  return (
    <div className="px-4 pt-5 pb-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        {view !== 'list' ? (
          <button
            onClick={view === 'chat' ? backToList : () => setView('list')}
            className="flex items-center gap-1.5 text-sm font-medium"
            style={{ color: '#6b9de8' }}
          >
            <ArrowLeft size={16} />
            Назад
          </button>
        ) : (
          <h1 className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>
            Поддержка
          </h1>
        )}

        {view === 'list' && (
          <button
            onClick={() => setView('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all active:scale-95"
            style={{ background: '#2d58ad', color: '#fff' }}
          >
            <Plus size={14} />
            Новое
          </button>
        )}

        {view === 'chat' && selectedTicket && (
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{
              color: STATUS_LABEL[selectedTicket.status]?.color ?? 'var(--hint)',
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
            }}
          >
            {STATUS_LABEL[selectedTicket.status]?.label ?? selectedTicket.status}
          </span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* ── List view ─────────────────────────────────────────────── */}
        {view === 'list' && (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
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
                <button onClick={() => setView('new')} className="btn-primary" style={{ maxWidth: 220 }}>
                  Создать обращение
                </button>
              </div>
            ) : (
              tickets.map((ticket: Ticket) => {
                const status = STATUS_LABEL[ticket.status] ?? { label: ticket.status, color: 'var(--hint)' }
                return (
                  <button
                    key={ticket.id}
                    onClick={() => openChat(ticket.id)}
                    className="flex items-center gap-3 p-4 rounded-2xl w-full text-left transition-all active:scale-[0.98]"
                    style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                        {ticket.subject}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-medium" style={{ color: status.color }}>
                          {status.label}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--hint)' }}>
                          {timeAgo(ticket.created_at)}
                        </span>
                      </div>
                    </div>
                    <ArrowLeft size={16} style={{ color: 'var(--hint)', transform: 'rotate(180deg)' }} />
                  </button>
                )
              })
            )}
          </motion.div>
        )}

        {/* ── New ticket form ───────────────────────────────────────── */}
        {view === 'new' && (
          <motion.div
            key="new"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <p className="text-sm" style={{ color: 'var(--hint)' }}>
              Опиши проблему — мы ответим в ближайшее время
            </p>

            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--hint)' }}>
                Тема *
              </label>
              <input
                type="text"
                className="input"
                placeholder="Например: Не пришёл заказ"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                maxLength={200}
              />
            </div>

            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--hint)' }}>
                Сообщение *
              </label>
              <textarea
                className="input resize-none"
                placeholder="Подробно опиши проблему..."
                rows={5}
                value={message}
                onChange={e => setMessage(e.target.value)}
                maxLength={2000}
              />
              <p className="text-xs mt-1 text-right" style={{ color: 'var(--hint)' }}>
                {message.length}/2000
              </p>
            </div>

            <button
              className="btn-primary gap-2"
              onClick={handleCreate}
              disabled={sending || !subject.trim() || !message.trim()}
            >
              {sending ? 'Отправляем...' : <><Send size={16} /> Отправить</>}
            </button>
          </motion.div>
        )}

        {/* ── Chat view ─────────────────────────────────────────────── */}
        {view === 'chat' && selectedTicket && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col"
            style={{ minHeight: 'calc(100vh - 200px)' }}
          >
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
                if (total > 5) {
                  toast.error('Максимум 5 файлов')
                  return
                }
                setAttachedFiles(prev => [...prev, ...files])
                e.target.value = ''
              }}
            />

            {/* Ticket subject */}
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
              {selectedTicket.subject}
            </p>

            {/* Messages */}
            <div
              className="flex-1 space-y-3 overflow-y-auto mb-4 pr-1"
              style={{ maxHeight: 'calc(100vh - 320px)' }}
            >
              {messages.map((msg: TicketMessage) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="max-w-[80%] px-3.5 py-2.5 rounded-2xl"
                    style={{
                      background: msg.sender_type === 'user' ? '#2d58ad' : 'var(--bg2)',
                      border: msg.sender_type === 'admin' ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    {msg.sender_type === 'admin' && (
                      <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#6b9de8' }}>
                        Поддержка
                      </p>
                    )}
                    <p
                      className="text-sm whitespace-pre-wrap break-words"
                      style={{ color: msg.sender_type === 'user' ? '#fff' : 'var(--text)' }}
                    >
                      {msg.text}
                    </p>
                    {msg.attachments.length > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <Paperclip size={10} style={{ color: 'var(--hint)' }} />
                        <span className="text-[10px]" style={{ color: 'var(--hint)' }}>
                          {msg.attachments.length} вложений
                        </span>
                      </div>
                    )}
                    <p
                      className="text-[10px] mt-1 text-right"
                      style={{ color: msg.sender_type === 'user' ? 'rgba(255,255,255,0.5)' : 'var(--hint)' }}
                    >
                      {timeAgo(msg.created_at)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            {!isClosed ? (
              <div className="space-y-1">
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-1 pt-1">
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
                <div
                  className="flex items-end gap-2 p-2 rounded-2xl"
                  style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
                >
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
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 rounded-xl bg-white/5 text-white/40 hover:text-white/70 transition-colors"
                  >
                    <Paperclip size={18} />
                  </button>
                  <button
                    onClick={handleReply}
                    disabled={sending || uploadingFiles || (!replyText.trim() && attachedFiles.length === 0)}
                    className="p-2 rounded-xl transition-all active:scale-90 disabled:opacity-40"
                    style={{ background: '#2d58ad' }}
                  >
                    <Send size={18} color="#fff" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="text-center py-3 rounded-2xl text-sm"
                style={{ background: 'var(--bg2)', color: 'var(--hint)', border: '1px solid var(--border)' }}
              >
                Обращение закрыто
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
