/**
 * src/web/components/QuickTopup.tsx
 * Быстрое пополнение на главной сайта: Telegram Stars, Telegram Premium, Steam.
 * Покупатель вводит получателя и сумму прямо здесь — позиция кладётся в корзину
 * (заменяя прежние позиции этого раздела) и сразу открывается оформление.
 * Варианты приходят с сервера (GET /catalog/home → topup); вкладка без товара не показывается.
 * Если покупатель не вошёл — введённое сохраняется и восстанавливается после входа.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { m } from 'framer-motion'
import toast from 'react-hot-toast'
import { ChevronRight, Crown, Loader2, Star, SteamLogo } from '@/components/ui/icons'
import type { HomeTopup, InputField, Product } from '@/api'
import { useWebAuth } from '@/web/auth/useWebAuth'
import { useWebCart } from '@/web/cart/useWebCart'
import { apiError, money } from '@/web/format'
import { EASE } from '@/web/components/Motion'

const DRAFT_KEY = 'web_topup_draft'

interface Draft {
  kind: HomeTopup['kind']
  productId: string
  amount: string
  fields: Record<string, string>
}

const TABS: Record<HomeTopup['kind'], { label: string; Icon: typeof Star }> = {
  stars: { label: 'Звёзды', Icon: Star },
  premium: { label: 'Premium', Icon: Crown },
  steam: { label: 'Steam', Icon: SteamLogo },
}

// Быстрый выбор суммы: звёзды и валюты Steam
const PRESETS: Record<string, number[]> = {
  stars: [50, 100, 250, 500, 1000, 2500],
  RUB: [100, 300, 500, 1000, 2000, 5000],
  USD: [5, 10, 20, 50, 100, 200],
  KZT: [1000, 2500, 5000, 10000, 20000, 50000],
  UAH: [100, 200, 500, 1000, 2000],
}
const CURRENCY_SIGN: Record<string, string> = { RUB: '₽', USD: '$', KZT: '₸', UAH: '₴' }

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
const starsWord = (n: number) => plural(n, 'звезда', 'звезды', 'звёзд')

const qtyField = (p?: Product) => (p?.input_fields ?? []).find((f) => f.type === 'quantity')
const isTelegram = (kind: HomeTopup['kind']) => kind !== 'steam'

/** «Telegram Premium - 3 месяца» → «3 месяца»; число месяцев — для цены за месяц */
function premiumTerm(name: string) {
  const term = name.replace(/^.*?\s[-–—]\s*/, '').trim() || name
  const months = Number(term.match(/\d+/)?.[0] ?? 0)
  return { term, months }
}

function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    sessionStorage.removeItem(DRAFT_KEY)
    return JSON.parse(raw) as Draft
  } catch {
    return null
  }
}

const inputBox = (err: boolean) =>
  'w-full h-12 bg-[var(--bg3)] border rounded-xl px-4 text-[15px] text-[var(--text)] ' +
  'placeholder:text-[var(--hint)] focus:outline-none focus:border-[var(--accent)] transition-colors ' +
  (err ? 'border-[#f87171]' : 'border-transparent')

export default function QuickTopup({ options }: { options: HomeTopup[] }) {
  const navigate = useNavigate()
  const { user } = useWebAuth()
  const { cart, add, setQty } = useWebCart()

  const [draft] = useState(readDraft)
  const [kind, setKind] = useState<HomeTopup['kind']>(
    () => (draft && options.some((o) => o.kind === draft.kind) ? draft.kind : options[0].kind),
  )
  const opt = options.find((o) => o.kind === kind) ?? options[0]

  const [productId, setProductId] = useState(draft?.productId ?? '')
  const product = opt.products.find((p) => p.id === productId) ?? opt.products[0]
  const qf = qtyField(product)
  const min = Math.max(1, Number(qf?.min ?? 1))
  const currency = kind === 'steam' ? (qf?.unit || 'RUB').toUpperCase() : ''

  // null — ещё не меняли: подставляем сумму по умолчанию
  const [amount, setAmount] = useState<string | null>(draft?.amount ?? null)
  const [fields, setFields] = useState<Record<string, string>>(draft?.fields ?? {})
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  // После входа возвращаем покупателя к блоку с уже введёнными данными
  useEffect(() => {
    if (draft) document.getElementById('topup')?.scrollIntoView({ block: 'center' })
  }, [draft])

  const presets = useMemo(
    () => (PRESETS[kind === 'stars' ? 'stars' : currency] ?? []).filter((v) => v >= min),
    [kind, currency, min],
  )
  // Сумма по умолчанию — второй вариант быстрого выбора (у звёзд — 100)
  const fallbackAmount = String(presets[1] ?? presets[0] ?? min)
  const units = qf ? Math.floor(Number(amount ?? fallbackAmount) || 0) : 1
  const total = Number(product.price) * units

  const switchKind = (k: HomeTopup['kind']) => {
    if (k === kind) return
    setKind(k)
    setProductId('')
    setAmount(null)
    setTouched(false)
  }

  const recipientFields: InputField[] = opt.fields
  const missing = recipientFields.find((f) => f.required && !(fields[f.key] ?? '').replace('@', '').trim())
  const amountError = qf && units < min
    ? `Минимум ${min} ${kind === 'stars' ? starsWord(min) : CURRENCY_SIGN[currency] ?? currency}`
    : null

  async function buy() {
    setTouched(true)
    if (missing || amountError) return
    const data: Record<string, string> = {}
    for (const f of recipientFields) {
      const v = (fields[f.key] ?? '').trim()
      data[f.key] = isTelegram(kind) && f.type === 'text' ? '@' + v.replace(/^@+/, '') : v
    }
    if (!user) {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ kind, productId: product.id, amount: String(units), fields } satisfies Draft))
      } catch { /* приватный режим — просто без восстановления */ }
      navigate('/login', { state: { from: '/' } })
      return
    }
    setBusy(true)
    try {
      // «Купить сейчас»: прежние позиции этого раздела заменяем новой
      const ids = new Set(opt.products.map((p) => p.id))
      for (const item of cart?.items ?? []) {
        if (ids.has(item.product_id)) await setQty(item.id, 0)
      }
      await add(product.id, data, units)
      navigate('/checkout')
    } catch (e) {
      setTouched(false)
      toast.error(apiError(e, 'Не удалось оформить — попробуйте ещё раз'))
    } finally {
      setBusy(false)
    }
  }

  const unitLabel = kind === 'stars' ? starsWord(units) : CURRENCY_SIGN[currency] ?? currency

  const label = 'block text-sm text-[var(--text-2)] mb-1.5 h-5'
  const chip = (active: boolean) =>
    'rounded-lg text-sm num border transition-colors ' +
    (active ? 'border-[var(--accent)] text-[var(--text)] bg-[var(--bg3)]' : 'border-transparent text-[var(--text-2)] bg-[var(--bg3)] hover:text-[var(--text)]')
  const sectionLink = (
    <Link
      to={`/game/${opt.game_slug}/${opt.category_slug}`}
      className="inline-flex items-center gap-1 text-sm text-[var(--hint)] hover:text-[var(--text)] transition-colors"
    >
      Раздел «{opt.category_name}» <ChevronRight size={14} />
    </Link>
  )

  return (
    <div id="topup" className="rounded-2xl bg-[var(--bg2)] p-4 md:p-6 scroll-mt-24">
      {/* Вкладки + ссылка на раздел */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        {options.length > 1 ? (
          <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg)] w-full sm:w-auto" role="tablist" aria-label="Что пополнить">
            {options.map((o) => {
              const { label: tab, Icon } = TABS[o.kind]
              const active = o.kind === kind
              return (
                <button
                  key={o.kind}
                  role="tab"
                  aria-selected={active}
                  onClick={() => switchKind(o.kind)}
                  className={'relative flex-1 sm:flex-none h-10 px-2 sm:px-5 rounded-lg text-sm font-medium transition-colors ' + (active ? 'text-[var(--text)]' : 'text-[var(--hint)] hover:text-[var(--text-2)]')}
                >
                  {active && <m.span layoutId="web-topup-tab" className="absolute inset-0 rounded-lg bg-[var(--bg3)]" transition={{ duration: 0.25, ease: EASE }} />}
                  <span className="relative inline-flex items-center justify-center gap-1.5">
                    <Icon size={16} fill={active && o.kind !== 'steam' ? 'currentColor' : undefined} />
                    {tab}
                  </span>
                </button>
              )
            })}
          </div>
        ) : <span />}
        <span className="hidden sm:block">{sectionLink}</span>
      </div>

      {/* Одна полоса: получатель | сумма или срок | итог и оплата */}
      <div className="grid gap-4 lg:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_minmax(0,0.85fr)] items-start">
        {/* Получатель */}
        <div className="flex flex-col gap-4">
          {recipientFields.map((f) => {
            const err = touched && f.required && !(fields[f.key] ?? '').replace('@', '').trim()
            const tg = isTelegram(kind) && f.type === 'text'
            return (
              <div key={f.key}>
                <label htmlFor={`topup-${f.key}`} className={label}>{tg ? 'Кому отправить' : f.label}</label>
                <div className="relative">
                  {tg && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-[var(--hint)] pointer-events-none">@</span>}
                  <input
                    id={`topup-${f.key}`}
                    value={fields[f.key] ?? ''}
                    onChange={(e) => setFields((p) => ({ ...p, [f.key]: tg ? e.target.value.replace(/^@+/, '').replace(/\s/g, '') : e.target.value }))}
                    placeholder={tg ? 'username в Telegram' : f.placeholder || f.label}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={err || undefined}
                    className={inputBox(!!err) + (tg ? ' pl-8' : '')}
                  />
                </div>
                {err && <p className="mt-1.5 text-xs text-[#f87171]">{tg ? 'Укажите username получателя' : `Укажите: ${f.label}`}</p>}
              </div>
            )
          })}
        </div>

        {/* Premium — срок подписки */}
        {kind === 'premium' && (
          <fieldset className="min-w-0">
            <legend className={label}>Срок подписки</legend>
            <div className="grid grid-cols-3 gap-2">
              {opt.products.map((p) => {
                const { term, months } = premiumTerm(p.name)
                const active = p.id === product.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProductId(p.id)}
                    aria-pressed={active}
                    className={'rounded-xl px-3 py-2.5 text-left border transition-colors ' + (active ? 'border-[var(--accent)] bg-[var(--bg3)]' : 'border-transparent bg-[var(--bg3)] hover:border-[var(--border)]')}
                  >
                    <span className="block text-[15px] font-medium text-[var(--text)]">{term}</span>
                    <span className="block mt-0.5 text-sm font-semibold text-[var(--text)] num">{money(p.price)}</span>
                    {months > 1 && <span className="block text-xs text-[var(--hint)] num">{money(Math.round(Number(p.price) / months))} в месяц</span>}
                  </button>
                )
              })}
            </div>
          </fieldset>
        )}

        {/* Количество звёзд / сумма Steam */}
        {qf && (
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3 mb-1.5 h-5">
              <label htmlFor="topup-amount" className="text-sm text-[var(--text-2)]">
                {kind === 'stars' ? 'Количество звёзд' : 'Сумма пополнения'}
              </label>
              {/* Steam — валюта аккаунта, если заведено несколько */}
              {kind === 'steam' && opt.products.length > 1 && (
                <div className="flex gap-1" aria-label="Валюта аккаунта Steam">
                  {opt.products.map((p) => {
                    const cur = (qtyField(p)?.unit || '').toUpperCase()
                    const active = p.id === product.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setProductId(p.id); setAmount(null) }}
                        aria-pressed={active}
                        className={'h-6 px-2 text-xs ' + chip(active)}
                      >
                        {cur || p.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className={'flex items-center h-12 rounded-xl bg-[var(--bg3)] border px-4 transition-colors focus-within:border-[var(--accent)] ' + (touched && amountError ? 'border-[#f87171]' : 'border-transparent')}>
              <input
                id="topup-amount"
                type="text"
                inputMode="numeric"
                maxLength={7}
                value={amount ?? fallbackAmount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                className="input-display flex-1 min-w-0 bg-transparent outline-none font-display num text-[1.375rem] text-[var(--text)]"
              />
              <span className="text-[15px] text-[var(--text-2)] shrink-0">{unitLabel}</span>
            </div>
            {touched && amountError && <p className="mt-1.5 text-xs text-[#f87171]">{amountError}</p>}
            {presets.length > 0 && (
              <div className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {presets.map((v) => (
                  <button key={v} type="button" onClick={() => setAmount(String(v))} aria-pressed={units === v} className={'h-9 px-1 ' + chip(units === v)}>
                    {v.toLocaleString('ru')}{kind === 'steam' ? ' ' + (CURRENCY_SIGN[currency] ?? currency) : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Итог и покупка */}
        <div className="min-w-0 pt-4 border-t border-[var(--border)] lg:pt-0 lg:border-t-0">
          <div className="flex items-center justify-between gap-3 mb-1.5 h-5">
            <span className="text-sm text-[var(--text-2)]">К оплате</span>
            {qf && (
              <span className="text-xs text-[var(--hint)] num">
                {kind === 'stars' ? `1 звезда — ${money(product.price)}` : `1 ${CURRENCY_SIGN[currency] ?? currency} — ${money(product.price)}`}
              </span>
            )}
          </div>
          <div className="h-12 flex items-center">
            <span className="text-[1.75rem] leading-none font-semibold tracking-tight num text-[var(--text)]">{money(Math.round(total * 100) / 100)}</span>
          </div>
          <button
            type="button"
            onClick={buy}
            disabled={busy || product.is_out_of_stock}
            className="mt-2 w-full h-11 rounded-xl text-[15px] font-semibold text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 size={18} className="animate-spin" />}
            {product.is_out_of_stock ? 'Временно нет в наличии' : user ? 'Перейти к оплате' : 'Войти и оплатить'}
          </button>
          <div className="sm:hidden mt-3 flex justify-center">{sectionLink}</div>
        </div>
      </div>
    </div>
  )
}
