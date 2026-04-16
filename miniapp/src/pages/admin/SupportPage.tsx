/**
 * src/pages/admin/SupportPage.tsx
 * Панель оператора поддержки — двухпанельный вид: список тикетов + чат.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  AlertCircle,
  Send,
  RefreshCw,
  ChevronLeft,
  User,
  Clock,
  MessageSquare,
  ChevronDown,
  FileText,
  UserCheck,
  Paperclip,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { apiClient } from '@/api/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminTicket {
  id: string
  subject: string
  status: string
  order_id: string | null
  assigned_to_id: string | null
  created_at: string
  closed_at: string | null
  user: {
    id: string
    telegram_id: number
    username: string | null
    first_name: string
  } | null
  assigned_to: {
    id: string
    username: string | null
    first_name: string
  } | null
}

interface TicketMessage {
  id: string
  sender_type: 'user' | 'admin'
  sender_id: string
  text: string
  attachments: string[]
  is_template_response: boolean
  created_at: string
}

interface AdminTicketDetail extends AdminTicket {
  messages: TicketMessage[]
}

interface SupportTemplate {
  id: string
  title: string
  text: string
  category: string | null
}

interface TicketListResponse {
  items: AdminTicket[]
  total: number
  page: number
  pages: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  open:         { label: 'Открыт',   color: '#34d399' },
  in_progress:  { label: 'В работе', color: '#6b9de8' },
  waiting_user: { label: 'Ожидает',  color: '#fbbf24' },
  resolved:     { label: 'Решён',    color: '#34d399' },
  closed:       { label: 'Закрыт',   color: '#9ca3af' },
}

const STATUS_TABS = [
  { key: '',             label: 'Все' },
  { key: 'open',        label: 'Открытые' },
  { key: 'in_progress', label: 'В работе' },
  { key: 'waiting_user',label: 'Ожидаем' },
  { key: 'closed',      label: 'Закрытые' },
]

const STATUS_OPTIONS = [
  { key: 'open',         label: 'Открыт' },
  { key: 'in_progress',  label: 'В работе' },
  { key: 'waiting_user', label: 'Ожидает ответа' },
  { key: 'resolved',     label: 'Решён' },
  { key: 'closed',       label: 'Закрыт' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)   return `${diff} сек назад`
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`
  return `${Math.floor(diff / 86400)} д назад`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, color: '#9ca3af' }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${s.color}20`, color: s.color }}
    >
      {s.label}
    </span>
  )
}

// ── TicketCard ────────────────────────────────────────────────────────────────

function TicketCard({
  ticket,
  selected,
  onClick,
}: {
  ticket: AdminTicket
  selected: boolean
  onClick: () => void
}) {
  const displayName = ticket.user
    ? ticket.user.username
      ? `@${ticket.user.username}`
      : ticket.user.first_name
    : 'Неизвестный'

  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 active:scale-[0.99]',
        selected
          ? 'bg-white/10 border-white/20'
          : 'bg-[#1a1f2e] border-white/[0.06] hover:bg-[#1f2538] hover:border-white/10',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-medium text-white truncate leading-tight">
          {ticket.subject}
        </span>
        <StatusBadge status={ticket.status} />
      </div>
      <div className="flex items-center gap-2 text-xs text-white/40">
        <User size={11} />
        <span className="truncate">{displayName}</span>
        <span>·</span>
        <Clock size={11} />
        <span className="shrink-0">{timeAgo(ticket.created_at)}</span>
      </div>
    </button>
  )
}

// ── ChatMessage ───────────────────────────────────────────────────────────────

function ChatMessage({ msg }: { msg: TicketMessage }) {
  const isAdmin = msg.sender_type === 'admin'
  return (
    <div className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[78%] px-4 py-2.5',
          isAdmin
            ? 'bg-indigo-600 text-white rounded-2xl rounded-br-md shadow-sm'
            : 'bg-white/[0.08] border border-white/[0.08] text-white/90 rounded-2xl rounded-bl-md shadow-sm',
        ].join(' ')}
      >
        {msg.text && <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>}
        {msg.attachments.length > 0 && (
          <div className={`flex flex-wrap gap-1.5 ${msg.text ? 'mt-2' : ''}`}>
            {msg.attachments.map((url, i) => {
              const isImage = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url)
              const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`
              return isImage ? (
                <a key={i} href={fullUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={fullUrl}
                    className="max-w-[180px] max-h-[180px] rounded-xl object-cover border border-white/10"
                    loading="lazy"
                  />
                </a>
              ) : (
                <a
                  key={i}
                  href={fullUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${isAdmin ? 'border-white/20 text-white/80' : 'border-white/10 text-white/60'}`}
                >
                  <FileText size={12} />
                  {url.split('/').pop() ?? 'Файл'}
                </a>
              )
            })}
          </div>
        )}
        <div
          className={`flex items-center gap-1.5 mt-1.5 text-xs ${
            isAdmin ? 'text-white/40 justify-end' : 'text-white/30'
          }`}
        >
          {msg.is_template_response && (
            <>
              <FileText size={10} />
              <span>шаблон</span>
              <span>·</span>
            </>
          )}
          <span>{formatTime(msg.created_at)}</span>
        </div>
      </div>
    </div>
  )
}

// ── TemplateDropdown ──────────────────────────────────────────────────────────

function TemplateDropdown({
  templates,
  onSelect,
}: {
  templates: SupportTemplate[]
  onSelect: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  if (!templates.length) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs text-white/50 hover:bg-white/[0.08] hover:text-white/70 active:scale-[0.97] transition-all duration-200"
      >
        <FileText size={13} />
        <span>Шаблоны</span>
        <ChevronDown size={12} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full mb-2 left-0 w-64 bg-[#1a1f2e] border border-white/[0.1] rounded-xl shadow-xl z-20 overflow-hidden"
          >
            <div className="p-1.5 max-h-52 overflow-y-auto">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onSelect(t.text)
                    setOpen(false)
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-white/[0.06] transition-colors duration-150"
                >
                  <div className="text-xs font-medium text-white/80 truncate">{t.title}</div>
                  {t.category && (
                    <div className="text-xs text-white/30 mt-0.5">{t.category}</div>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── StatusDropdown ────────────────────────────────────────────────────────────

function StatusDropdown({
  current,
  onChange,
  disabled,
}: {
  current: string
  onChange: (s: string) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const currentInfo = STATUS_MAP[current] ?? { label: current, color: '#9ca3af' }

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs font-medium hover:bg-white/[0.08] active:scale-[0.97] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ color: currentInfo.color }}
      >
        <span>{currentInfo.label}</span>
        <ChevronDown size={12} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-1 right-0 w-44 bg-[#1a1f2e] border border-white/[0.1] rounded-xl shadow-xl z-20 overflow-hidden"
          >
            <div className="p-1.5">
              {STATUS_OPTIONS.map((opt) => {
                const info = STATUS_MAP[opt.key] ?? { label: opt.label, color: '#9ca3af' }
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      onChange(opt.key)
                      setOpen(false)
                    }}
                    className={[
                      'w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors duration-150',
                      current === opt.key ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]',
                    ].join(' ')}
                    style={{ color: info.color }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: info.color }}
                    />
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── ChatPanel ─────────────────────────────────────────────────────────────────

function ChatPanel({
  ticketId,
  onBack,
}: {
  ticketId: string
  onBack: () => void
}) {
  const [detail, setDetail] = useState<AdminTicketDetail | null>(null)
  const [templates, setTemplates] = useState<SupportTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDetail = useCallback(async () => {
    try {
      const res = await apiClient.get<AdminTicketDetail>(`/admin/support/tickets/${ticketId}`)
      setDetail(res.data)
    } catch {
      // silently fail on background polls
    }
  }, [ticketId])

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await apiClient.get<SupportTemplate[]>('/admin/support/templates')
      setTemplates(res.data)
    } catch {
      // templates are optional
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    setDetail(null)
    fetchDetail()
      .finally(() => setLoading(false))
    fetchTemplates()

    pollingRef.current = setInterval(fetchDetail, 5000)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [fetchDetail, fetchTemplates])

  // Auto-scroll on new messages
  useEffect(() => {
    if (detail?.messages.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [detail?.messages.length])

  async function handleSend() {
    const text = replyText.trim()
    if ((!text && attachedFiles.length === 0) || sending) return
    setSending(true)
    try {
      let attachmentUrls: string[] = []
      if (attachedFiles.length > 0) {
        setUploading(true)
        attachmentUrls = await Promise.all(
          attachedFiles.map((f) => {
            const fd = new FormData()
            fd.append('file', f)
            return apiClient.post<{ url: string }>('/support/upload', fd).then((r) => r.data.url)
          })
        )
        setUploading(false)
      }
      await apiClient.post(`/admin/support/tickets/${ticketId}/reply`, {
        text,
        attachments: attachmentUrls,
        is_template: false,
      })
      setReplyText('')
      setAttachedFiles([])
      await fetchDetail()
      textareaRef.current?.focus()
    } catch {
      setUploading(false)
      toast.error('Не удалось отправить сообщение')
    } finally {
      setSending(false)
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!detail || changingStatus) return
    setChangingStatus(true)
    try {
      await apiClient.patch(`/admin/support/tickets/${ticketId}/status`, { status: newStatus })
      setDetail((prev) => prev ? { ...prev, status: newStatus } : prev)
      toast.success('Статус изменён')
    } catch {
      toast.error('Не удалось изменить статус')
    } finally {
      setChangingStatus(false)
    }
  }

  async function handleAssign() {
    if (!detail || assigning) return
    setAssigning(true)
    try {
      await apiClient.patch(`/admin/support/tickets/${ticketId}/assign`, { admin_id: null })
      await fetchDetail()
      toast.success('Тикет назначен на вас')
    } catch {
      toast.error('Не удалось назначить тикет')
    } finally {
      setAssigning(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function insertTemplate(text: string) {
    setReplyText(text)
    textareaRef.current?.focus()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-white/40 text-sm">Загрузка...</p>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-white/40">
        <AlertCircle size={36} />
        <p className="text-sm">Не удалось загрузить тикет</p>
        <button
          onClick={() => { setLoading(true); fetchDetail().finally(() => setLoading(false)) }}
          className="text-xs text-white/50 hover:text-white/70 active:scale-[0.98] transition-transform"
        >
          Попробовать снова
        </button>
      </div>
    )
  }

  const displayName = detail.user
    ? detail.user.username
      ? `@${detail.user.username}`
      : detail.user.first_name
    : 'Неизвестный'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] shrink-0">
        {/* Mobile back button */}
        <button
          onClick={onBack}
          className="md:hidden flex items-center gap-2 text-sm text-white/50 hover:text-white/80 active:scale-[0.97] transition-all mb-3"
        >
          <ChevronLeft size={16} />
          <span>К списку</span>
        </button>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white truncate">{detail.subject}</h2>
            <div className="flex items-center gap-2 mt-1 text-xs text-white/40">
              <User size={11} />
              <span>{displayName}</span>
              {detail.order_id && (
                <>
                  <span>·</span>
                  <span>Заказ #{detail.order_id.slice(-6)}</span>
                </>
              )}
              <span>·</span>
              <span>{timeAgo(detail.created_at)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={detail.status} />
          </div>
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            onClick={handleAssign}
            disabled={assigning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs text-white/60 hover:bg-white/[0.08] hover:text-white/80 active:scale-[0.97] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <UserCheck size={13} />
            <span>{assigning ? 'Назначаю...' : 'Взять'}</span>
          </button>

          <StatusDropdown
            current={detail.status}
            onChange={handleStatusChange}
            disabled={changingStatus}
          />

          {detail.assigned_to && (
            <span className="text-xs text-white/30 ml-auto">
              Назначен: {detail.assigned_to.username
                ? `@${detail.assigned_to.username}`
                : detail.assigned_to.first_name}
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
        {detail.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-white/20">
            <MessageSquare size={32} />
            <p className="text-sm">Нет сообщений</p>
          </div>
        ) : (
          <>
            {detail.messages.map((msg) => (
              <ChatMessage key={msg.id} msg={msg} />
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-white/[0.06] shrink-0">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            const total = attachedFiles.length + files.length
            if (total > 5) { toast.error('Максимум 5 файлов'); return }
            setAttachedFiles((prev) => [...prev, ...files])
            e.target.value = ''
          }}
        />

        {/* Attachment previews */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachedFiles.map((f, i) => (
              <div key={i} className="relative">
                {f.type.startsWith('image/') ? (
                  <img
                    src={URL.createObjectURL(f)}
                    className="w-14 h-14 object-cover rounded-xl border border-white/[0.1]"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl border border-white/[0.1] bg-white/[0.05] flex flex-col items-center justify-center gap-1 px-1">
                    <FileText size={16} className="text-white/40 shrink-0" />
                    <span className="text-[9px] text-white/40 truncate w-full text-center leading-tight">
                      {f.name.split('.').pop()?.toUpperCase()}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setAttachedFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
                >
                  <X size={9} color="#fff" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/40 hover:bg-white/[0.08] hover:text-white/70 active:scale-[0.95] transition-all duration-200 shrink-0 self-end"
          >
            <Paperclip size={15} />
          </button>
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Напишите ответ... (Enter — отправить, Shift+Enter — перенос)"
              rows={3}
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-white/15 focus:border-white/20 resize-none leading-relaxed transition-all duration-200"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={(!replyText.trim() && attachedFiles.length === 0) || sending || uploading}
            className="p-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.95] shrink-0 self-end"
          >
            {sending || uploading ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>

        {templates.length > 0 && (
          <div className="mt-2">
            <TemplateDropdown templates={templates} onSelect={insertTemplate} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminSupportPage() {
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [listData, setListData] = useState<TicketListResponse | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // On mobile: show chat instead of list when a ticket is selected
  const [mobileShowChat, setMobileShowChat] = useState(false)
  const autoOpenedRef = useRef(false)

  const loadList = useCallback(() => {
    setListLoading(true)
    setListError(false)
    apiClient
      .get<TicketListResponse>('/admin/support/tickets', {
        params: {
          status: activeTab || undefined,
          page,
          search: search || undefined,
        },
      })
      .then((r) => setListData(r.data))
      .catch(() => setListError(true))
      .finally(() => setListLoading(false))
  }, [activeTab, page, search])

  useEffect(() => { loadList() }, [loadList])

  // Background polling — тихо обновляет список каждые 10 секунд без лоадера
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const r = await apiClient.get<TicketListResponse>('/admin/support/tickets', {
          params: {
            status: activeTab || undefined,
            page,
            search: search || undefined,
          },
        })
        setListData(r.data)
      } catch { /* тихо */ }
    }, 10_000)
    return () => clearInterval(interval)
  }, [activeTab, page, search])

  // Auto-open ticket from ?ticket= URL param (runs once on first list load)
  useEffect(() => {
    if (autoOpenedRef.current) return
    const ticketId = searchParams.get('ticket')
    if (!ticketId || !listData?.items.length) return
    autoOpenedRef.current = true
    const found = listData.items.find(t => t.id === ticketId)
    if (found) {
      handleSelectTicket(found.id)
    } else {
      handleSelectTicket(ticketId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listData])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        setSearch(searchInput)
        setPage(1)
      }
    }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  function handleTabChange(key: string) {
    setActiveTab(key)
    setPage(1)
  }

  function handleSelectTicket(id: string) {
    setSelectedId(id)
    setMobileShowChat(true)
  }

  function handleMobileBack() {
    setMobileShowChat(false)
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 120px)' }}>
      <div className="mb-4 shrink-0">
        <h1 className="text-xl font-bold text-white">Поддержка</h1>
        {listData && (
          <p className="text-sm text-white/40 mt-0.5">Тикетов: {listData.total}</p>
        )}
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-4 flex-1 overflow-hidden">

        {/* Left panel: ticket list */}
        <div
          className={[
            'flex flex-col min-w-0',
            'w-full md:w-80 lg:w-96 md:shrink-0',
            mobileShowChat ? 'hidden md:flex' : 'flex',
          ].join(' ')}
        >
          {/* Search */}
          <div className="relative mb-3 shrink-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Поиск по теме, пользователю..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl py-2.5 pl-9 pr-4 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-all duration-200"
            />
          </div>

          {/* Status tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none shrink-0">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={[
                  'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-[0.97]',
                  activeTab === tab.key
                    ? 'bg-white/15 text-white'
                    : 'bg-white/[0.05] text-white/50 hover:bg-white/[0.08]',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Ticket list */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
            {listLoading ? (
              <p className="text-white/40 text-sm py-8 text-center">Загрузка...</p>
            ) : listError ? (
              <div className="flex flex-col items-center py-12 gap-3 text-white/40">
                <AlertCircle size={32} />
                <p className="text-sm">Ошибка загрузки</p>
                <button
                  onClick={loadList}
                  className="text-xs text-white/50 hover:text-white/70 active:scale-[0.98] transition-transform"
                >
                  Попробовать снова
                </button>
              </div>
            ) : !listData?.items.length ? (
              <div className="flex flex-col items-center py-12 gap-2 text-white/25">
                <MessageSquare size={32} />
                <p className="text-sm">Тикетов не найдено</p>
              </div>
            ) : (
              listData.items.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  selected={selectedId === ticket.id}
                  onClick={() => handleSelectTicket(ticket.id)}
                />
              ))
            )}
          </div>

          {/* Pagination */}
          {listData && listData.pages > 1 && (
            <div className="flex items-center justify-between pt-3 shrink-0 border-t border-white/[0.06] mt-3">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-xl bg-white/[0.05] text-xs text-white/60 disabled:opacity-30 hover:bg-white/[0.08] active:scale-[0.97] transition-all duration-200"
              >
                Назад
              </button>
              <span className="text-xs text-white/30">
                {page} / {listData.pages}
              </span>
              <button
                disabled={page >= listData.pages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-xl bg-white/[0.05] text-xs text-white/60 disabled:opacity-30 hover:bg-white/[0.08] active:scale-[0.97] transition-all duration-200"
              >
                Вперёд
              </button>
            </div>
          )}
        </div>

        {/* Right panel: chat view */}
        <div
          className={[
            'flex-1 min-w-0 rounded-xl border border-white/[0.06] overflow-hidden',
            'bg-[#1a1f2e]',
            mobileShowChat ? 'flex' : 'hidden md:flex',
            'flex-col',
          ].join(' ')}
        >
          {selectedId ? (
            <div className="flex flex-col h-full">
              <ChatPanel ticketId={selectedId} onBack={handleMobileBack} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-white/20 p-8">
              <MessageSquare size={48} strokeWidth={1.5} />
              <p className="text-sm text-center">
                Выберите тикет из списка слева, чтобы просмотреть переписку
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
