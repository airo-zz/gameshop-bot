/**
 * src/web/pages/WebCheckoutPage.tsx
 * Оформление заказа на сайте: способ оплаты → создание заказа → оплата.
 * Баланс — мгновенно; крипта — редирект на CryptoBot (новая вкладка);
 * карта — пока «скоро».
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Wallet, Bitcoin, CreditCard, CheckCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { ordersApi, profileApi, cartApi } from '@/api'
import { useWebCart } from '@/web/cart/useWebCart'

function money(v: number) {
  return Number(v).toLocaleString('ru-RU') + ' ₽'
}

const METHODS = [
  { id: 'balance', label: 'Баланс', icon: Wallet, description: 'Мгновенно' },
  { id: 'crypto', label: 'Криптовалюта', icon: Bitcoin, description: 'USDT, TON, BTC, ETH' },
  { id: 'card', label: 'Банковская карта / СБП', icon: CreditCard, description: 'Скоро', comingSoon: true },
] as const

const CRYPTO_COINS = [
  { id: 'USDT', label: 'USDT' },
  { id: 'TON', label: 'TON' },
  { id: 'BTC', label: 'BTC' },
  { id: 'ETH', label: 'ETH' },
]

export default function WebCheckoutPage() {
  const navigate = useNavigate()
  const { cart, refresh } = useWebCart()
  const { data: profile } = useQuery({ queryKey: ['web', 'profile'], queryFn: profileApi.get, staleTime: 5 * 60_000 })

  const [method, setMethod] = useState<string>('balance')
  const [coin, setCoin] = useState('USDT')
  const [placing, setPlacing] = useState(false)
  const [fieldValues, setFieldValues] = useState<Record<string, Record<string, string>>>({})

  const { data: checkoutFields = [] } = useQuery({ queryKey: ['web', 'checkout-fields'], queryFn: cartApi.getCheckoutFields })
  const setFieldValue = (gameId: string, key: string, value: string) =>
    setFieldValues((prev) => ({ ...prev, [gameId]: { ...(prev[gameId] ?? {}), [key]: value } }))

  if (!cart || cart.items.length === 0) {
    return (
      <div className="web-container py-24 text-center">
        <p className="text-sm text-white/45 mb-5">Корзина пуста.</p>
        <button onClick={() => navigate('/catalog')} className="rounded-xl px-5 py-3 text-sm font-semibold text-white" style={{ background: 'var(--gradient-primary)' }}>
          В каталог
        </button>
      </div>
    )
  }

  const insufficientBalance = method === 'balance' && profile && Number(profile.balance) < Number(cart.total)

  async function placeOrder() {
    if (placing) return
    if (method === 'card') {
      toast('Оплата картой скоро будет доступна. Пока — баланс или криптовалюта.', { icon: '⏳' })
      return
    }
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
        ...(method === 'crypto' ? { crypto_currency: coin } : {}),
        ...(checkoutFields.length > 0 ? { input_data: fieldValues } : {}),
      })
      const payment = await ordersApi.pay(order.id)
      await refresh() // корзина очищена на сервере при создании заказа

      if (payment.success) {
        navigate(`/orders/${order.id}?success=1`, { replace: true })
        return
      }
      if (payment.redirect_url) {
        // CryptoBot / провайдер — открываем оплату в новой вкладке,
        // текущую уводим на страницу заказа (статус уточнит webhook).
        window.open(payment.redirect_url, '_blank', 'noopener')
        navigate(`/orders/${order.id}`, { replace: true })
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
      <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-6">Оформление</h1>

      {/* Состав */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 mb-6">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Состав заказа</p>
        <div className="space-y-1.5">
          {cart.items.map((i) => (
            <div key={i.id} className="flex justify-between text-sm">
              <span className="text-white/80 truncate flex-1 mr-3">{i.product_name} × {i.quantity}</span>
              <span className="text-white font-medium shrink-0">{money(i.subtotal)}</span>
            </div>
          ))}
        </div>
        {cart.discount_amount > 0 && (
          <div className="flex justify-between text-sm mt-2 pt-2 border-t border-white/[0.06]">
            <span className="text-white/60">Скидка</span>
            <span style={{ color: '#34d399' }}>−{money(cart.discount_amount)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold mt-2 pt-2 border-t border-white/[0.06]">
          <span className="text-white">Итого</span>
          <span style={{ color: 'var(--link)' }}>{money(cart.total)}</span>
        </div>
      </div>

      {/* Данные для заказа (поля на уровне игры) */}
      {checkoutFields.map((group) => (
        <div key={group.game_id} className="mb-6">
          <p className="text-sm font-semibold text-white/60 mb-3">Данные для {group.game_name}</p>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
            {group.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-xs text-white/50 mb-1.5">
                  {field.label}{field.required && <span className="text-amber-400"> *</span>}
                </label>
                {field.type === 'select' ? (
                  <select
                    value={fieldValues[group.game_id]?.[field.key] ?? ''}
                    onChange={(e) => setFieldValue(group.game_id, field.key, e.target.value)}
                    className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/20"
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
                    className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Способ оплаты */}
      <p className="text-sm font-semibold text-white/60 mb-3">Способ оплаты</p>
      <div className="space-y-2">
        {METHODS.map((m) => {
          const selected = method === m.id
          const disabled = m.id === 'balance' && !!insufficientBalance
          return (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all active:scale-[0.99]"
              style={{
                background: selected ? 'rgba(45,88,173,0.22)' : 'var(--bg2)',
                border: selected ? '1.5px solid rgba(45,88,173,0.55)' : '1.5px solid var(--border)',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <m.icon size={20} style={{ color: selected ? 'var(--link)' : 'var(--hint)' }} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">{m.label}</p>
                <p className="text-xs text-white/45 mt-0.5">
                  {m.id === 'balance' && profile ? `Баланс: ${money(profile.balance)}` : m.description}
                </p>
              </div>
              {selected && <CheckCircle size={18} style={{ color: 'var(--link)' }} />}
            </button>
          )
        })}
      </div>

      {/* Монеты */}
      {method === 'crypto' && (
        <div className="grid grid-cols-4 gap-2 mt-3">
          {CRYPTO_COINS.map((c) => {
            const active = coin === c.id
            return (
              <button
                key={c.id}
                onClick={() => setCoin(c.id)}
                className="py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: active ? 'rgba(45,88,173,0.25)' : 'var(--bg2)',
                  border: active ? '1.5px solid rgba(45,88,173,0.55)' : '1.5px solid var(--border)',
                  color: active ? 'var(--link)' : '#fff',
                }}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      )}

      {insufficientBalance && (
        <div className="flex items-start gap-2 p-3 rounded-2xl mt-4" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <AlertCircle size={15} className="shrink-0 mt-0.5" style={{ color: '#f87171' }} />
          <p className="text-sm" style={{ color: '#f87171' }}>Недостаточно средств. Выберите другой способ оплаты.</p>
        </div>
      )}

      <button
        onClick={placeOrder}
        disabled={placing || !!insufficientBalance}
        className="mt-6 w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] hover:brightness-110 disabled:opacity-50"
        style={{ background: 'var(--gradient-primary)' }}
      >
        {placing ? 'Оформляем...' : `Оплатить ${money(cart.total)}`}
      </button>
    </div>
  )
}
