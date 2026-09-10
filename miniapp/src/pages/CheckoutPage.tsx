// src/pages/CheckoutPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle, Wallet, Bitcoin, AlertCircle, CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'
import { cartApi, ordersApi, profileApi } from '@/api'
import { LOYALTY_LEVELS, LOYALTY_DISCOUNTS } from '@/utils/loyalty'
import { fmtPrice } from '@/utils/format'
import { useTelegram } from '@/hooks/useTelegram'
import { useCartStore } from '@/store'

const PAYMENT_METHODS = [
  { id: 'balance',      label: 'Баланс бота',        icon: <Wallet size={20} />,     description: 'Мгновенно' },
  { id: 'crypto',       label: 'Криптовалюта',       icon: <Bitcoin size={20} />,    description: 'USDT, TON, BTC, ETH' },
  // Фиат (карта/СБП) — заглушка до подключения платёжного провайдера
  { id: 'card',         label: 'Банковская карта / СБП', icon: <CreditCard size={20} />, description: 'Скоро', comingSoon: true },
]

const CRYPTO_COINS = [
  { id: 'USDT', label: 'USDT',  description: 'Tether' },
  { id: 'TON',  label: 'TON',   description: 'Toncoin' },
  { id: 'BTC',  label: 'BTC',   description: 'Bitcoin' },
  { id: 'ETH',  label: 'ETH',   description: 'Ethereum' },
]


export default function CheckoutPage() {
  const navigate = useNavigate()
  const { haptic, openLink, openTelegramLink } = useTelegram()
  const { setItemsCount } = useCartStore()

  const [selectedMethod, setSelectedMethod] = useState('balance')
  const [selectedCrypto, setSelectedCrypto] = useState('USDT')
  const [placing, setPlacing] = useState(false)
  const [fieldValues, setFieldValues] = useState<Record<string, Record<string, string>>>({})

  const { data: cart } = useQuery({ queryKey: ['cart'], queryFn: cartApi.get })
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: profileApi.get })
  const { data: checkoutFields = [] } = useQuery({ queryKey: ['checkout-fields'], queryFn: cartApi.getCheckoutFields })

  const setFieldValue = (gameId: string, key: string, value: string) =>
    setFieldValues(prev => ({ ...prev, [gameId]: { ...(prev[gameId] ?? {}), [key]: value } }))

  const insufficientBalance =
    selectedMethod === 'balance' && profile && cart && Number(profile.balance) < Number(cart.total)

  const handlePlaceOrder = async () => {
    if (placing) return
    if (selectedMethod === 'card') {
      haptic.impact('light')
      toast('Оплата картой и СБП скоро будет доступна. Сейчас можно оплатить криптовалютой или балансом.', { icon: '⏳' })
      return
    }
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
        ...(selectedMethod === 'crypto' ? { crypto_currency: selectedCrypto } : {}),
        ...(checkoutFields.length > 0 ? { input_data: fieldValues } : {}),
      })
      const payment = await ordersApi.pay(order.id)

      if (payment.success) {
        setItemsCount(0)
        haptic.success()
        navigate(`/chat?order_id=${order.id}`, { replace: true })
        return
      }
      if (payment.mini_app_invoice_url && (window as any).Telegram?.WebApp?.openInvoice) {
        setItemsCount(0)
        ;(window as any).Telegram.WebApp.openInvoice(
          payment.mini_app_invoice_url,
          (invoiceStatus: string) => {
            if (invoiceStatus === 'paid') {
              haptic.success()
              navigate(`/orders/${order.id}?success=1`, { replace: true })
            } else if (invoiceStatus === 'cancelled') {
              toast('Оплата отменена')
            }
            // pending / failed — остаёмся, webhook уточнит статус
          },
        )
        navigate(`/chat?order_id=${order.id}`, { replace: true })
        return
      }
      if (payment.redirect_url) {
        // t.me links (CryptoBot) open natively in Telegram, others in browser
        if (payment.redirect_url.includes('t.me/')) {
          openTelegramLink(payment.redirect_url)
        } else {
          openLink(payment.redirect_url)
        }
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

  const loyaltyHint = profile ? (() => {
    const spent = profile.total_spent
    const current = [...LOYALTY_LEVELS].reverse().find(l => spent >= l.min) ?? LOYALTY_LEVELS[0]
    const currentIdx = LOYALTY_LEVELS.indexOf(current)
    const next = currentIdx < LOYALTY_LEVELS.length - 1 ? LOYALTY_LEVELS[currentIdx + 1] : null
    if (!next || current.max === null) return null
    const remaining = current.max - spent
    const discount = LOYALTY_DISCOUNTS[next.name] ?? 0
    return (
      <div
        style={{
          marginTop: 10,
          padding: '7px 10px',
          borderRadius: 10,
          background: 'rgba(45,88,173,0.08)',
          border: '1px solid rgba(45,88,173,0.18)',
          fontSize: 12,
          color: '#6b9de8',
          lineHeight: 1.4,
        }}
      >
        До {next.name} осталось{' '}
        <strong>{fmtPrice(remaining)} ₽</strong>
        {discount > 0 && ` — апгрейд даст скидку ${discount}%`}
      </div>
    )
  })() : null

  return (
    <div className="px-4 pt-5 pb-8 space-y-5 animate-slide-up">
      <h1 className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>💳 Оформление</h1>

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
          <span style={{ color: '#6b9de8' }}>{fmtPrice(cart.total)} ₽</span>
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
                    ? 'linear-gradient(135deg, rgba(45,88,173,0.28), rgba(45,88,173,0.25))'
                    : 'var(--bg2)',
                  border: isSelected
                    ? '1.5px solid rgba(45,88,173,0.55)'
                    : '1.5px solid var(--border)',
                  opacity: isDisabled ? 0.5 : 1,
                }}
              >
                <span style={{ color: isSelected ? '#6b9de8' : 'var(--hint)' }}>
                  {method.icon}
                </span>
                <div className="flex-1">
                  <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{method.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>
                    {method.id === 'balance' && profile
                      ? `Баланс: ${fmtPrice(profile.balance)} ₽`
                      : method.description
                    }
                  </p>
                </div>
                {isSelected && <CheckCircle size={18} style={{ color: '#6b9de8' }} />}
              </button>
            )
          })}
        </div>

        {/* Выбор монеты при крипто-оплате */}
        {selectedMethod === 'crypto' && (
          <div className="mt-3">
            <p className="text-xs font-medium mb-2.5" style={{ color: 'var(--hint)' }}>Выберите монету</p>
            <div className="grid grid-cols-2 gap-2">
              {CRYPTO_COINS.map(coin => {
                const active = selectedCrypto === coin.id
                return (
                  <button
                    type="button"
                    key={coin.id}
                    onClick={() => { setSelectedCrypto(coin.id); haptic.select() }}
                    className="flex flex-col items-center justify-center py-3 rounded-2xl transition-all active:scale-[0.97]"
                    style={{
                      background: active ? 'rgba(45,88,173,0.25)' : 'var(--bg2)',
                      border: active ? '1.5px solid rgba(45,88,173,0.55)' : '1.5px solid var(--border)',
                    }}
                  >
                    <span className="text-sm font-bold" style={{ color: active ? '#6b9de8' : 'var(--text)' }}>
                      {coin.label}
                    </span>
                    <span className="text-[11px] mt-0.5" style={{ color: 'var(--hint)' }}>
                      {coin.description}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] mt-2 text-center" style={{ color: 'var(--hint)' }}>
              Сеть выбирается при оплате в CryptoBot
            </p>
          </div>
        )}
      </section>

      {/* Недостаточно средств */}
      {insufficientBalance && (
        <div
          className="flex items-start gap-2 p-3 rounded-2xl"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#f87171' }} />
          <p className="text-sm" style={{ color: '#f87171' }}>
            Недостаточно средств. Пополни баланс или выбери другой способ.
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
        ) : `Оплатить ${fmtPrice(cart.total)} ₽`}
      </button>

      <p className="text-xs text-center" style={{ color: 'var(--hint)' }}>
        Нажимая «Оплатить», ты принимаешь{' '}
        <span
          onClick={() => openLink(`${window.location.origin}/app/legal/terms.html`)}
          style={{ color: '#6b9de8', cursor: 'pointer' }}
        >
          условия сервиса
        </span>{' '}и{' '}
        <span
          onClick={() => openLink(`${window.location.origin}/app/legal/privacy.html`)}
          style={{ color: '#6b9de8', cursor: 'pointer' }}
        >
          политику конфиденциальности
        </span>
      </p>
    </div>
  )
}
