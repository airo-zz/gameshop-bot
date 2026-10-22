// src/pages/CheckoutPage.tsx
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle, Wallet, Bitcoin, AlertCircle, CreditCard, Smartphone } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { cartApi, ordersApi, profileApi } from '@/api'
import { fmtPrice } from '@/utils/format'
import { useTelegram } from '@/hooks/useTelegram'
import { useCartStore } from '@/store'
import { PAY_SOURCE } from '@/config/appTarget'
import BalanceSplitToggle, { splitPayment } from '@/components/ui/BalanceSplit'

const PAYMENT_METHODS = [
  { id: 'balance', label: 'Баланс бота',      icon: <Wallet size={20} />,     description: 'Мгновенно' },
  { id: 'sbp',     label: 'СБП',              icon: <Smartphone size={20} />, description: 'Система быстрых платежей' },
  { id: 'card',    label: 'Банковская карта', icon: <CreditCard size={20} />, description: 'Visa · Mastercard · МИР' },
  { id: 'crypto',  label: 'Криптовалюта',     icon: <Bitcoin size={20} />,    description: 'USDT, TON, BTC и др.' },
]

type QuoteKey = 'crypto' | 'balance' | 'card' | 'sbp'


export default function CheckoutPage() {
  const navigate = useNavigate()
  const { haptic, openLink } = useTelegram()
  const { setItemsCount } = useCartStore()

  const [selectedMethod, setSelectedMethod] = useState('balance')
  const [placing, setPlacing] = useState(false)
  const [fieldValues, setFieldValues] = useState<Record<string, Record<string, string>>>({})

  const { data: cart } = useQuery({ queryKey: ['cart'], queryFn: cartApi.get })
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: profileApi.get })
  const { data: checkoutFields = [] } = useQuery({ queryKey: ['checkout-fields'], queryFn: cartApi.getCheckoutFields })
  const { data: quote } = useQuery({ queryKey: ['cart-quote'], queryFn: cartApi.getQuote })

  const methodGroup = (m: string): QuoteKey =>
    m === 'card' ? 'card' : m === 'sbp' ? 'sbp' : m === 'crypto' ? 'crypto' : 'balance'
  const methodTotal = quote ? quote[methodGroup(selectedMethod)] : Number(cart?.total ?? 0)

  // Доплата: баланса не хватает на весь заказ — часть с баланса, остаток шлюзом
  const [useBalance, setUseBalance] = useState(true)
  const balanceNum = Number(profile?.balance ?? 0)
  const baseTotal = Number(quote?.balance ?? cart?.total ?? 0)
  const split = splitPayment(balanceNum, baseTotal, methodTotal, useBalance && selectedMethod !== 'balance')
  const payTotal = selectedMethod === 'balance' ? methodTotal : split.rest

  // Баланса не хватает — сразу предлагаем СБП с доплатой (один раз, при загрузке)
  const autoPicked = useRef(false)
  useEffect(() => {
    if (autoPicked.current || !profile || !quote) return
    autoPicked.current = true
    if (Number(profile.balance) < Number(quote.balance)) setSelectedMethod('sbp')
  }, [profile, quote])

  const setFieldValue = (gameId: string, key: string, value: string) =>
    setFieldValues(prev => ({ ...prev, [gameId]: { ...(prev[gameId] ?? {}), [key]: value } }))

  const insufficientBalance =
    selectedMethod === 'balance' && profile && cart &&
    Number(profile.balance) < Number(quote?.balance ?? cart.total)

  const handlePlaceOrder = async () => {
    if (placing) return
    // Проверяем обязательные поля игр
    for (const group of checkoutFields) {
      for (const f of group.fields) {
        if (f.required && !(fieldValues[group.game_id]?.[f.key] ?? '').trim()) {
          haptic.error()
          toast.error(`Заполните «${f.label}» для ${group.game_name}`)
          return
        }
      }
    }

    setPlacing(true)
    haptic.impact('medium')
    try {
      const order   = await ordersApi.create({
        payment_method: selectedMethod,
        ...(checkoutFields.length > 0 ? { input_data: fieldValues } : {}),
      })
      const payment = await ordersApi.pay(order.id, { source: PAY_SOURCE, use_balance: split.hold > 0 })

      if (payment.success) {
        setItemsCount(0)
        haptic.success()
        navigate(`/chat?order_id=${order.id}`, { replace: true })
        return
      }
      if (payment.redirect_url) {
        // Platega — страница оплаты открывается во внешнем браузере
        openLink(payment.redirect_url)
        setItemsCount(0)
        navigate(`/chat?order_id=${order.id}`, { replace: true })
        return
      }
      toast.error('Ошибка инициализации оплаты')
    } catch (e: any) {
      haptic.error()
      toast.error(e?.response?.data?.detail ?? 'Ошибка оформления заказа')
    } finally {
      setPlacing(false)
    }
  }

  if (!cart) return null

  // Подсказка по лояльности (модель Bybit): кэшбэк за этот заказ с учётом месячного
  // лимита и прогресс к следующему уровню — всё из profile API, без хардкода уровней
  const loyaltyHint = profile ? (() => {
    const pct = Number(profile.loyalty_cashback_percent)
    const cap = profile.loyalty_cashback_cap != null ? Number(profile.loyalty_cashback_cap) : null
    const left = cap != null ? Math.max(0, cap - Number(profile.loyalty_month_cashback)) : Infinity
    const cashback = Math.floor(Math.min(Number(cart.total) * pct / 100, left) * 100) / 100
    const nextMin = profile.loyalty_next_level_min_spent != null ? Number(profile.loyalty_next_level_min_spent) : null
    const toNext = nextMin != null ? nextMin - Number(profile.loyalty_month_spent) - Number(cart.total) : null
    if (cashback <= 0 && !profile.loyalty_next_level_name) return null
    return (
      <div style={{ marginTop: 12, fontSize: 13, color: 'var(--hint)', lineHeight: 1.45 }}>
        {cashback > 0 && <>Вернётся кэшбэком: <span className="num" style={{ color: 'var(--text)' }}>{fmtPrice(cashback)} ₽</span>. </>}
        {profile.loyalty_next_level_name && toNext != null && (
          toNext <= 0
            ? <>С этим заказом вы перейдёте на уровень «{profile.loyalty_next_level_name}».</>
            : <>До уровня «{profile.loyalty_next_level_name}» после заказа: <span className="num" style={{ color: 'var(--text)' }}>{fmtPrice(toNext)} ₽</span>.</>
        )}
      </div>
    )
  })() : null

  return (
    <div className="px-4 pt-5 pb-8 space-y-5 animate-slide-up">
      <h1 className="text-xl" style={{ color: 'var(--text)' }}>Оформление</h1>

      {/* Состав заказа */}
      <div className="card space-y-2">
        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--hint)' }}>
          Состав заказа ({cart.items_count} поз.)
        </p>
        {cart.items.map(item => (
          <div key={item.id} className="flex justify-between text-sm">
            <span className="truncate flex-1 mr-2" style={{ color: 'var(--text)' }}>
              {item.product_name}
            </span>
            <span className="font-medium flex-shrink-0" style={{ color: 'var(--text)' }}>
              {fmtPrice(item.subtotal)} ₽
            </span>
          </div>
        ))}
        <div className="divider" />
        {cart.discount_amount > 0 && (
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--hint)' }}>Скидка</span>
            <span style={{ color: '#34d399' }}>-{fmtPrice(cart.discount_amount)} ₽</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base">
          <span style={{ color: 'var(--text)' }}>Итого</span>
          <span className="font-display num" style={{ color: 'var(--text)' }}>{fmtPrice(cart.total)} ₽</span>
        </div>

        {/* Подсказка о прогрессе лояльности */}
        {loyaltyHint}
      </div>

      {/* Данные для заказа (поля на уровне игры) */}
      {checkoutFields.map(group => (
        <section key={group.game_id}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--hint)' }}>
            Данные для {group.game_name}
          </h2>
          <div className="card space-y-3">
            {group.fields.map(field => (
              <div key={field.key}>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--hint)' }}>
                  {field.label}{field.required && <span style={{ color: '#f87171' }}> *</span>}
                </label>
                {field.type === 'select' ? (
                  <select
                    className="input"
                    style={{ fontSize: 14, padding: '10px 12px', borderRadius: 12 }}
                    value={fieldValues[group.game_id]?.[field.key] ?? ''}
                    onChange={e => setFieldValue(group.game_id, field.key, e.target.value)}
                  >
                    <option value="">Выберите...</option>
                    {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    className="input"
                    style={{ fontSize: 14, padding: '10px 12px', borderRadius: 12 }}
                    placeholder={field.placeholder ?? field.label}
                    value={fieldValues[group.game_id]?.[field.key] ?? ''}
                    onChange={e => setFieldValue(group.game_id, field.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Способы оплаты */}
      <section>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--hint)' }}>
          Способ оплаты
        </h2>
        <div className="space-y-2">
          {PAYMENT_METHODS.map(method => {
            const isSelected = selectedMethod === method.id
            const isDisabled = method.id === 'balance' && insufficientBalance
            return (
              <button
                type="button"
                key={method.id}
                onClick={() => { setSelectedMethod(method.id); haptic.select() }}
                className="w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all duration-150 active:scale-[0.98]"
                style={{
                  background: isSelected
                    ? 'var(--accent-soft)'
                    : 'var(--bg2)',
                  border: isSelected
                    ? '1.5px solid var(--accent)'
                    : '1.5px solid var(--border)',
                  opacity: isDisabled ? 0.5 : 1,
                }}
              >
                <span style={{ color: isSelected ? 'var(--link)' : 'var(--hint)' }}>
                  {method.icon}
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{method.label}</p>
                    {quote && (
                      <p className="text-sm font-semibold num" style={{ color: 'var(--text)' }}>
                        {fmtPrice(quote[method.id as QuoteKey])} ₽
                      </p>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>
                    {method.id === 'balance' && profile
                      ? `Баланс: ${fmtPrice(profile.balance)} ₽`
                      : method.description
                    }
                  </p>
                </div>
                {isSelected && <CheckCircle size={18} style={{ color: 'var(--link)' }} />}
              </button>
            )
          })}
        </div>

        {selectedMethod !== 'balance' && split.can && (
          <div className="mt-2">
            <BalanceSplitToggle
              balance={balanceNum}
              rest={split.rest}
              methodLabel={PAYMENT_METHODS.find(m => m.id === selectedMethod)?.label ?? ''}
              checked={useBalance}
              onChange={v => { haptic.select(); setUseBalance(v) }}
            />
          </div>
        )}

        {selectedMethod === 'crypto' && (
          <p className="text-[11px] mt-2.5 text-center" style={{ color: 'var(--hint)' }}>
            Монета и сеть выбираются на странице оплаты
          </p>
        )}
      </section>

      {/* Недостаточно средств */}
      {insufficientBalance && (
        <div
          className="flex items-start gap-2 p-3 rounded-2xl"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid transparent' }}
        >
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#f87171' }} />
          <p className="text-sm" style={{ color: '#f87171' }}>
            Баланса недостаточно для оплаты заказа. Выберите другой способ оплаты.
          </p>
        </div>
      )}

      <button
        type="button"
        className="btn-primary"
        disabled={placing || !!insufficientBalance}
        onClick={handlePlaceOrder}
      >
        {placing ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
            Оформляем...
          </span>
        ) : `Оплатить ${fmtPrice(payTotal)} ₽`}
      </button>

      <p className="text-xs text-center" style={{ color: 'var(--hint)' }}>
        Нажимая «Оплатить», ты принимаешь{' '}
        <span
          onClick={() => openLink(`${window.location.origin}/app/legal/terms.html`)}
          style={{ color: 'var(--link)', cursor: 'pointer' }}
        >
          условия сервиса
        </span>{' '}и{' '}
        <span
          onClick={() => openLink(`${window.location.origin}/app/legal/privacy.html`)}
          style={{ color: 'var(--link)', cursor: 'pointer' }}
        >
          политику конфиденциальности
        </span>
      </p>
    </div>
  )
}
