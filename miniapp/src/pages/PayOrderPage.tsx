// src/pages/PayOrderPage.tsx
// Оплата заранее созданного заказа (индивидуальный/спец-лот): покупатель
// выбирает способ оплаты и платит. Логика оплаты — как в CheckoutPage.
import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Wallet, Bitcoin, CreditCard, AlertCircle, CheckCircle, Smartphone } from 'lucide-react'
import toast from 'react-hot-toast'
import { ordersApi, profileApi } from '@/api'
import { fmtPrice } from '@/utils/format'
import { useTelegram } from '@/hooks/useTelegram'
import { PAY_SOURCE } from '@/config/appTarget'

const PAYMENT_METHODS = [
  { id: 'balance', label: 'Баланс бота', icon: <Wallet size={20} />, description: 'Мгновенно' },
  { id: 'sbp', label: 'СБП', icon: <Smartphone size={20} />, description: 'Система быстрых платежей' },
  { id: 'card', label: 'Банковская карта', icon: <CreditCard size={20} />, description: 'Visa · Mastercard · МИР' },
  { id: 'crypto', label: 'Криптовалюта', icon: <Bitcoin size={20} />, description: 'USDT, TON, BTC и др.' },
]

type QuoteKey = 'crypto' | 'balance' | 'card' | 'sbp'

export default function PayOrderPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const { haptic, openLink } = useTelegram()

  const [method, setMethod] = useState('balance')
  const [paying, setPaying] = useState(false)

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => ordersApi.get(orderId!),
    enabled: !!orderId,
  })
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: profileApi.get })
  const { data: quote } = useQuery({
    queryKey: ['order-pay-quote', orderId],
    queryFn: () => ordersApi.payQuote(orderId!),
    enabled: !!orderId,
  })

  const group = (m: string): QuoteKey =>
    m === 'card' ? 'card' : m === 'sbp' ? 'sbp' : m === 'crypto' ? 'crypto' : 'balance'
  const payTotal = quote ? quote[group(method)] : Number(order?.total_amount ?? 0)
  const insufficient = method === 'balance' && profile && quote && Number(profile.balance) < Number(quote.balance)

  if (isLoading) return <p style={{ textAlign: 'center', padding: 40, color: 'var(--hint)' }}>Загрузка…</p>
  if (!order) return <p style={{ textAlign: 'center', padding: 40, color: 'var(--hint)' }}>Заказ не найден</p>

  const payable = order.status === 'new' || order.status === 'pending_payment'
  if (!payable) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px' }}>
        <CheckCircle size={44} style={{ color: '#34d399', margin: '0 auto 12px' }} />
        <p style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 8 }}>Заказ уже оплачен или обрабатывается</p>
        <Link to={`/orders/${order.id}`} style={{ color: '#6b9de8' }}>Открыть заказ</Link>
      </div>
    )
  }

  const lot = order.items?.[0]

  const handlePay = async () => {
    if (paying) return
    if (insufficient) {
      haptic.error()
      toast.error('Недостаточно средств на балансе')
      return
    }
    setPaying(true)
    haptic.impact('medium')
    try {
      const payment = await ordersApi.pay(order.id, { payment_method: method, source: PAY_SOURCE })
      if (payment.success) {
        haptic.success()
        navigate(`/chat?order_id=${order.id}`, { replace: true })
        return
      }
      if (payment.redirect_url) {
        openLink(payment.redirect_url)
        navigate(`/chat?order_id=${order.id}`, { replace: true })
        return
      }
      toast.error('Ошибка инициализации оплаты')
    } catch (e: any) {
      haptic.error()
      toast.error(e?.response?.data?.detail ?? 'Ошибка оплаты')
    } finally {
      setPaying(false)
    }
  }

  return (
    <div style={{ padding: '16px', maxWidth: 520, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
        Оплата заказа
      </h1>

      {/* Состав заказа */}
      <div style={{ background: 'var(--bg2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '14px 16px', marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--hint)', marginBottom: 8 }}>Заказ {order.order_number}</p>
        {order.items.map(it => (
          <p key={it.id} style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word', marginBottom: 4 }}>
            {it.product_name}{it.quantity > 1 ? ` × ${it.quantity}` : ''}
          </p>
        ))}
        {lot?.instruction && (
          <p style={{ fontSize: 13, color: 'var(--hint)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 6 }}>{lot.instruction}</p>
        )}
      </div>

      {/* Способ оплаты */}
      <p style={{ fontSize: 13, color: 'var(--hint)', marginBottom: 8 }}>Способ оплаты</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {PAYMENT_METHODS.map(m => {
          const active = method === m.id
          const price = quote ? quote[group(m.id)] : null
          return (
            <button key={m.id} type="button"
              onClick={() => { setMethod(m.id); haptic.impact('light') }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14,
                background: active ? 'rgba(45,88,173,0.16)' : 'var(--bg2)',
                border: active ? '1px solid rgba(45,88,173,0.6)' : '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text)', textAlign: 'left', cursor: 'pointer',
              }}>
              <span style={{ color: active ? '#6b9de8' : 'var(--hint)' }}>{m.icon}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{m.label}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--hint)' }}>{m.description}</span>
              </span>
              {price != null && (
                <span style={{ fontSize: 14, fontWeight: 700, color: '#93b8f0' }}>{fmtPrice(price)} ₽</span>
              )}
            </button>
          )
        })}
      </div>

      {method === 'crypto' && (
        <p style={{ fontSize: 11, color: 'var(--hint)', textAlign: 'center', marginBottom: 16 }}>
          Монета и сеть выбираются на странице оплаты
        </p>
      )}

      {insufficient && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', marginBottom: 12 }}>
          <AlertCircle size={16} style={{ color: '#f87171', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#fca5a5' }}>Недостаточно средств на балансе</span>
        </div>
      )}

      <button type="button" onClick={handlePay} disabled={paying || !!insufficient}
        style={{
          width: '100%', padding: '14px', borderRadius: 14, border: 'none',
          background: (paying || insufficient) ? 'rgba(45,88,173,0.4)' : 'linear-gradient(135deg, #2563eb, #2d58ad)',
          color: '#fff', fontSize: 15, fontWeight: 700, cursor: (paying || insufficient) ? 'not-allowed' : 'pointer',
        }}>
        {paying ? 'Оплата…' : `Оплатить ${fmtPrice(payTotal)} ₽`}
      </button>
    </div>
  )
}
