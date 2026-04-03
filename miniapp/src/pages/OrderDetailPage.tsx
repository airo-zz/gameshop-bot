// src/pages/OrderDetailPage.tsx
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ordersApi } from '@/api'
import { CheckCircle, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTelegram } from '@/hooks/useTelegram'

const STATUS_INFO: Record<string, { label: string; color: string; bg: string; border: string; emoji: string }> = {
  new:             { label: 'Новый',           color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)', emoji: '🆕' },
  pending_payment: { label: 'Ожидает оплаты',  color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)',  emoji: '⏳' },
  paid:            { label: 'Оплачен',          color: '#818cf8', bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.2)',  emoji: '💳' },
  processing:      { label: 'В обработке',      color: '#a78bfa', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.2)',  emoji: '⚙️' },
  clarification:   { label: 'Нужно уточнение', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)',  emoji: '❓' },
  completed:       { label: 'Выполнен',         color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)',   emoji: '✅' },
  cancelled:       { label: 'Отменён',          color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)',   emoji: '❌' },
  dispute:         { label: 'Спор',             color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)',  emoji: '⚠️' },
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const isSuccess = searchParams.get('success') === '1'
  const { haptic } = useTelegram()

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.get(id!),
    enabled: !!id,
    refetchInterval: (data) =>
      data && ['completed', 'cancelled'].includes(data.status) ? false : 5000,
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    haptic.success()
    toast.success('Скопировано!')
  }

  if (isLoading) return (
    <div className="px-4 pt-5 space-y-3">
      <div className="skeleton h-36 rounded-2xl" />
      <div className="skeleton h-52 rounded-2xl" />
      <div className="skeleton h-24 rounded-2xl" />
    </div>
  )
  if (!order) return null

  const si = STATUS_INFO[order.status] ?? {
    label: order.status, color: 'var(--hint)',
    bg: 'var(--bg2)', border: 'var(--border)', emoji: '📋',
  }

  return (
    <div className="px-4 pt-5 pb-6 space-y-4 animate-slide-up">
      {/* Успешная оплата */}
      {isSuccess && (
        <div
          className="flex flex-col items-center py-7 gap-3 rounded-2xl animate-slide-up"
          style={{
            background: 'rgba(34,197,94,0.07)',
            border: '1px solid rgba(34,197,94,0.2)',
          }}
        >
          <CheckCircle size={52} color="#22c55e" />
          <div className="text-center">
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
              Оплата прошла!
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--hint)' }}>
              Заказ принят в обработку
            </p>
          </div>
        </div>
      )}

      {/* Статус */}
      <div
        className="rounded-2xl p-5 text-center"
        style={{
          background: si.bg,
          border: `1px solid ${si.border}`,
        }}
      >
        <p className="text-4xl mb-2">{si.emoji}</p>
        <p className="font-bold text-base" style={{ color: si.color }}>
          {si.label}
        </p>
        <p className="text-xs mt-1.5" style={{ color: 'var(--hint)' }}>
          Заказ {order.order_number}
        </p>
      </div>

      {/* Позиции */}
      <div className="card space-y-4">
        <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>
          Состав заказа
        </p>
        {order.items.map(item => (
          <div key={item.id}>
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  {item.product_name}
                </p>
                {item.lot_name && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>
                    {item.lot_name}
                  </p>
                )}
                <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>
                  {item.quantity} шт. × {item.unit_price.toLocaleString('ru')} ₽
                </p>
              </div>
              <p className="font-bold text-sm flex-shrink-0" style={{ color: '#818cf8' }}>
                {item.total_price.toLocaleString('ru')} ₽
              </p>
            </div>

            {/* Данные выдачи */}
            {item.delivered_at && item.delivery_data && (
              <div
                className="mt-3 p-3 rounded-xl"
                style={{
                  background: 'rgba(34,197,94,0.06)',
                  border: '1px solid rgba(34,197,94,0.2)',
                }}
              >
                <p className="text-xs font-bold mb-2" style={{ color: '#22c55e' }}>
                  ✅ Данные получены
                </p>
                {Array.isArray((item.delivery_data as any).keys)
                  ? (item.delivery_data as any).keys.map((key: string, idx: number) => (
                      <div key={idx} className="flex items-center justify-between gap-2 mt-1.5">
                        <code
                          className="text-xs flex-1 break-all font-mono"
                          style={{ color: 'var(--text)' }}
                        >
                          {key}
                        </code>
                        <button
                          onClick={() => copyToClipboard(key)}
                          className="p-1.5 rounded-lg transition-all active:scale-90"
                          style={{
                            background: 'rgba(99,102,241,0.1)',
                            border: '1px solid rgba(99,102,241,0.2)',
                          }}
                        >
                          <Copy size={13} style={{ color: 'var(--accent)' }} />
                        </button>
                      </div>
                    ))
                  : (
                      <p className="text-xs font-mono" style={{ color: 'var(--text)' }}>
                        {JSON.stringify(item.delivery_data)}
                      </p>
                    )
                }
              </div>
            )}
          </div>
        ))}

        <div className="divider" />
        {order.discount_amount > 0 && (
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--hint)' }}>Скидка</span>
            <span style={{ color: '#22c55e' }}>-{order.discount_amount.toLocaleString('ru')} ₽</span>
          </div>
        )}
        <div className="flex justify-between font-bold">
          <span style={{ color: 'var(--text)' }}>Итого</span>
          <span style={{ color: '#818cf8' }}>{order.total_amount.toLocaleString('ru')} ₽</span>
        </div>
      </div>

      {/* Даты */}
      <div className="card space-y-2.5 text-sm">
        <div className="flex justify-between">
          <span style={{ color: 'var(--hint)' }}>Создан</span>
          <span style={{ color: 'var(--text)' }}>
            {new Date(order.created_at).toLocaleDateString('ru', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            })}
          </span>
        </div>
        {order.completed_at && (
          <div className="flex justify-between">
            <span style={{ color: 'var(--hint)' }}>Выполнен</span>
            <span style={{ color: '#22c55e' }}>
              {new Date(order.completed_at).toLocaleDateString('ru', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
              })}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
