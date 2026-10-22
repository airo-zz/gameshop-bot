/**
 * src/web/pages/WebChatPage.tsx
 * Онлайн-чат с оператором на сайте — тот же чат, что в Mini App (chatApi):
 * оператор отвечает из админки или бота, переписка общая. Новые сообщения —
 * опросом раз в 3 с. Пользователю без Telegram о непрочитанном ответе
 * приходит письмо (worker/tasks/chat_notifications.py).
 *   /chat?order_id=<uuid> — вопрос по заказу: подставляет номер в поле ввода.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PhotoProvider, PhotoView } from 'react-photo-view'
import 'react-photo-view/dist/react-photo-view.css'
import toast from 'react-hot-toast'
import { Send, Paperclip, X } from '@/components/ui/icons'
import { chatApi, ordersApi, type ChatMessage } from '@/api'
import { compressImage } from '@/utils/image'
import { fmtNum } from '@/utils/format'
import { usePageMeta } from '@/web/seo'
import logoMark from '@/assets/logo-mark.png'

type Msg = ChatMessage & { optimistic?: boolean }

const MAX_FILES = 5
const MSGS_KEY = ['web', 'chat-messages'] as const

// ── Текст со ссылками ────────────────────────────────────────────────────────
const URL_RE = /(?:https?:\/\/\S+|www\.\S+)/g

function Linkify({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let last = 0
  URL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = URL_RE.exec(text)) !== null) {
    const clean = m[0].replace(/[.,!?;:'")\]]+$/, '')
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(
      <a key={m.index} href={/^https?:/i.test(clean) ? clean : `https://${clean}`} target="_blank"
         rel="noopener noreferrer" className="underline break-all">{clean}</a>,
    )
    last = m.index + clean.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

const time = (s: string) => new Date(s).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

function dateLabel(s: string) {
  const d = new Date(s)
  const today = new Date()
  const y = new Date(); y.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === y.toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

const abs = (url: string) => (url.startsWith('http') || url.startsWith('blob:') ? url : `${window.location.origin}${url}`)

// ── Системные сообщения (оплата, индивидуальный лот) ─────────────────────────
const PAYMENT_RE = /^(Заказ\s+#\S+\s+на\s+сумму\s+[\d\s ]+₽\s+успешно\s+оплачен\..*?)(?:\|oid=([a-f0-9-]+))?$/s
const LOT_RE = /^__lot__\|([0-9a-f-]+)\|(\d+)\|([\s\S]+)$/

function SystemMessage({ text }: { text: string }) {
  const lot = LOT_RE.exec(text)
  if (lot) {
    const [, oid, price, title] = lot
    return (
      <div className="flex justify-center my-3">
        <div className="w-full max-w-sm rounded-2xl bg-[var(--bg3)] p-4 flex flex-col gap-2">
          <span className="text-[11px] font-semibold tracking-wide text-[var(--link)]">ИНДИВИДУАЛЬНЫЙ ЛОТ</span>
          <span className="text-sm text-[var(--text)] break-words">{title}</span>
          <span className="text-lg font-semibold text-[var(--text)] num">{fmtNum(price)} ₽</span>
          <Link to={`/orders/${oid}`} className="mt-1 h-10 rounded-xl flex items-center justify-center text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors">
            Оплатить
          </Link>
        </div>
      </div>
    )
  }
  const pay = PAYMENT_RE.exec(text)
  if (pay) {
    return (
      <div className="flex justify-center my-3">
        <div className="max-w-md rounded-2xl px-4 py-3 text-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
          <p className="text-xs font-semibold text-[#34d399]">Оплата подтверждена</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-2)]">{pay[1].trim()}</p>
          {pay[2] && (
            <Link to={`/orders/${pay[2]}`} className="inline-block mt-2 text-xs text-[var(--link)] hover:text-[var(--text)]">Перейти в заказ</Link>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-center my-2">
      <span className="max-w-md rounded-xl px-3.5 py-2 text-xs leading-relaxed text-center whitespace-pre-wrap break-words text-[var(--text-2)] bg-[var(--bg3)]">
        <Linkify text={text} />
      </span>
    </div>
  )
}

function Bubble({ msg }: { msg: Msg }) {
  const mine = msg.sender_type === 'user'
  return (
    <div className={'flex mb-1.5 ' + (mine ? 'justify-end' : 'justify-start')}>
      <div
        className={'max-w-[80%] md:max-w-[65%] px-3.5 py-2 transition-opacity ' + (mine ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg3)] text-[var(--text)]')}
        style={{ borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px', opacity: msg.optimistic ? 0.6 : 1 }}
      >
        {!mine && <p className="text-[11px] font-semibold text-[var(--link)] mb-0.5">Оператор</p>}
        {msg.text && (
          <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words" style={{ margin: 0 }}>
            <Linkify text={msg.text} />
          </p>
        )}
        {msg.attachments.length > 0 && (
          <div className={'flex flex-wrap gap-1.5 ' + (msg.text ? 'mt-1.5' : '')}>
            {msg.attachments.map((url, i) => (
              <PhotoView key={i} src={abs(url)}>
                <img src={abs(url)} alt="" className="w-24 h-24 rounded-lg object-cover cursor-zoom-in" />
              </PhotoView>
            ))}
          </div>
        )}
        <p className={'text-[10px] mt-1 text-right ' + (mine ? 'text-white/60' : 'text-[var(--hint)]')} style={{ marginBottom: 0 }}>
          {msg.optimistic ? '…' : time(msg.created_at)}
        </p>
      </div>
    </div>
  )
}

export default function WebChatPage() {
  usePageMeta({ title: 'Чат с оператором' })
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const orderId = params.get('order_id')
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { data: chat } = useQuery({
    queryKey: ['web', 'chat'],
    queryFn: chatApi.getOrCreate,
    staleTime: Infinity,
  })

  const { data: messages = [], isLoading } = useQuery<Msg[]>({
    queryKey: MSGS_KEY,
    queryFn: () => chatApi.getMessages(),
    enabled: !!chat,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  })

  // Вопрос по заказу: подставляем номер в поле ввода
  useEffect(() => {
    if (!orderId) return
    ordersApi.get(orderId)
      .then((o) => setText((t) => t || `Вопрос по заказу ${o.order_number}: `))
      .catch(() => {})
      .finally(() => { setParams({}, { replace: true }); inputRef.current?.focus() })
  }, [orderId, setParams])

  // Прочитано: при открытии и при новых сообщениях оператора
  const lastIncoming = [...messages].reverse().find((m) => m.sender_type !== 'user')?.id
  useEffect(() => {
    if (!chat) return
    chatApi.markRead().catch(() => {})
    qc.setQueryData(['web', 'chat-unread'], 0)
  }, [chat, lastIncoming, qc])

  useLayoutEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const send = useCallback(async () => {
    const trimmed = text.trim()
    if ((!trimmed && files.length === 0) || sending) return
    setSending(true)
    const sentFiles = files
    const optimistic: Msg = {
      id: `opt-${Date.now()}`,
      chat_id: chat?.id ?? '',
      sender_type: 'user',
      text: trimmed || null,
      attachments: sentFiles.map((f) => URL.createObjectURL(f)),
      created_at: new Date().toISOString(),
      optimistic: true,
    }
    qc.setQueryData<Msg[]>(MSGS_KEY, (prev) => [...(prev ?? []), optimistic])
    setText('')
    setFiles([])
    try {
      let urls: string[] = []
      if (sentFiles.length) {
        const compressed = await Promise.all(sentFiles.map((f) => compressImage(f)))
        urls = await Promise.all(compressed.map((f) => chatApi.upload(f).then((r) => r.url)))
      }
      await chatApi.sendMessage(trimmed || null, urls)
      await qc.invalidateQueries({ queryKey: MSGS_KEY })
    } catch {
      toast.error('Не удалось отправить сообщение')
      setText(trimmed)
      setFiles(sentFiles)
      qc.setQueryData<Msg[]>(MSGS_KEY, (prev) => prev?.filter((m) => m.id !== optimistic.id) ?? [])
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }, [text, files, sending, chat, qc])

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length + picked.length > MAX_FILES) { toast.error(`Не больше ${MAX_FILES} изображений`); return }
    setFiles((prev) => [...prev, ...picked])
  }

  // Автовысота поля ввода
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [text])

  let prevDay = ''

  return (
    <div className="web-container py-6 md:py-10">
      <div
        className="mx-auto max-w-3xl flex flex-col rounded-3xl border border-[var(--border)] bg-[var(--bg2)] overflow-hidden"
        style={{ height: 'calc(100dvh - 64px - 80px)', minHeight: 420 }}
      >
        <div className="flex items-center gap-3 px-5 h-16 border-b border-[var(--border)] shrink-0">
          <span className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--accent)]">
            <img src={logoMark} alt="" className="w-6 h-6 object-contain" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[15px] text-[var(--text)] leading-tight" style={{ margin: 0 }}>Чат с оператором</h1>
            <p className="text-xs text-[var(--hint)]">Ответим здесь же, на сайте</p>
          </div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-4" style={{ overscrollBehavior: 'contain' }}>
          {!isLoading && messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <p className="text-[15px] font-medium text-[var(--text)]">Напишите нам</p>
              <p className="mt-1.5 text-sm text-[var(--hint)] max-w-sm leading-relaxed">
                Вопрос по заказу, игре или оплате — оператор ответит в этом чате. Можно приложить скриншоты.
              </p>
            </div>
          ) : (
            <PhotoProvider bannerVisible={false}>
              {messages.map((m) => {
                const day = new Date(m.created_at).toDateString()
                const sep = day !== prevDay
                prevDay = day
                return (
                  <div key={m.id}>
                    {sep && (
                      <div className="text-center my-3">
                        <span className="text-[11px] text-[var(--hint)] px-2.5 py-1 rounded-full bg-[var(--bg3)]">{dateLabel(m.created_at)}</span>
                      </div>
                    )}
                    {m.sender_type === 'system' ? <SystemMessage text={m.text ?? ''} /> : <Bubble msg={m} />}
                  </div>
                )
              })}
            </PhotoProvider>
          )}
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 md:px-6 pt-3 border-t border-[var(--border)] shrink-0">
            {files.map((f, i) => (
              <div key={i} className="relative">
                <img src={URL.createObjectURL(f)} alt="" className="w-14 h-14 rounded-lg object-cover" />
                <button
                  type="button"
                  aria-label="Убрать изображение"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/80 text-white flex items-center justify-center"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); send() }}
          className="flex items-end gap-2 p-3 md:p-4 border-t border-[var(--border)] shrink-0"
        >
          <label className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-[var(--hint)] hover:text-[var(--text)] hover:bg-[var(--bg3)] cursor-pointer transition-colors" title="Приложить изображение">
            <Paperclip size={20} />
            <input type="file" accept="image/*" multiple onChange={onPick} className="hidden" />
          </label>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Сообщение"
            rows={1}
            maxLength={4000}
            aria-label="Сообщение"
            className="flex-1 min-h-[44px] max-h-40 resize-none rounded-xl bg-[var(--bg3)] border border-transparent focus:border-[var(--accent)] outline-none px-4 py-[11px] text-[14px] leading-snug text-[var(--text)] placeholder:text-[var(--hint)] transition-colors"
          />
          <button
            type="submit"
            disabled={sending || (!text.trim() && files.length === 0)}
            aria-label="Отправить"
            className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] disabled:opacity-40 transition-colors"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  )
}
