// src/pages/CheckoutPage.tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle, Wallet, CreditCard, Bitcoin, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { cartApi, ordersApi, profileApi } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'
import { useCartStore } from '@/store'
import clsx from 'clsx'

const PAYMENT_METHODS = [
  {
    id: 'balance',
    label: 'Баланс бота',
    icon: <Wallet size={20} />,
    description: 'Мгновенно',
  },
  {
    id: 'card_yukassa',
    label: 'Банковская карта',
    icon: <CreditCard size={20} />,
    description: 'Visa, Mastercard, МИР',
  },
  {
    id: 'usdt',
    label: 'USDT (TRC-20)',
    icon: <Bitcoin size={20} />,
    description: 'Крипта',
  },
  {
    id: 'ton',
    label: 'TON',
    icon: <span className="text-lg">💎</span>,
    description: 'Telegram монеты',
  },
]

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { haptic, openLink, showMainButton, hideMainButton } = useTelegram()
  const { setItemsCount } = useCartStore()

  const [selectedMethod, setSelectedMethod] = useState('balance')
  const [placing, setPlacing] = useState(false)

  const { data: cart } = useQuery({ queryKey: ['cart'], queryFn: cartApi.get })
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: profileApi.get })

  const insufficientBalance =
    selectedMethod === 'balance' &&
    profile &&
    cart &&
    profile.balance < cart.total

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
      const order = await ordersApi.create({ payment_method: selectedMethod })
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

  if (!cart) return null

  return (
    <div className="px-4 pt-5 pb-6 space-y-5 animate-slide-up">
      <h1 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        💳 Оформление
      </h1>

      {/* Итог корзины */}
      <div className="card space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--hint)' }}>
          Состав заказа · {cart.items_count} поз.
        </p>
        {cart.items.map(item => (
          <div key={item.id} className="flex justify-between text-sm gap-2">
            <span className="truncate flex-1" style={{ color: 'var(--text)' }}>
              {item.product_name}
              {item.lot_name && (
                <span style={{ color: 'var(--hint)' }}> · {item.lot_name}</span>
              )}
            </span>
            <span className="font-semibold flex-shrink-0" style={{ color: 'var(--text)' }}>
              {item.subtotal.toLocaleString('ru')} ₽
            </span>
          </div>
        ))}
        <div className="divider" />
        {cart.discount_amount > 0 && (
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--hint)' }}>Скидка</span>
            <span style={{ color: '#22c55e' }}>-{cart.discount_amount.toLocaleString('ru')} ₽</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base">
          <span style={{ color: 'var(--text)' }}>Итого</span>
          <span style={{ color: '#818cf8' }}>{cart.total.toLocaleString('ru')} ₽</span>
        </div>
      </div>

      {/* Способ оплаты */}
      <section>
        <h2
          className="text-xs font-semibold uppercase tracking-wider mb-3"
          style={{ color: 'var(--hint)' }}
        >
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
                className={clsx(
                  'w-full flex items-center gap-3 p-4 rounded-2xl text-left',
                  'transition-all duration-200 active:scale-[0.98]',
                )}
                style={
                  isSelected
                    ? {
                        background: 'rgba(99,102,241,0.12)',
                        border: '1.5px solid rgba(99,102,241,0.5)',
                        boxShadow: '0 0 16px rgba(99,102,241,0.1)',
                        opacity: isDisabled ? 0.5 : 1,
                      }
                    : {
                        background: 'var(--bg2)',
                        border: '1.5px solid var(--border)',
                        opacity: isDisabled ? 0.5 : 1,
                      }
                }
              >
                <span style={{ color: isSelected ? 'var(--accent)' : 'var(--hint)' }}>
                  {method.icon}
                </span>
                <div className="flex-1">
                  <p
                    className="font-semibold text-sm"
                    style={{ color: 'var(--text)' }}
                  >
                    {method.label}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>
                    {method.id === 'balance' && profile
                      ? `Баланс: ${profile.balance.toLocaleString('ru')} ₽`
                      : method.description
                    }
                  </p>
                </div>
                {isSelected && (
                  <CheckCircle size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* Предупреждение о балансе */}
      {insufficientBalance && (
        <div
          className="flex items-start gap-2.5 p-3.5 rounded-2xl"
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
          }}
        >
          <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
          <p className="text-sm" style={{ color: '#fca5a5' }}>
            Недостаточно средств. Пополни баланс или выбери другой способ.
          </p>
        </div>
      )}

      {/* Кнопка */}
      <button
        className="btn-primary"
        disabled={placing || !!insufficientBalance}
        onClick={handlePlaceOrder}
      >
        {placing ? (
          <>
            <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            Оформляем...
          </>
        ) : (
          `Оплатить ${cart.total.toLocaleString('ru')} ₽`
        )}
      </button>

      <p className="text-xs text-center" style={{ color: 'rgba(148,163,184,0.5)' }}>
        Нажимая «Оплатить», ты соглашаешься с условиями магазина
      </p>
    </div>
  )
}
