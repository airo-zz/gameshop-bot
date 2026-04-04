// src/pages/CheckoutPage.tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle, Wallet, CreditCard, Bitcoin, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { cartApi, ordersApi, profileApi } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'
import { useCartStore } from '@/store'

const PAYMENT_METHODS = [
  { id: 'balance',      label: 'Баланс бота',      icon: <Wallet size={20} />,   description: 'Мгновенно' },
  { id: 'card_yukassa', label: 'Банковская карта',  icon: <CreditCard size={20} />, description: 'Visa, Mastercard, МИР' },
  { id: 'usdt',         label: 'USDT (TRC-20)',     icon: <Bitcoin size={20} />,  description: 'Крипта' },
  { id: 'ton',          label: 'TON',               icon: <span className="text-lg">💎</span>, description: 'Telegram монеты' },
]

function CheckoutSkeleton() {
  return (
    <div className="px-4 pt-5 pb-8 space-y-5">
      <div className="skeleton h-7 w-40 rounded-xl" />

      {/* Cart items skeleton */}
      <div
        className="rounded-2xl p-4 space-y-3"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
      >
        <div className="skeleton h-3 w-32 rounded-lg" />
        {Array(3).fill(0).map((_, i) => (
          <div key={i} className="flex justify-between items-center">
            <div className="skeleton h-4 rounded-lg flex-1 mr-4" style={{ maxWidth: '60%' }} />
            <div className="skeleton h-4 w-16 rounded-lg flex-shrink-0" />
          </div>
        ))}
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
        <div className="flex justify-between">
          <div className="skeleton h-5 w-16 rounded-lg" />
          <div className="skeleton h-5 w-20 rounded-lg" />
        </div>
      </div>

      {/* Payment methods skeleton */}
      <div className="space-y-2">
        <div className="skeleton h-3 w-28 rounded-lg" />
        {Array(4).fill(0).map((_, i) => (
          <div
            key={i}
            className="skeleton rounded-2xl"
            style={{ height: 68 }}
          />
        ))}
      </div>

      {/* Button skeleton */}
      <div className="skeleton rounded-2xl" style={{ height: 52 }} />
    </div>
  )
}

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { haptic, openLink, showMainButton, hideMainButton } = useTelegram()
  const { setItemsCount } = useCartStore()

  const [selectedMethod, setSelectedMethod] = useState('balance')
  const [placing, setPlacing] = useState(false)

  const { data: cart, isLoading: cartLoading }    = useQuery({ queryKey: ['cart'],    queryFn: cartApi.get })
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: profileApi.get })

  const insufficientBalance =
    selectedMethod === 'balance' && profile && cart && profile.balance < cart.total

  useEffect(() => {
    const handler = () => handlePlaceOrder()
    showMainButton(
      placing ? 'Оформляем...' : `Оплатить · ${cart?.total.toLocaleString('ru') ?? 0} ₽`,
      handler,
      { loading: placing }
    )
    return () => hideMainButton(handler)
  }, [selectedMethod, placing, cart?.total])

  const handlePlaceOrder = async () => {
    if (placing) return
    setPlacing(true)
    haptic.impact('medium')
    try {
      const order   = await ordersApi.create({ payment_method: selectedMethod })
      const payment = await ordersApi.pay(order.id)

      if (payment.success) {
        setItemsCount(0)
        haptic.success()
        navigate(`/orders/${order.id}?success=1`, { replace: true })
        return
      }
      if (payment.redirect_url) {
        openLink(payment.redirect_url)
        setItemsCount(0)
        navigate(`/orders/${order.id}`, { replace: true })
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

  if (cartLoading) return <CheckoutSkeleton />
  if (!cart) return <CheckoutSkeleton />

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
              {item.lot_name && <span style={{ color: 'var(--hint)' }}> · {item.lot_name}</span>}
            </span>
            <span className="font-medium flex-shrink-0" style={{ color: 'var(--text)' }}>
              {item.subtotal.toLocaleString('ru')} ₽
            </span>
          </div>
        ))}
        <div className="divider" />
        {cart.discount_amount > 0 && (
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--hint)' }}>Скидка</span>
            <span style={{ color: '#34d399' }}>-{cart.discount_amount.toLocaleString('ru')} ₽</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base">
          <span style={{ color: 'var(--text)' }}>Итого</span>
          <span style={{ color: '#6b9de8' }}>{cart.total.toLocaleString('ru')} ₽</span>
        </div>

        {/* Подсказка о прогрессе лояльности */}
        {profile && (() => {
          const LEVELS = [
            { name: 'Bronze',   min: 0,     max: 1000  },
            { name: 'Silver',   min: 1000,  max: 5000  },
            { name: 'Gold',     min: 5000,  max: 15000 },
            { name: 'Platinum', min: 15000, max: null  },
          ]
          const DISCOUNTS: Record<string, number> = { Silver: 3, Gold: 5, Platinum: 10 }
          const spent = profile.total_spent
          const current = [...LEVELS].reverse().find(l => spent >= l.min) ?? LEVELS[0]
          const currentIdx = LEVELS.indexOf(current)
          const next = currentIdx < LEVELS.length - 1 ? LEVELS[currentIdx + 1] : null
          if (!next || current.max === null) return null
          const remaining = current.max - spent
          const discount = DISCOUNTS[next.name] ?? 0
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
              ⭐ До {next.name} осталось{' '}
              <strong>{remaining.toLocaleString('ru')} ₽</strong>
              {discount > 0 && ` — апгрейд даст скидку ${discount}%`}
            </div>
          )
        })()}
      </div>

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
                      ? `Баланс: ${profile.balance.toLocaleString('ru')} ₽`
                      : method.description
                    }
                  </p>
                </div>
                {isSelected && <CheckCircle size={18} style={{ color: '#6b9de8' }} />}
              </button>
            )
          })}
        </div>
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
        className="btn-primary"
        disabled={placing || !!insufficientBalance}
        onClick={handlePlaceOrder}
      >
        {placing ? '⏳ Оформляем...' : `Оплатить ${cart.total.toLocaleString('ru')} ₽`}
      </button>

      <p className="text-xs text-center" style={{ color: 'var(--hint)' }}>
        Нажимая «Оплатить», ты соглашаешься с условиями магазина
      </p>
    </div>
  )
}
