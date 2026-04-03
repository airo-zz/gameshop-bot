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

  // Telegram MainButton
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
      // 1. Создаём заказ
      const order = await ordersApi.create({ payment_method: selectedMethod })

      // 2. Инициируем оплату
      const payment = await ordersApi.pay(order.id)

      if (payment.success) {
        // Оплата балансом — сразу успех
        setItemsCount(0)
        haptic.success()
        navigate(`/orders/${order.id}?success=1`, { replace: true })
        return
      }

      if (payment.redirect_url) {
        // Карта или крипта — открываем страницу оплаты
        openLink(payment.redirect_url)
        // После возврата проверяем статус
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
    <div className="px-4 pt-4 pb-6 space-y-5 animate-slide-up">
      <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>💳 Оформление</h1>

      {/* Итог корзины */}
      <div className="card space-y-2">
        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--hint)' }}>
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
        <div className="h-px" style={{ background: 'var(--bg)' }} />
        {cart.discount_amount > 0 && (
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--hint)' }}>Скидка</span>
            <span style={{ color: '#10b981' }}>-{cart.discount_amount.toLocaleString('ru')} ₽</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base">
          <span style={{ color: 'var(--text)' }}>Итого</span>
          <span style={{ color: 'var(--btn)' }}>{cart.total.toLocaleString('ru')} ₽</span>
        </div>
      </div>

      {/* Способ оплаты */}
      <section>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
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
                  'transition-all duration-150 active:scale-98',
                  'border-2',
                )}
                style={{
                  background: isSelected ? 'var(--btn)' : 'var(--bg2)',
                  borderColor: isSelected ? 'var(--btn)' : 'transparent',
                  color: isSelected ? 'var(--btn-text)' : 'var(--text)',
                  opacity: isDisabled ? 0.5 : 1,
                }}
              >
                <span style={{ color: isSelected ? 'var(--btn-text)' : 'var(--btn)' }}>
                  {method.icon}
                </span>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{method.label}</p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--hint)' }}
                  >
                    {method.id === 'balance' && profile
                      ? `Баланс: ${profile.balance.toLocaleString('ru')} ₽`
                      : method.description
                    }
                  </p>
                </div>
                {isSelected && <CheckCircle size={20} />}
              </button>
            )
          })}
        </div>
      </section>

      {/* Предупреждение о балансе */}
      {insufficientBalance && (
        <div className="flex items-start gap-2 p-3 rounded-2xl"
             style={{ background: '#fef2f2', color: '#991b1b' }}>
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <p className="text-sm">
            Недостаточно средств. Пополни баланс или выбери другой способ.
          </p>
        </div>
      )}

      {/* Кнопка (fallback) */}
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
