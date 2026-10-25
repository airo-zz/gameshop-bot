/**
 * src/web/chat/ChatWidget.tsx
 * Чат с оператором на сайте — кнопка в правом нижнем углу и окно над ней.
 * На компьютере окно можно развернуть на весь экран; на телефоне оно всегда
 * на весь экран. Тот же чат, что в Mini App: оператор отвечает из админки или
 * бота. Без входа пишет гость (chatTransport.guestTransport); при входе его
 * переписка переходит в аккаунт.
 * Открыть из любого места: openChat({ prefill }) из ./chatStore.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { PhotoProvider, PhotoView } from 'react-photo-view'
import 'react-photo-view/dist/react-photo-view.css'
import toast from 'react-hot-toast'
import { Send, Paperclip, X, MessageCircle, Maximize2, Minimize2 } from '@/components/ui/icons'
import type { ChatMessage } from '@/api'
import { clearGuestToken } from '@/api/client'
import { compressImage } from '@/utils/image'
import { fmtNum } from '@/utils/format'
import { useWebAuth } from '@/web/auth/useWebAuth'
import logoMark from '@/assets/logo-mark.png'
import { useChatWidget } from './chatStore'
import ChatHint, { useChatGreeting } from './ChatHint'
import { guestTransport, userTransport, type ChatTransport } from './chatTransport'

type Msg = ChatMessage & { optimistic?: boolean }

const MAX_FILES = 5

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
        className={'max-w-[82%] px-3.5 py-2 transition-opacity ' + (mine ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg3)] text-[var(--text)]')}
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

// ── Лента + поле ввода ───────────────────────────────────────────────────────

function ChatThread({ transport, mode }: { transport: ChatTransport; mode: 'user' | 'guest' }) {
  const qc = useQueryClient()
  const takePrefill = useChatWidget((s) => s.takePrefill)
  const prefill = useChatWidget((s) => s.prefill)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [started, setStarted] = useState(transport.ready())
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const msgsKey = ['web', 'chat-messages', mode]

  const { data: messages = [], isLoading } = useQuery<Msg[]>({
    queryKey: msgsKey,
    queryFn: transport.getMessages,
    enabled: started,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  })

  useEffect(() => {
    const p = takePrefill()
    if (p) setText((t) => t || p)
    inputRef.current?.focus()
  }, [prefill, takePrefill])

  // Прочитано: при открытии и при новых сообщениях оператора
  const lastIncoming = [...messages].reverse().find((m) => m.sender_type !== 'user')?.id
  useEffect(() => {
    if (!started) return
    transport.markRead().catch(() => {})
    qc.setQueryData(['web', 'chat-unread', mode], 0)
  }, [started, lastIncoming, transport, qc, mode])

  useLayoutEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [text])

  const send = useCallback(async () => {
    const trimmed = text.trim()
    if ((!trimmed && files.length === 0) || sending) return
    setSending(true)
    const sentFiles = files
    const optimistic: Msg = {
      id: `opt-${Date.now()}`,
      chat_id: '',
      sender_type: 'user',
      text: trimmed || null,
      attachments: sentFiles.map((f) => URL.createObjectURL(f)),
      created_at: new Date().toISOString(),
      optimistic: true,
    }
    qc.setQueryData<Msg[]>(msgsKey, (prev) => [...(prev ?? []), optimistic])
    setText('')
    setFiles([])
    try {
      let urls: string[] = []
      if (sentFiles.length) {
        const compressed = await Promise.all(sentFiles.map((f) => compressImage(f)))
        urls = await Promise.all(compressed.map((f) => transport.upload(f)))
      }
      await transport.send(trimmed || null, urls)
      setStarted(true)
      await qc.invalidateQueries({ queryKey: msgsKey })
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status
      toast.error(status === 429 ? 'Слишком часто — подождите немного' : 'Не удалось отправить сообщение')
      setText(trimmed)
      setFiles(sentFiles)
      qc.setQueryData<Msg[]>(msgsKey, (prev) => prev?.filter((m) => m.id !== optimistic.id) ?? [])
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, files, sending, transport, qc, mode])

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length + picked.length > MAX_FILES) { toast.error(`Не больше ${MAX_FILES} изображений`); return }
    setFiles((prev) => [...prev, ...picked])
  }

  let prevDay = ''
  const empty = !started || (!isLoading && messages.length === 0)

  return (
    <>
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4" style={{ overscrollBehavior: 'contain' }}>
        {empty ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <p className="text-[15px] font-medium text-[var(--text)]">Здравствуйте!</p>
            <p className="mt-1.5 text-sm text-[var(--hint)] max-w-xs leading-relaxed">
              Вопрос по заказу, игре или оплате — напишите, оператор ответит здесь. Можно приложить скриншоты.
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
        <div className="flex flex-wrap gap-2 px-4 pt-3 border-t border-[var(--border)] shrink-0">
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
        className="flex items-end gap-2 p-3 border-t border-[var(--border)] shrink-0"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
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
          className="flex-1 min-h-[44px] max-h-36 resize-none rounded-xl bg-[var(--bg3)] border border-transparent focus:border-[var(--accent)] outline-none px-4 py-[11px] text-[14px] leading-snug text-[var(--text)] placeholder:text-[var(--hint)] transition-colors"
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
    </>
  )
}

// ── Виджет ───────────────────────────────────────────────────────────────────

function useIsMobile() {
  const q = '(max-width: 767px)'
  const [mobile, setMobile] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setMobile(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return mobile
}

export default function ChatWidget() {
  const { isAuthenticated, ready } = useWebAuth()
  const { open, expanded, openChat, close, toggleExpanded } = useChatWidget()
  const location = useLocation()
  const mobile = useIsMobile()
  const reduce = useReducedMotion()
  const mode: 'user' | 'guest' = isAuthenticated ? 'user' : 'guest'
  const transport = isAuthenticated ? userTransport : guestTransport
  const full = mobile || expanded

  // Непрочитанные — для бейджа на кнопке (только если чат уже есть)
  const { data: unread = 0, error } = useQuery({
    queryKey: ['web', 'chat-unread', mode],
    queryFn: () => transport.getChat().then((c) => c.unread_count ?? 0),
    enabled: ready && transport.ready(),
    refetchInterval: open ? false : 30_000,
    staleTime: 15_000,
    retry: false,
  })
  // Токен гостя устарел/удалён на сервере — начинаем с чистого листа
  useEffect(() => {
    const status = (error as { response?: { status?: number } } | null)?.response?.status
    if (mode === 'guest' && status === 401) clearGuestToken()
  }, [error, mode])

  // Esc закрывает; на телефоне под открытым чатом страница не прокручивается
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    if (full) document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, full, close])

  // На странице игры внизу на телефоне — панель корзины: поднимаем кнопку
  const lift = mobile && location.pathname.startsWith('/game/') ? 84 : 0

  const panelStyle: React.CSSProperties = full
    ? { position: 'fixed', inset: mobile ? 0 : 24, zIndex: 200 }
    : { position: 'fixed', right: 24, bottom: 96, width: 380, height: 'min(600px, calc(100dvh - 128px))', zIndex: 200 }

  const fabRight = mobile ? 16 : 24
  const fabBottom = (mobile ? 16 : 24) + lift
  const greeting = useChatGreeting(open, mobile)

  return (
    <>
      {/* Приветствие оператора — над кнопкой чата (кнопка 56px) */}
      <ChatHint
        show={greeting.card}
        onOpen={openChat}
        onDismiss={greeting.dismiss}
        right={fabRight}
        bottom={`calc(${fabBottom + 56 + 12}px + var(--cookie-h, 0px))`}
        mobile={mobile}
      />
      <AnimatePresence>
        {!(open && full) && (
          <m.button
            key="launcher"
            type="button"
            onClick={() => (open ? close() : openChat())}
            aria-label={open ? 'Закрыть чат' : 'Чат с оператором'}
            title="Чат с оператором"
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="w-14 h-14 rounded-full flex items-center justify-center text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors"
            style={{
              // над плашкой cookie, пока она на экране (--cookie-h ставит CookieBanner)
              position: 'fixed', right: fabRight, bottom: `calc(${fabBottom}px + var(--cookie-h, 0px))`, zIndex: 190,
              boxShadow: '0 8px 24px rgba(37,99,235,0.35), 0 2px 6px rgba(0,0,0,0.4)',
              marginBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            {open ? <X size={24} /> : <MessageCircle size={26} weight="fill" />}
            {!open && (unread > 0 || greeting.badge) && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5">
                {/* «пинг» только для приветствия — непрочитанные и так видны */}
                {unread === 0 && <span className="anim-ping absolute inset-0 rounded-full" style={{ background: '#ef4444' }} />}
                <span
                  className="relative min-w-[20px] h-5 px-1 rounded-full text-[11px] font-semibold text-white flex items-center justify-center"
                  style={{ background: '#ef4444', boxShadow: '0 0 0 2px var(--bg)' }}
                >
                  {unread > 0 ? unread : 1}
                </span>
              </span>
            )}
          </m.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && full && !mobile && (
          <m.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={close}
            style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.55)' }}
          />
        )}
        {open && (
          <m.section
            key="panel"
            role="dialog"
            aria-label="Чат с оператором"
            initial={reduce ? false : { opacity: 0, y: 16, scale: full ? 1 : 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: full ? 1 : 0.96 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className={'flex flex-col overflow-hidden bg-[var(--bg2)] ' + (mobile ? '' : 'rounded-3xl border border-[var(--border)]')}
            style={{
              ...panelStyle,
              transformOrigin: 'bottom right',
              boxShadow: full ? undefined : '0 24px 64px rgba(0,0,0,0.55)',
              paddingTop: mobile ? 'env(safe-area-inset-top, 0px)' : undefined,
            }}
          >
            <div className={'flex items-center gap-3 px-4 h-16 border-b border-[var(--border)] shrink-0 ' + (full && !mobile ? 'max-w-none' : '')}>
              <span className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--accent)] shrink-0">
                <img src={logoMark} alt="" className="w-6 h-6 object-contain" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-[var(--text)] leading-tight">Чат с оператором</p>
                <p className="text-xs text-[var(--hint)] truncate">Отвечаем за несколько минут</p>
              </div>
              {!mobile && (
                <button
                  type="button"
                  onClick={toggleExpanded}
                  aria-label={expanded ? 'Свернуть' : 'Развернуть на весь экран'}
                  title={expanded ? 'Свернуть' : 'Развернуть на весь экран'}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--hint)] hover:text-[var(--text)] hover:bg-[var(--bg3)] transition-colors"
                >
                  {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
              )}
              <button
                type="button"
                onClick={close}
                aria-label="Закрыть чат"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--hint)] hover:text-[var(--text)] hover:bg-[var(--bg3)] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {mode === 'guest' && (
              <div className="px-4 py-2.5 text-xs leading-relaxed text-[var(--text-2)] bg-[var(--bg3)] border-b border-[var(--border)] shrink-0">
                Вы пишете как гость — ответ появится здесь, на этом устройстве.{' '}
                <Link to="/login" state={{ from: location.pathname + location.search }} onClick={close} className="text-[var(--link)] hover:text-[var(--text)] font-medium">
                  Войдите
                </Link>
                , чтобы переписка сохранилась в аккаунте, а через Telegram — приходили уведомления об ответе.
                {' '}Отправляя сообщение, вы соглашаетесь с{' '}
                <a href="/app/legal/privacy.html" target="_blank" rel="noopener noreferrer" className="underline">политикой конфиденциальности</a>.
              </div>
            )}

            <div className={'flex-1 min-h-0 flex flex-col ' + (full && !mobile ? 'w-full max-w-3xl mx-auto' : '')}>
              <ChatThread key={mode} transport={transport} mode={mode} />
            </div>
          </m.section>
        )}
      </AnimatePresence>
    </>
  )
}
