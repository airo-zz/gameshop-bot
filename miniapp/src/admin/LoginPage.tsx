/**
 * src/admin/LoginPage.tsx — вход в админку admin.redonate.gg.
 *
 *  • «Через Telegram»: запрос входа → ссылка/QR на бот поддержки → сотрудник жмёт
 *    «Подтвердить вход» → страница сама входит (опрос статуса раз в 2 с);
 *  • «По почте»: почта + пароль → код из письма (резерв, если Telegram недоступен).
 * После входа — полная перезагрузка на ?next (только пути админки).
 */

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import QRCode from 'react-qr-code'
import { apiClient } from '@/api/client'
import { Loader2, Mail, Send } from '@/components/ui/icons'
import logoFull from '@/assets/logo-full.png'

type Tab = 'telegram' | 'email'

const errText = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback

function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/admin') && !raw.startsWith('//') ? raw : '/admin'
}

const input =
  'w-full h-12 rounded-xl bg-[var(--bg3)] px-4 text-[15px] text-[var(--text)] placeholder:text-[var(--hint)] outline-none focus:shadow-[inset_0_0_0_1px_var(--border-accent)]'
const primary =
  'w-full h-12 rounded-xl bg-[var(--btn)] hover:bg-[var(--btn-hover)] text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50'

// ── Через Telegram ───────────────────────────────────────────────────────────

function TelegramLogin({ onDone }: { onDone: () => void }) {
  const [req, setReq] = useState<{ nonce: string; bot_url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [left, setLeft] = useState(0)
  const timer = useRef<number>()
  // onDone — в ref: таймер обратного отсчёта перерисовывает компонент каждую секунду,
  // опрос статуса не должен из-за этого перезапускаться
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  async function start() {
    setBusy(true)
    setError('')
    try {
      const r = (await apiClient.post<{ nonce: string; bot_url: string; expires_in: number }>('/admin/auth/tg-request')).data
      setReq(r)
      setLeft(r.expires_in)
    } catch (e) {
      setError(errText(e, 'Не удалось начать вход'))
    } finally {
      setBusy(false)
    }
  }

  // Ждём подтверждения в боте
  useEffect(() => {
    if (!req) return
    let stop = false
    const poll = async () => {
      if (stop) return
      try {
        const r = (await apiClient.get<{ status: string }>(`/admin/auth/tg-request/${req.nonce}`)).data
        if (r.status === 'approved') return doneRef.current()
      } catch (e) {
        setReq(null)
        setError(errText(e, 'Запрос входа устарел — начните заново'))
        return
      }
      timer.current = window.setTimeout(poll, 2000)
    }
    timer.current = window.setTimeout(poll, 2000)
    const tick = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000)
    return () => { stop = true; window.clearTimeout(timer.current); window.clearInterval(tick) }
  }, [req])

  if (!req) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-2)] leading-relaxed">
          Бот поддержки пришлёт запрос — подтвердите вход одной кнопкой. Пароль не нужен.
        </p>
        {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
        <button type="button" onClick={start} disabled={busy} className={primary}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          Войти через Telegram
        </button>
      </div>
    )
  }

  const mm = String(Math.floor(left / 60)).padStart(1, '0')
  const ss = String(left % 60).padStart(2, '0')
  return (
    <div className="space-y-5">
      <a href={req.bot_url} target="_blank" rel="noopener noreferrer" className={primary}>
        <Send size={18} /> Открыть бот поддержки
      </a>
      <div className="hidden md:flex items-center gap-4 rounded-2xl bg-[var(--bg3)] p-4">
        <div className="bg-white p-2 rounded-lg shrink-0">
          <QRCode value={req.bot_url} size={112} />
        </div>
        <p className="text-sm text-[var(--text-2)] leading-relaxed">
          Или отсканируйте код камерой телефона — откроется бот, нажмите «Подтвердить вход».
        </p>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-[var(--hint)]">
          <Loader2 size={16} className="animate-spin" /> Ждём подтверждения…
        </span>
        <span className="num text-[var(--hint)]">{mm}:{ss}</span>
      </div>
      <button type="button" onClick={() => setReq(null)} className="text-sm text-[var(--hint)] hover:text-[var(--text)] transition-colors">
        Отменить
      </button>
    </div>
  )
}

// ── По почте ─────────────────────────────────────────────────────────────────

function EmailLogin({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<'password' | 'code'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await apiClient.post('/admin/auth/email/start', { email, password })
      setStep('code')
    } catch (err) {
      setError(errText(err, 'Не удалось войти'))
    } finally {
      setBusy(false)
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await apiClient.post('/admin/auth/email/verify', { email, code })
      onDone()
    } catch (err) {
      setError(errText(err, 'Неверный код'))
      setBusy(false)
    }
  }

  if (step === 'code') {
    return (
      <form onSubmit={submitCode} className="space-y-3">
        <p className="text-sm text-[var(--text-2)]">Код отправлен на <span className="text-[var(--text)]">{email}</span></p>
        <input
          className={input + ' num tracking-[0.3em] text-center text-lg'}
          inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000"
        />
        {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
        <button type="submit" disabled={busy || code.length < 6} className={primary}>
          {busy && <Loader2 size={18} className="animate-spin" />} Войти
        </button>
        <button type="button" onClick={() => { setStep('password'); setCode(''); setError('') }}
                className="text-sm text-[var(--hint)] hover:text-[var(--text)] transition-colors">
          Назад
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={submitPassword} className="space-y-3">
      <input className={input} type="email" autoComplete="username" placeholder="Почта" value={email}
             onChange={(e) => setEmail(e.target.value)} required />
      <input className={input} type="password" autoComplete="current-password" placeholder="Пароль" value={password}
             onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
      <button type="submit" disabled={busy || !email || !password} className={primary}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />} Получить код на почту
      </button>
      <p className="text-xs text-[var(--hint)] leading-relaxed">
        Почту и пароль сотрудник задаёт сам в админке, в разделе «Безопасность». Это запасной вход — если Telegram недоступен.
      </p>
    </form>
  )
}

// ── Страница ─────────────────────────────────────────────────────────────────

export default function AdminLoginPage() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>('telegram')
  const done = () => window.location.replace(safeNext(params.get('next')))

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--bg)]">
      <div className="w-full max-w-sm">
        <img src={logoFull} alt="reDonate" className="h-7 w-auto mx-auto mb-8" />
        <div className="rounded-3xl bg-[var(--bg2)] p-6">
          <h1 className="text-xl text-[var(--text)] text-center" style={{ margin: 0 }}>Вход в админку</h1>
          <div className="mt-5 mb-5 grid grid-cols-2 gap-1 rounded-xl bg-[var(--bg3)] p-1">
            {([['telegram', 'Через Telegram'], ['email', 'По почте']] as const).map(([t, l]) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                      className={'h-9 rounded-lg text-sm font-medium transition-colors ' +
                        (tab === t ? 'bg-[var(--bg2)] text-[var(--text)]' : 'text-[var(--hint)] hover:text-[var(--text-2)]')}>
                {l}
              </button>
            ))}
          </div>
          {tab === 'telegram' ? <TelegramLogin onDone={done} /> : <EmailLogin onDone={done} />}
        </div>
      </div>
    </div>
  )
}
