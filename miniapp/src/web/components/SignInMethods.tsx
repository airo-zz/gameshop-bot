/**
 * src/web/components/SignInMethods.tsx
 * Профиль → «Способы входа»: почта и Telegram.
 *   • привязать недостающий / сменить почту (код из письма);
 *   • если способ уже у другого аккаунта — диалог «Объединить?» (сервер
 *     выдаёт ticket, POST /profile/merge переносит заказы, баланс, чат);
 *   • отвязать — только если остаётся второй способ входа.
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Mail, Send } from '@/components/ui/icons'
import { profileApi, type LinkResult } from '@/api'
import { getAuthMethods, setTokens, type TelegramWidgetUser } from '@/api/client'
import { useWebAuth } from '@/web/auth/useWebAuth'
import { money } from '@/web/format'
import EmailCodeForm from '@/web/components/EmailCodeForm'
import TelegramLoginButton from '@/web/components/TelegramLoginButton'

type Offer = { ticket: string; other: NonNullable<LinkResult['other']> }

const errText = (e: unknown, fallback: string) => {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === 'string' ? d : fallback
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

function MergeDialog({ offer, onDone, onCancel }: { offer: Offer; onDone: () => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false)
  const o = offer.other
  const merge = async () => {
    setBusy(true)
    try {
      const t = await profileApi.merge(offer.ticket)
      setTokens(t.access_token, t.refresh_token)
      onDone()
    } catch (e) {
      toast.error(errText(e, 'Не удалось объединить аккаунты'))
      setBusy(false)
    }
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      className="flex items-center justify-center p-4"
      style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.6)' }}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl bg-[var(--bg2)] border border-[var(--border)] p-6">
        <h2 className="text-lg text-[var(--text)]" style={{ margin: 0 }}>Найден другой ваш аккаунт</h2>
        <div className="mt-4 rounded-2xl bg-[var(--bg3)] p-4 text-sm space-y-1.5">
          <p className="text-[var(--text)] font-medium">{o.name}</p>
          {o.email && <p className="text-[var(--hint)]">{o.email}</p>}
          <p className="text-[var(--text-2)] num">
            {o.orders_count} {plural(o.orders_count, 'заказ', 'заказа', 'заказов')} · баланс {money(o.balance)}
            {o.has_telegram ? ' · Telegram' : ''}
          </p>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-[var(--text-2)]">
          Объединим его с текущим: заказы, баланс, кэшбэк и переписка с оператором окажутся в одном аккаунте,
          войти можно будет и по почте, и через Telegram. Отменить объединение нельзя.
        </p>
        <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button type="button" onClick={onCancel} disabled={busy}
            className="h-11 px-5 rounded-xl text-sm text-[var(--text-2)] bg-[var(--bg3)] hover:text-[var(--text)] transition-colors">
            Отмена
          </button>
          <button type="button" onClick={merge} disabled={busy}
            className="h-11 px-5 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] disabled:opacity-50 transition-colors">
            {busy ? 'Объединяем…' : 'Объединить'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SignInMethods() {
  const { user, refresh } = useWebAuth()
  const qc = useQueryClient()
  const [open, setOpen] = useState<'email' | 'telegram' | null>(null)
  const [offer, setOffer] = useState<Offer | null>(null)
  const { data: methods } = useQuery({
    queryKey: ['web', 'auth-methods'],
    queryFn: getAuthMethods,
    staleTime: 10 * 60_000,
  })
  if (!user) return null
  const canEmail = !!methods?.email

  const handleResult = async (r: LinkResult, okText: string) => {
    if (r.status === 'merge_required' && r.ticket && r.other) {
      setOffer({ ticket: r.ticket, other: r.other })
      return
    }
    if (r.access_token && r.refresh_token) setTokens(r.access_token, r.refresh_token)
    await refresh()
    setOpen(null)
    toast.success(okText)
  }

  const verifyEmail = async (email: string, code: string) => {
    const r = await profileApi.verifyEmailLink(email, code)
    await handleResult(r, user.email ? 'Почта изменена' : 'Почта привязана')
  }

  const linkTelegram = async (tg: TelegramWidgetUser) => {
    try {
      await handleResult(await profileApi.linkTelegram(tg), 'Telegram привязан')
    } catch (e) {
      toast.error(errText(e, 'Не удалось привязать Telegram'))
    }
  }

  const merged = async () => {
    setOffer(null)
    setOpen(null)
    await qc.invalidateQueries()
    await refresh()
    toast.success('Аккаунты объединены')
  }

  const unlinkEmail = async () => {
    if (!window.confirm('Отвязать почту? Входить можно будет только через Telegram.')) return
    try {
      await profileApi.unlinkEmail()
      await refresh()
      toast.success('Почта отвязана')
    } catch (e) {
      toast.error(errText(e, 'Не удалось отвязать почту'))
    }
  }

  const unlinkTelegram = async () => {
    if (!window.confirm('Отвязать Telegram? Входить можно будет только по почте, а в Telegram-боте у вас будет отдельный аккаунт.')) return
    try {
      const t = await profileApi.unlinkTelegram()
      setTokens(t.access_token, t.refresh_token)
      await refresh()
      toast.success('Telegram отвязан')
    } catch (e) {
      toast.error(errText(e, 'Не удалось отвязать Telegram'))
    }
  }

  const row = 'flex items-center gap-3 px-5 py-4'
  const action = 'text-sm font-medium text-[var(--link)] hover:text-[var(--text)] transition-colors'
  const muted = 'text-sm text-[var(--hint)] hover:text-[var(--text)] transition-colors'

  return (
    <div className="rounded-2xl bg-[var(--bg2)] overflow-hidden">
      <p className="px-5 pt-4 text-xs text-[var(--hint)]">Способы входа</p>

      {/* Почта */}
      <div className={row}>
        <Mail size={22} className="text-[var(--hint)]" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-[var(--text)]">Почта</span>
          <span className="block text-xs text-[var(--hint)] mt-0.5 truncate">{user.email ?? 'Не привязана'}</span>
        </span>
        {canEmail && open !== 'email' && (
          <span className="flex items-center gap-3">
            {user.email && user.has_telegram && <button onClick={unlinkEmail} className={muted}>Отвязать</button>}
            <button onClick={() => setOpen('email')} className={action}>{user.email ? 'Изменить' : 'Привязать'}</button>
          </span>
        )}
      </div>
      {open === 'email' && (
        <div className="px-5 pb-5">
          <EmailCodeForm
            onRequest={profileApi.requestEmailLink}
            onVerify={verifyEmail}
            submitLabel={user.email ? 'Сменить почту' : 'Привязать почту'}
          />
          <button onClick={() => setOpen(null)} className={muted + ' mt-3'}>Отмена</button>
        </div>
      )}

      {/* Telegram */}
      <div className={row + ' border-t border-[var(--border)]'}>
        <Send size={22} className="text-[var(--hint)]" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-[var(--text)]">Telegram</span>
          <span className="block text-xs text-[var(--hint)] mt-0.5 truncate">
            {user.has_telegram ? (user.username ? `@${user.username}` : 'Подключён') : 'Не привязан'}
          </span>
        </span>
        {open !== 'telegram' && (
          user.has_telegram
            ? (user.email && <button onClick={unlinkTelegram} className={muted}>Отвязать</button>)
            : <button onClick={() => setOpen('telegram')} className={action}>Привязать</button>
        )}
      </div>
      {!user.has_telegram && open !== 'telegram' && (
        <p className="px-5 pb-4 -mt-1 text-xs leading-relaxed text-[var(--hint)]">
          Покупали в нашем Telegram-боте? Привяжите Telegram — заказы, баланс и кэшбэк объединятся.
        </p>
      )}
      {open === 'telegram' && (
        <div className="px-5 pb-5">
          <p className="text-xs text-[var(--hint)] mb-3">
            Заказы, баланс и кэшбэк станут общими с Telegram-ботом магазина.
          </p>
          <TelegramLoginButton onAuth={linkTelegram} size="medium" />
          <div><button onClick={() => setOpen(null)} className={muted + ' mt-3'}>Отмена</button></div>
        </div>
      )}

      {/* Рассылка — только если есть почта */}
      {user.email && (
        <label className={row + ' border-t border-[var(--border)] cursor-pointer'}>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-[var(--text)]">Письма об акциях и скидках</span>
            <span className="block text-xs text-[var(--hint)] mt-0.5">Коды для входа приходят всегда</span>
          </span>
          <input
            type="checkbox"
            checked={user.marketing_consent}
            onChange={async (e) => {
              const v = e.target.checked
              try {
                await profileApi.setMarketing(v)
                await refresh()
                toast.success(v ? 'Подписка включена' : 'Вы отписались от рассылки')
              } catch {
                toast.error('Не удалось сохранить')
              }
            }}
            className="w-5 h-5 accent-[var(--accent)] cursor-pointer"
          />
        </label>
      )}

      {offer && <MergeDialog offer={offer} onDone={merged} onCancel={() => setOffer(null)} />}
    </div>
  )
}
