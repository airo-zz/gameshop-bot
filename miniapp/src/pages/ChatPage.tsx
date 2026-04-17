// src/pages/ChatPage.tsx
import {
  useState, useEffect, useRef, useCallback,
  type FormEvent, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Send, Paperclip, X, ZoomIn } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { chatApi, type ChatMessage } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'
import logo from '@/assets/logo.png'

// ── Image compression ─────────────────────────────────────────────────────────

async function compressImage(file: File, maxDim = 1280, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  return new Promise(resolve => {
    const img = new Image()
    const blobUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(blobUrl)
      let { width, height } = img
      if (width <= maxDim && height <= maxDim && file.size < 800_000) {
        resolve(file)
        return
      }
      if (width > height) { height = Math.round(height * maxDim / width); width = maxDim }
      else { width = Math.round(width * maxDim / height); height = maxDim }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        blob => {
          if (!blob) { resolve(file); return }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
        },
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(file) }
    img.src = blobUrl
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
}

function getDateKey(dateStr: string): string {
  return new Date(dateStr).toDateString()
}

// ── Link-aware text renderer ──────────────────────────────────────────────────
// Matches https://, www., or bare domain.tld — but NOT email addresses (user@domain)

const URL_RE = /(?:https?:\/\/\S+|www\.\S+|[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,6}(?:\/\S*)?)/g

function TextWithLinks({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = []
  let lastIndex = 0
  URL_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = URL_RE.exec(text)) !== null) {
    const raw = match[0]
    const idx = match.index
    // Skip if preceded by '@' (email address)
    if (idx > 0 && text[idx - 1] === '@') continue
    // Strip trailing punctuation
    const clean = raw.replace(/[.,!?;:'")\]]+$/, '')
    if (!clean) continue

    if (idx > lastIndex) parts.push(text.slice(lastIndex, idx))
    const href = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`
    parts.push(
      <a
        key={idx}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{ color: '#93c5fd', textDecoration: 'underline', wordBreak: 'break-all' }}
      >
        {clean}
      </a>
    )
    lastIndex = idx + raw.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return <>{parts}</>
}

// ── System message ────────────────────────────────────────────────────────────

// Matches: "Заказ #001000 на сумму 1 500 ₽ успешно оплачен. Товар: X. Ожидайте...|oid=uuid"
const PAYMENT_RE = /^(Заказ\s+#\S+\s+на\s+сумму\s+[\d\s\u00a0]+₽\s+успешно\s+оплачен\..*?)(?:\|oid=([a-f0-9-]+))?$/s

function SystemMessage({ text }: { text: string }) {
  const match = PAYMENT_RE.exec(text)

  if (match) {
    const displayText = match[1].trim()
    const orderId = match[2] ?? null
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0', marginBottom: 8 }}>
        <div style={{
          display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          padding: '12px 16px', borderRadius: 16,
          background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
          maxWidth: '88%',
        }}>
          <span style={{ fontSize: 12, color: '#34d399', fontWeight: 700, letterSpacing: 0.2 }}>
            Оплата подтверждена
          </span>
          <p style={{
            margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.75)',
            textAlign: 'center', lineHeight: 1.5,
          }}>
            {displayText}
          </p>
          {orderId && (
            <Link
              to={`/orders/${orderId}`}
              style={{
                fontSize: 11, color: 'rgba(255,255,255,0.45)',
                textDecoration: 'none', padding: '3px 10px',
                borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
              }}
            >
              Перейти в заказ
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

// ── Date separator ────────────────────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', margin: '12px 0 8px' }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', padding: '3px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.05)' }}>
        {label}
      </span>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  onImageClick,
}: {
  msg: ChatMessage & { optimistic?: boolean }
  onImageClick: (url: string) => void
}) {
  const isUser = msg.sender_type === 'user'
  const isAdmin = msg.sender_type === 'admin'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-1`}>
      <div style={{
        maxWidth: '80%',
        padding: '8px 12px',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isUser ? 'rgba(29,78,216,0.85)' : 'rgba(255,255,255,0.07)',
        border: isUser ? '1px solid rgba(96,165,250,0.2)' : '1px solid rgba(255,255,255,0.06)',
        opacity: msg.optimistic ? 0.65 : 1,
        transition: 'opacity 0.2s',
      }}>
        {isAdmin && (
          <p style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', marginBottom: 3, userSelect: 'none' }}>
            Продавец
          </p>
        )}
        {msg.text && (
          <p style={{ fontSize: 14, color: '#fff', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45, margin: 0, userSelect: 'text', WebkitUserSelect: 'text' }}>
            <TextWithLinks text={msg.text} />
          </p>
        )}
        {msg.attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: msg.text ? 6 : 0 }}>
            {msg.attachments.map((url, idx) => {
              const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(url)
              const absUrl = url.startsWith('http') ? url : `https://redonate.su${url}`
              const openFile = () => {
                const tg = (window as any).Telegram?.WebApp
                if (tg?.openLink) tg.openLink(absUrl)
                else window.open(absUrl, '_blank')
              }
              return isImage ? (
                <button
                  key={idx}
                  type="button"
                  onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); onImageClick(absUrl) }}
                  onClick={e => { e.stopPropagation(); onImageClick(absUrl) }}
                  style={{ width: 80, height: 80, borderRadius: 10, overflow: 'hidden', flexShrink: 0, border: 'none', padding: 0, cursor: 'pointer', position: 'relative', background: 'transparent', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                >
                  <img src={absUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <ZoomIn size={16} color="rgba(255,255,255,0.8)" />
                  </div>
                </button>
              ) : (
                <button
                  key={idx}
                  type="button"
                  onTouchEnd={e => { e.preventDefault(); openFile() }}
                  onClick={openFile}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                >
                  <Paperclip size={12} /> Файл {idx + 1}
                </button>
              )
            })}
          </div>
        )}
        <p style={{ fontSize: 10, color: isUser ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.25)', marginTop: 4, marginBottom: 0, textAlign: 'right' }}>
          {msg.optimistic ? '...' : formatTime(msg.created_at)}
        </p>
      </div>
    </div>
  )
}

// ── Main ChatPage ─────────────────────────────────────────────────────────────

export default function ChatPage() {
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

  const [searchParams, setSearchParams] = useSearchParams()
  const orderIdParam = searchParams.get('order_id')
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  useEffect(() => {
    let maxHeight = window.visualViewport?.height ?? window.innerHeight
    const tgWA = (window as any).Telegram?.WebApp
    const check = () => {
      const h = window.visualViewport?.height ?? window.innerHeight
      if (h > maxHeight) maxHeight = h
      setKeyboardOpen(maxHeight - h > 100)
    }
    tgWA?.onEvent?.('viewportChanged', check)
    window.visualViewport?.addEventListener('resize', check)
    return () => {
      tgWA?.offEvent?.('viewportChanged', check)
      window.visualViewport?.removeEventListener('resize', check)
    }
  }, [])

  const { data: chat, isLoading: chatLoading } = useQuery({
    queryKey: ['chat'],
    queryFn: () => chatApi.getOrCreate(),
    staleTime: Infinity,
  })

  const { data: messages = [] } = useQuery<(ChatMessage & { optimistic?: boolean })[]>({
    queryKey: ['chat-messages'],
    queryFn: () => chatApi.getMessages(),
    enabled: !!chat,
    refetchInterval: 2000,
    staleTime: 0,
  })

  // Помечаем чат прочитанным при открытии
  useEffect(() => {
    if (!chat) return
    chatApi.markRead().catch(() => {})
    // Инвалидируем кэш chat чтобы unread_count обновился в Layout
    queryClient.invalidateQueries({ queryKey: ['chat'] })
  }, [chat, queryClient])

  // Помечаем прочитанным при получении новых сообщений от admin/system
  const prevAdminMsgCount = useRef(0)
  useEffect(() => {
    const adminMsgCount = messages.filter(m => m.sender_type === 'admin' || m.sender_type === 'system').length
    if (adminMsgCount > prevAdminMsgCount.current && prevAdminMsgCount.current > 0) {
      chatApi.markRead().catch(() => {})
      queryClient.invalidateQueries({ queryKey: ['chat'] })
    }
    prevAdminMsgCount.current = adminMsgCount
  }, [messages, queryClient])

  // When arriving from post-purchase redirect — force refetch after delay to catch system message
  useEffect(() => {
    if (!orderIdParam || !chat) return
    const timer = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] })
      setSearchParams({}, { replace: true })
    }, 1500)
    return () => clearTimeout(timer)
  }, [orderIdParam, chat, queryClient, setSearchParams])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView()
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

    const optimisticMsg: ChatMessage & { optimistic: true } = {
      id: `opt-${Date.now()}`,
      chat_id: chat?.id ?? '',
      sender_type: 'user',
      text: localText || null,
      attachments: attachedFiles.map(f => URL.createObjectURL(f)),
      created_at: new Date().toISOString(),
      optimistic: true,
    }
    queryClient.setQueryData<(ChatMessage & { optimistic?: boolean })[]>(
      ['chat-messages'],
      prev => [...(prev ?? []), optimisticMsg],
    )

    try {
      let attachmentUrls: string[] = []
      if (attachedFiles.length > 0) {
        setUploading(true)
        const compressed = await Promise.all(attachedFiles.map(f => compressImage(f)))
        attachmentUrls = await Promise.all(compressed.map(f => chatApi.upload(f).then(r => r.url)))
        setAttachedFiles([])
        setUploading(false)
      }
      await chatApi.sendMessage(localText || null, attachmentUrls)
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] })
    } catch {
      haptic.error()
      toast.error('Ошибка отправки')
      setText(localText)
      queryClient.setQueryData<(ChatMessage & { optimistic?: boolean })[]>(
        ['chat-messages'],
        prev => prev?.filter(m => m.id !== optimisticMsg.id) ?? [],
      )
    } finally {
      setSending(false)
      setUploading(false)
    }
  }, [text, attachedFiles, sending, chat, haptic, queryClient])

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

  return (
    // height: 100% works because Layout sets main to overflow:hidden + flex col when on /chat
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 16px', height: 56,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(6,15,30,0.97)',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          <img src={logo} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.3 }}>Продавец</p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0, lineHeight: 1 }}>Онлайн</p>
        </div>
      </div>

      {/* Order banner — shown briefly after post-purchase redirect */}
      {orderIdParam && (
        <div style={{
          flexShrink: 0, padding: '8px 16px',
          background: 'rgba(16,185,129,0.12)', borderBottom: '1px solid rgba(16,185,129,0.2)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 12, color: '#34d399' }}>
            Заказ оформлен — ожидайте подтверждения
          </span>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => {
          const files = Array.from(e.target.files ?? [])
          if (attachedFiles.length + files.length > 5) { toast.error('Максимум 5 файлов'); return }
          setAttachedFiles(prev => [...prev, ...files])
          e.target.value = ''
        }}
      />

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', overscrollBehavior: 'contain' }}>
        {chatLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 16 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                height: 44, borderRadius: 18, background: 'var(--bg2)',
                border: '1px solid var(--border)', animation: 'pulse 1.5s ease infinite',
                width: i % 2 === 0 ? '60%' : '75%',
                alignSelf: i % 2 === 0 ? 'flex-end' : 'flex-start',
              }} />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 48, gap: 12, textAlign: 'center' }}
            >
              <div style={{
                width: 64, height: 64, borderRadius: 22,
                background: 'rgba(29,78,216,0.12)', border: '1px solid rgba(29,78,216,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              }}>
                <img src={logo} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', margin: '0 0 6px' }}>Чат с продавцом</p>
                <p style={{ fontSize: 13, color: 'var(--hint)', margin: 0, lineHeight: 1.5 }}>Напишите нам — ответим быстро</p>
              </div>
            </motion.div>
          </AnimatePresence>
        ) : (
          grouped.map(group => (
            <div key={group.dateKey}>
              <DateSeparator label={group.label} />
              {group.msgs.map(msg => {
                if (msg.sender_type === 'system') {
                  return <SystemMessage key={msg.id} text={msg.text ?? ''} />
                }
                return <MessageBubble key={msg.id} msg={msg} onImageClick={setLightboxUrl} />
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Attached files preview */}
      {attachedFiles.length > 0 && (
        <div style={{ flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {attachedFiles.map((f, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={URL.createObjectURL(f)} alt=""
                style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
              <button
                onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}
                style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <X size={10} color="#fff" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div style={{
        flexShrink: 0, padding: '8px 12px',
        paddingBottom: keyboardOpen ? '8px' : 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
        background: '#060f1e', borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        <form
          onSubmit={handleSend}
          style={{ display: 'flex', alignItems: 'flex-end', gap: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '6px 6px 6px 14px' }}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 10, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
          >
            <Paperclip size={18} />
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Написать сообщение..."
            rows={1}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontSize: 14, color: '#fff', minHeight: 32, maxHeight: 120, lineHeight: 1.5, padding: '4px 0' }}
          />
          <button
            type="submit"
            disabled={(!text.trim() && attachedFiles.length === 0) || sending || uploading}
            style={{
              flexShrink: 0, width: 36, height: 36, borderRadius: 12, border: 'none',
              background: (text.trim() || attachedFiles.length > 0) ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : 'rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s',
            }}
          >
            {sending || uploading
              ? <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              : <Send size={16} color="#fff" />
            }
          </button>
        </form>
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
            <button
              onClick={e => { e.stopPropagation(); setLightboxUrl(null) }}
              style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 16px)', right: 16, zIndex: 301, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 20, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <X size={18} color="#fff" />
            </button>
            <motion.img
              src={lightboxUrl}
              alt=""
              onClick={e => e.stopPropagation()}
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.88, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.34, 1.26, 0.64, 1] }}
              style={{ maxWidth: '92vw', maxHeight: '82vh', borderRadius: 12, objectFit: 'contain' }}
            />
          </motion.div>,
          document.body,
        )}
      </AnimatePresence>
    </div>
  )
}
