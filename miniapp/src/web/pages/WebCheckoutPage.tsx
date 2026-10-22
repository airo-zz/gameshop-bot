/**
 * src/web/pages/WebCheckoutPage.tsx
 * Оформление заказа на сайте: способ оплаты → создание заказа → оплата.
 * Баланс — мгновенно; СБП / карта / крипта — редирект на Platega (новая вкладка).
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Wallet, Bitcoin, CreditCard, CheckCircle, AlertCircle, Smartphone } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { ordersApi, profileApi, cartApi } from '@/api'
import { useWebCart } from '@/web/cart/useWebCart'
import { PAY_SOURCE } from '@/config/appTarget'
import BalanceSplitToggle, { splitPayment } from '@/components/ui/BalanceSplit'
import { fmtNum } from '@/utils/format'

function money(v: number) {
  return fmtNum(v) + ' ₽'
}

const METHODS = [
  { id: 'balance', label: 'Баланс', icon: Wallet, description: 'Мгновенно' },
  { id: 'sbp', label: 'СБП', icon: Smartphone, description: 'Система быстрых платежей' },
  { id: 'card', label: 'Банковская карта', icon: CreditCard, description: 'Visa · Mastercard · МИР' },
  { id: 'crypto', label: 'Криптовалюта', icon: Bitcoin, description: 'USDT, TON, BTC и др.' },
] as const

type QuoteKey = 'crypto' | 'balance' | 'card' | 'sbp'

export default function WebCheckoutPage() {
  const navigate = useNavigate()
  const { cart, refresh } = useWebCart()
  const { data: profile } = useQuery({ queryKey: ['web', 'profile'], queryFn: profileApi.get, staleTime: 5 * 60_000 })

  const [method, setMethod] = useState<string>('balance')
  const [placing, setPlacing] = useState(false)
  const [fieldValues, setFieldValues] = useState<Record<string, Record<string, string>>>({})

  const { data: checkoutFields = [] } = useQuery({ queryKey: ['web', 'checkout-fields'], queryFn: cartApi.getCheckoutFields })
  const { data: quote } = useQuery({ queryKey: ['web', 'cart-quote'], queryFn: cartApi.getQuote })
  const methodGroup = (m: string): QuoteKey =>
    m === 'card' ? 'card' : m === 'sbp' ? 'sbp' : m === 'crypto' ? 'crypto' : 'balance'
  const methodTotal = quote ? quote[methodGroup(method)] : Number(cart?.total ?? 0)

  // Доплата: баланса не хватает — часть с баланса, остаток выбранным способом
  const [useBalance, setUseBalance] = useState(true)
  const balanceNum = Number(profile?.balance ?? 0)
  const split = splitPayment(balanceNum, Number(quote?.balance ?? cart?.total ?? 0), methodTotal, useBalance && method !== 'balance')
  const payTotal = method === 'balance' ? methodTotal : split.rest
  const autoPicked = useRef(false)
  useEffect(() => {
    if (autoPicked.current || !profile || !quote) return
    autoPicked.current = true
    if (Number(profile.balance) < Number(quote.balance)) setMethod('sbp')
  }, [profile, quote])
  const setFieldValue = (gameId: string, key: string, value: string) =>
    setFieldValues((prev) => ({ ...prev, [gameId]: { ...(prev[gameId] ?? {}), [key]: value } }))

  if (!cart || cart.items.length === 0) {
    return (
      <div className="web-container py-24 text-center">
        <p className="text-sm text-[var(--hint)] mb-5">Корзина пуста.</p>
        <button onClick={() => navigate('/catalog')} className="rounded-xl px-5 py-3 text-sm font-semibold text-[var(--text)]" style={{ background: 'var(--gradient-primary)' }}>
          В каталог
        </button>
      </div>
    )
  }

  const insufficientBalance = method === 'balance' && profile && Number(profile.balance) < Number(quote?.balance ?? cart.total)

  async function placeOrder() {
    if (placing) return
    for (const group of checkoutFields) {
      for (const f of group.fields) {
        if (f.required && !(fieldValues[group.game_id]?.[f.key] ?? '').trim()) {
          toast.error(`Заполните «${f.label}» для ${group.game_name}`)
          return
        }
      }
    }
    setPlacing(true)
    try {
      const order = await ordersApi.create({
        payment_method: method,
        ...(checkoutFields.length > 0 ? { input_data: fieldValues } : {}),
      })
      const payment = await ordersApi.pay(order.id, { source: PAY_SOURCE, use_balance: split.hold > 0 })
      await refresh() // корзина очищается на сервере после успешной инициации оплаты

      if (payment.success) {
        navigate(`/orders/${order.id}?success=1`, { replace: true })
        return
      }
      if (payment.redirect_url) {
        // Platega — переходим в этой же вкладке: window.open после await
        // блокируется браузерами. Platega вернёт на /orders/{id}?success=1.
        window.location.href = payment.redirect_url
        return
      }
      toast.error('Не удалось инициализировать оплату')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Ошибка оформления заказа')
    } finally {
      setPlacing(false)
    }
  }

  return (
    <div className="web-container py-8 md:py-12 max-w-2xl">
      <h1 className="text-2xl md:text-3xl text-[var(--text)] mb-6" style={{ margin: '0 0 24px' }}>Оформление</h1>

      {/* Состав */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg2)] p-5 mb-6">
        <p className="text-xs font-semibold text-[var(--hint)] uppercase tracking-wider mb-3">Состав заказа</p>
        <div className="space-y-1.5">
          {cart.items.map((i) => (
            <div key={i.id} className="flex justify-between text-sm">
              <span className="text-[var(--text-2)] truncate flex-1 mr-3">{i.product_name} × {i.quantity}</span>
              <span className="text-[var(--text)] font-medium shrink-0">{money(i.subtotal)}</span>
            </div>
          ))}
        </div>
        {cart.discount_amount > 0 && (
          <div className="flex justify-between text-sm mt-2 pt-2 border-t border-[var(--border)]">
            <span className="text-[var(--text-2)]">Скидка</span>
            <span style={{ color: '#34d399' }}>−{money(cart.discount_amount)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold mt-2 pt-2 border-t border-[var(--border)]">
          <span className="text-[var(--text)]">Итого</span>
          <span style={{ color: 'var(--link)' }}>{money(cart.total)}</span>
        </div>
      </div>

      {/* Данные для заказа (поля на уровне игры) */}
      {checkoutFields.map((group) => (
        <div key={group.game_id} className="mb-6">
          <p className="text-sm font-semibold text-[var(--text-2)] mb-3">Данные для {group.game_name}</p>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg2)] p-4 space-y-3">
            {group.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-xs text-[var(--hint)] mb-1.5">
                  {field.label}{field.required && <span className="text-amber-400"> *</span>}
                </label>
                {field.type === 'select' ? (
                  <select
                    value={fieldValues[group.game_id]?.[field.key] ?? ''}
                    onChange={(e) => setFieldValue(group.game_id, field.key, e.target.value)}
                    className="w-full bg-[var(--bg3)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--border)]"
                  >
                    <option value="">Выберите...</option>
                    {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={fieldValues[group.game_id]?.[field.key] ?? ''}
                    onChange={(e) => setFieldValue(group.game_id, field.key, e.target.value)}
                    placeholder={field.placeholder ?? field.label}
                    className="w-full bg-[var(--bg3)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none focus:border-[var(--border)]"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Способ оплаты */}
      <p className="text-sm font-semibold text-[var(--text-2)] mb-3">Способ оплаты</p>
      <div className="space-y-2">
        {METHODS.map((m) => {
          const selected = method === m.id
          const disabled = m.id === 'balance' && !!insufficientBalance
          return (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-colors hover:bg-[var(--bg3)]"
              style={{
                background: selected ? 'var(--accent-soft)' : 'var(--bg2)',
                border: selected ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <m.icon size={20} style={{ color: selected ? 'var(--link)' : 'var(--hint)' }} />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--text)]">{m.label}</p>
                  {quote && (
                    <p className="text-sm font-semibold num text-[var(--text)]">
                      {money(quote[m.id])}
                    </p>
                  )}
                </div>
                <p className="text-xs text-[var(--hint)] mt-0.5">
                  {m.id === 'balance' && profile ? `Баланс: ${money(profile.balance)}` : m.description}
                </p>
              </div>
              {selected && <CheckCircle size={18} style={{ color: 'var(--link)' }} />}
            </button>
          )
        })}
      </div>

      {method !== 'balance' && split.can && (
        <div className="mt-2">
          <BalanceSplitToggle
            balance={balanceNum}
            rest={split.rest}
            methodLabel={METHODS.find((m) => m.id === method)?.label ?? ''}
            checked={useBalance}
            onChange={setUseBalance}
          />
        </div>
      )}

      {method === 'crypto' && (
        <p className="text-xs text-[var(--hint)] mt-3 text-center">
          Монета и сеть выбираются на странице оплаты
        </p>
      )}

      {insufficientBalance && (
        <div className="flex items-start gap-2 p-3 rounded-2xl mt-4" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid transparent' }}>
          <AlertCircle size={15} className="shrink-0 mt-0.5" style={{ color: '#f87171' }} />
          <p className="text-sm" style={{ color: '#f87171' }}>
            Баланса недостаточно для оплаты заказа. Выберите другой способ оплаты.{' '}
            <Link to="/balance" className="underline font-semibold">Пополнить баланс</Link>
          </p>
        </div>
      )}

      <button
        onClick={placeOrder}
        disabled={placing || !!insufficientBalance}
        className="mt-6 w-full h-12 rounded-xl text-sm font-semibold text-[var(--text)] bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors disabled:opacity-50"
      >
        {placing ? 'Оформляем...' : `Оплатить ${money(payTotal)}`}
      </button>
      <p className="text-xs text-[var(--hint)] text-center mt-3">
        Нажимая «Оплатить», вы принимаете{' '}
        <a href="/app/legal/terms.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--text-2)]">условия сервиса</a>
        {' '}и{' '}
        <a href="/app/legal/privacy.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--text-2)]">политику конфиденциальности</a>.
      </p>
    </div>
  )
}
