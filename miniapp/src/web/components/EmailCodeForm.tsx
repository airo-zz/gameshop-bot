/**
 * src/web/components/EmailCodeForm.tsx
 * Два шага: адрес почты → 6-значный код из письма. Используется для входа
 * (WebLoginPage) и для привязки почты в профиле.
 */
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from '@/components/ui/icons'

function errText(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}

const RESEND_SEC = 60

export default function EmailCodeForm({
  onRequest,
  onVerify,
  submitLabel = 'Войти',
}: {
  onRequest: (email: string) => Promise<void>
  onVerify: (email: string, code: string) => Promise<void>
  submitLabel?: string
}) {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (wait <= 0) return
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => window.clearTimeout(t)
  }, [wait])

  useEffect(() => { if (step === 'code') codeRef.current?.focus() }, [step])

  const request = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onRequest(email.trim())
      setStep('code')
      setCode('')
      setWait(RESEND_SEC)
    } catch (e) {
      setError(errText(e, 'Не удалось отправить код. Попробуйте позже'))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (value = code) => {
    if (busy || value.length !== 6) return
    setBusy(true)
    setError(null)
    try {
      await onVerify(email.trim(), value)
    } catch (e) {
      setError(errText(e, 'Не удалось проверить код'))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const input =
    'w-full h-12 rounded-xl bg-[var(--bg3)] border border-transparent focus:border-[var(--accent)] outline-none px-4 text-[15px] text-[var(--text)] placeholder:text-[var(--hint)] transition-colors'
  const button =
    'w-full h-12 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors disabled:opacity-50'

  if (step === 'email') {
    return (
      <form onSubmit={(e) => { e.preventDefault(); request() }} className="flex flex-col gap-3 text-left">
        <label htmlFor="login-email" className="text-sm text-[var(--hint)]">Почта</label>
        <input
          id="login-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          className={input}
        />
        {error && <p className="text-sm text-[#f87171]">{error}</p>}
        <button type="submit" disabled={busy || !email.trim()} className={button}>
          {busy ? 'Отправляем…' : 'Получить код'}
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); verify() }} className="flex flex-col gap-3 text-left">
      <button
        type="button"
        onClick={() => { setStep('email'); setError(null) }}
        className="self-start inline-flex items-center gap-1.5 text-sm text-[var(--hint)] hover:text-[var(--text)] transition-colors"
      >
        <ArrowLeft size={16} /> {email}
      </button>
      <label htmlFor="login-code" className="text-sm text-[var(--text-2)]">
        Мы отправили код на почту. Если письма нет — проверьте «Спам».
      </label>
      <input
        id="login-code"
        ref={codeRef}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 6)
          setCode(v)
          if (v.length === 6) verify(v)
        }}
        placeholder="000000"
        className={input + ' text-center text-2xl tracking-[0.4em] tnum'}
      />
      {error && <p className="text-sm text-[#f87171]">{error}</p>}
      <button type="submit" disabled={busy || code.length !== 6} className={button}>
        {busy ? 'Проверяем…' : submitLabel}
      </button>
      <button
        type="button"
        onClick={request}
        disabled={wait > 0 || busy}
        className="text-sm text-[var(--link)] hover:text-[var(--text)] disabled:text-[var(--hint)] transition-colors"
      >
        {wait > 0 ? `Отправить код повторно через ${wait} с` : 'Отправить код повторно'}
      </button>
    </form>
  )
}
