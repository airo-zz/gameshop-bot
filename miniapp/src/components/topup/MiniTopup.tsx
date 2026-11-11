/**
 * src/components/topup/MiniTopup.tsx
 * Быстрое пополнение на главной мини-аппа — то же, что на сайте (web/components/QuickTopup.tsx),
 * но в мобильной компоновке: вкладки сверху, поля друг под другом, итог и оплата внизу.
 * Варианты — GET /catalog/home → topup. Позиция кладётся в корзину (заменяя прежние
 * позиции этого раздела) и сразу открывается оформление.
 * Получатель Stars/Premium по умолчанию — свой Telegram (initData), кнопка «Себе» возвращает его.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Crown, Gamepad2, Loader2, Star, SteamLogo } from '@/components/ui/icons'
import { cartApi, type HomeTopup, type InputField } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'
import { useDragScroll } from '@/hooks/useDragScroll'
import { useCartStore } from '@/store'
import { normalizeImageUrl } from '@/utils/imageUrl'
import { fmtNum, fmtPrice } from '@/utils/format'
import {
  CURRENCY_SIGN, PRESETS, isTelegram, ownUsername, premiumTerm, qtyField, regionLabels, starsWord, tabKey,
} from '@/components/topup/topup'

const TABS: Partial<Record<HomeTopup['kind'], { label: string; Icon: typeof Star }>> = {
  stars: { label: 'Звёзды', Icon: Star },
  premium: { label: 'Premium', Icon: Crown },
  steam: { label: 'Steam', Icon: SteamLogo },
}

const ERR = '#f87171'

// Плитка выбора (номинал, срок, регион, быстрая сумма): активная — обводка акцентом
const tile = (active: boolean, extra?: React.CSSProperties): React.CSSProperties => ({
  borderRadius: 'var(--r-control)',
  background: 'var(--bg3)',
  border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
  color: active ? 'var(--text)' : 'var(--text-2)',
  cursor: 'pointer',
  transition: 'border-color 0.15s ease, color 0.15s ease',
  ...extra,
})

const caption: React.CSSProperties = { display: 'block', fontSize: 13, color: 'var(--text-2)', margin: '0 0 6px' }

export default function MiniTopup({ options }: { options: HomeTopup[] }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user, haptic } = useTelegram()
  const { setItemsCount } = useCartStore()
  const tabsRef = useDragScroll<HTMLDivElement>()
  const myUsername = ownUsername(user?.username)

  const [tab, setTab] = useState(() => tabKey(options[0]))
  const opt = options.find((o) => tabKey(o) === tab) ?? options[0]
  const kind = opt.kind

  const [productId, setProductId] = useState('')
  const [regionId, setRegionId] = useState('')
  const regions = opt.regions ?? []
  const regionNames = regionLabels(regions.map((r) => r.category_name), opt.game_name)
  const region = regions.find((r) => r.category_id === regionId)
    ?? regions.find((r) => r.category_id === opt.products.find((p) => p.id === productId)?.category_id)
    ?? regions[0]
  const shown = region ? opt.products.filter((p) => p.category_id === region.category_id) : opt.products
  const product = shown.find((p) => p.id === productId) ?? shown.find((p) => !p.is_out_of_stock) ?? shown[0]
  const qf = qtyField(product)
  const min = Math.max(1, Number(qf?.min ?? 1))
  const currency = kind === 'steam' ? (qf?.unit || 'RUB').toUpperCase() : ''
  const sign = CURRENCY_SIGN[currency] ?? currency

  const [amount, setAmount] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  const presets = useMemo(
    () => (PRESETS[kind === 'stars' ? 'stars' : currency] ?? []).filter((v) => v >= min),
    [kind, currency, min],
  )
  const fallbackAmount = String(presets[1] ?? presets[0] ?? min)
  const units = qf ? Math.floor(Number(amount ?? fallbackAmount) || 0) : 1
  const total = Math.round(Number(product.price) * units * 100) / 100

  const isTgField = (f: InputField) => isTelegram(kind) && f.type === 'text'
  // Пока поле не трогали — получатель свой Telegram
  const valueOf = (f: InputField) => fields[f.key] ?? (isTgField(f) ? myUsername : '')
  const recipientFields: InputField[] = opt.fields
  const missing = recipientFields.find((f) => f.required && !valueOf(f).replace('@', '').trim())
  const amountError = qf && units < min
    ? `Минимум ${fmtNum(min)} ${kind === 'stars' ? starsWord(min) : sign}`
    : null

  const switchTab = (k: string) => {
    if (k === tab) return
    haptic.select()
    setTab(k)
    setProductId('')
    setRegionId('')
    setAmount(null)
    setTouched(false)
  }

  async function buy() {
    setTouched(true)
    if (missing || amountError) { haptic.error(); return }
    const data: Record<string, string> = {}
    for (const f of recipientFields) {
      const v = valueOf(f).trim()
      data[f.key] = isTgField(f) ? '@' + v.replace(/^@+/, '') : v
    }
    setBusy(true)
    haptic.impact('light')
    try {
      // «Купить сейчас»: прежние позиции этого раздела заменяем новой
      const cart = await qc.fetchQuery({ queryKey: ['cart'], queryFn: cartApi.get, staleTime: 0 })
      const ids = new Set(opt.products.map((p) => p.id))
      for (const item of cart.items ?? []) {
        if (ids.has(item.product_id)) await cartApi.updateItem(item.id, 0)
      }
      await cartApi.addItem({ product_id: product.id, quantity: units, input_data: data })
      const fresh = await qc.fetchQuery({ queryKey: ['cart'], queryFn: cartApi.get, staleTime: 0 })
      setItemsCount(fresh.items_count)
      await import('@/pages/CheckoutPage')
      navigate('/checkout')
    } catch (e: any) {
      setTouched(false)
      haptic.error()
      toast.error(e?.response?.data?.detail ?? 'Не удалось оформить — попробуйте ещё раз')
    } finally {
      setBusy(false)
    }
  }

  const unitLabel = kind === 'stars' ? starsWord(units) : sign
  const outOfStock = !!product.is_out_of_stock

  return (
    <section style={{ background: 'var(--bg2)', borderRadius: 'var(--r-card)', padding: 14 }}>
      <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: 16, color: 'var(--text)' }}>Быстрое пополнение</p>

      {/* Вкладки: листаются по горизонтали, если сервисов много */}
      {options.length > 1 && (
        <div
          ref={tabsRef}
          role="tablist"
          aria-label="Что пополнить"
          style={{
            display: 'flex', gap: 4, padding: 4, marginBottom: 14, borderRadius: 'var(--r-control)',
            background: 'var(--bg)', overflowX: 'auto', scrollbarWidth: 'none',
          } as React.CSSProperties}
        >
          {options.map((o) => {
            const key = tabKey(o)
            const t = TABS[o.kind]
            const active = key === tab
            const img = !t && o.game_image_url ? normalizeImageUrl(o.game_image_url) ?? o.game_image_url : null
            return (
              <button
                key={key}
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(key)}
                style={{
                  position: 'relative', flexShrink: 0, height: 36, padding: '0 12px', borderRadius: 8,
                  border: 'none', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  fontSize: 14, fontWeight: 500, color: active ? 'var(--text)' : 'var(--hint)',
                  transition: 'color 0.15s ease',
                }}
              >
                {active && (
                  <motion.span
                    layoutId="mini-topup-tab"
                    style={{ position: 'absolute', inset: 0, borderRadius: 8, background: 'var(--bg3)' }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  />
                )}
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {t ? <t.Icon size={16} fill={active && o.kind !== 'steam' ? 'currentColor' : undefined} />
                    : img ? <img src={img} alt="" width={16} height={16} style={{ width: 16, height: 16, borderRadius: 4, objectFit: 'cover' }} />
                    : <Gamepad2 size={16} />}
                  {t?.label ?? o.game_name}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Коды сервиса — регион аккаунта */}
        {kind === 'codes' && regions.length > 1 && (
          <div>
            <span style={caption}>Регион аккаунта</span>
            <div
              style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', margin: '0 -14px', padding: '0 14px' } as React.CSSProperties}
            >
              {regions.map((r, ri) => {
                const active = r.category_id === region?.category_id
                return (
                  <button
                    key={r.category_id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => { haptic.select(); setRegionId(r.category_id); setProductId('') }}
                    style={tile(active, { flexShrink: 0, height: 36, padding: '0 12px', fontSize: 14, whiteSpace: 'nowrap' })}
                  >
                    {regionNames[ri]}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Получатель */}
        {recipientFields.map((f) => {
          const value = valueOf(f)
          const err = touched && f.required && !value.replace('@', '').trim()
          const tg = isTgField(f)
          return (
            <div key={f.key}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <label htmlFor={`mini-topup-${f.key}`} style={caption}>{tg ? 'Кому отправить' : f.label}</label>
                {tg && myUsername && value !== myUsername && (
                  <button
                    type="button"
                    onClick={() => setFields((p) => ({ ...p, [f.key]: myUsername }))}
                    style={{ margin: '0 0 6px', padding: 0, border: 'none', background: 'none', fontSize: 13, color: 'var(--link)', cursor: 'pointer' }}
                  >
                    Себе
                  </button>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                {tg && (
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--hint)', pointerEvents: 'none' }}>@</span>
                )}
                <input
                  id={`mini-topup-${f.key}`}
                  value={value}
                  onChange={(e) => setFields((p) => ({ ...p, [f.key]: tg ? e.target.value.replace(/^@+/, '').replace(/\s/g, '') : e.target.value }))}
                  placeholder={tg ? 'username в Telegram' : f.placeholder || f.label}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-invalid={err || undefined}
                  className="input"
                  style={{ height: 46, paddingTop: 0, paddingBottom: 0, ...(tg ? { paddingLeft: 32 } : {}), ...(err ? { borderColor: ERR } : {}) }}
                />
              </div>
              {err && <p style={{ margin: '6px 0 0', fontSize: 12, color: ERR }}>{tg ? 'Укажите username получателя' : `Укажите: ${f.label}`}</p>}
            </div>
          )
        })}

        {/* Коды сервиса — номинал */}
        {kind === 'codes' && (
          <div>
            <span style={caption}>Номинал карты</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
              {shown.map((p) => {
                const active = p.id === product.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={p.is_out_of_stock}
                    aria-pressed={active}
                    onClick={() => { haptic.select(); setProductId(p.id) }}
                    style={tile(active, { padding: '9px 10px', textAlign: 'left', opacity: p.is_out_of_stock ? 0.4 : 1 })}
                  >
                    <span className="num" style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    <span className="num" style={{ display: 'block', marginTop: 2, fontSize: 12, color: 'var(--text-2)' }}>
                      {p.is_out_of_stock ? 'нет в наличии' : `${fmtPrice(p.price)} ₽`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Premium — срок подписки */}
        {kind === 'premium' && (
          <div>
            <span style={caption}>Срок подписки</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
              {opt.products.map((p) => {
                const { term, months } = premiumTerm(p.name)
                const active = p.id === product.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => { haptic.select(); setProductId(p.id) }}
                    style={tile(active, { padding: '9px 10px', textAlign: 'left' })}
                  >
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{term}</span>
                    <span className="num" style={{ display: 'block', marginTop: 2, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fmtPrice(p.price)} ₽</span>
                    {months > 1 && (
                      <span className="num" style={{ display: 'block', fontSize: 11, color: 'var(--hint)' }}>
                        {fmtNum(Math.round(Number(p.price) / months))} ₽/мес
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Количество звёзд / сумма Steam */}
        {qf && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <label htmlFor="mini-topup-amount" style={caption}>{kind === 'stars' ? 'Количество звёзд' : 'Сумма пополнения'}</label>
              {/* Steam — валюта аккаунта, если заведено несколько */}
              {kind === 'steam' && opt.products.length > 1 && (
                <div style={{ display: 'flex', gap: 4, marginBottom: 6 }} aria-label="Валюта аккаунта Steam">
                  {opt.products.map((p) => {
                    const cur = (qtyField(p)?.unit || '').toUpperCase()
                    const active = p.id === product.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => { setProductId(p.id); setAmount(null) }}
                        style={tile(active, { height: 26, padding: '0 8px', fontSize: 12 })}
                      >
                        {cur || p.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div
              style={{
                display: 'flex', alignItems: 'center', height: 54, padding: '0 14px',
                borderRadius: 'var(--r-control)', background: 'var(--bg3)',
                border: `1px solid ${touched && amountError ? ERR : 'transparent'}`,
              }}
            >
              <input
                id="mini-topup-amount"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={7}
                value={amount ?? fallbackAmount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                className="font-display num"
                style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontSize: 24, color: 'var(--text)' }}
              />
              <span style={{ flexShrink: 0, fontSize: 15, color: 'var(--text-2)' }}>{unitLabel}</span>
            </div>
            {touched && amountError && <p style={{ margin: '6px 0 0', fontSize: 12, color: ERR }}>{amountError}</p>}
            {presets.length > 0 && (
              <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                {presets.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={units === v}
                    onClick={() => { haptic.select(); setAmount(String(v)) }}
                    className="num"
                    style={tile(units === v, { height: 36, fontSize: 14 })}
                  >
                    {fmtNum(v)}{kind === 'steam' ? ` ${sign}` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Итог и оплата */}
        <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
              К оплате
              {qf && (
                <span className="num" style={{ display: 'block', fontSize: 11, color: 'var(--hint)', marginTop: 2 }}>
                  {kind === 'stars' ? `1 звезда — ${fmtPrice(product.price)} ₽` : `1 ${sign} — ${fmtPrice(product.price)} ₽`}
                </span>
              )}
            </span>
            <span className="font-display num" style={{ fontSize: 24, color: 'var(--text)' }}>{fmtPrice(total)} ₽</span>
          </div>
          <button type="button" onClick={buy} disabled={busy || outOfStock} className="btn-primary">
            {busy && <Loader2 size={18} className="animate-spin" />}
            {outOfStock ? 'Временно нет в наличии' : 'Перейти к оплате'}
          </button>
        </div>
      </div>
    </section>
  )
}
