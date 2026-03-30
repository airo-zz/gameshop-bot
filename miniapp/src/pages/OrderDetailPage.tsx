// src/pages/OrderDetailPage.tsx
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ordersApi } from '@/api'
import { CheckCircle, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTelegram } from '@/hooks/useTelegram'

const STATUS_LABEL: Record<string, { label: string; color: string; emoji: string }> = {
  new:             { label: 'Новый',            color: '#6b7280', emoji: '🆕' },
  pending_payment: { label: 'Ожидает оплаты',   color: '#f59e0b', emoji: '⏳' },
  paid:            { label: 'Оплачен',           color: '#3b82f6', emoji: '💚' },
  processing:      { label: 'В обработке',       color: '#8b5cf6', emoji: '⚙️' },
  clarification:   { label: 'Нужно уточнение',  color: '#f59e0b', emoji: '❓' },
  completed:       { label: 'Выполнен',          color: '#10b981', emoji: '✅' },
  cancelled:       { label: 'Отменён',           color: '#ef4444', emoji: '❌' },
  dispute:         { label: 'Спор',              color: '#f59e0b', emoji: '⚠️' },
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
    <div className="px-4 pt-4 space-y-3">
      <div className="skeleton h-32 rounded-2xl" />
      <div className="skeleton h-48 rounded-2xl" />
    </div>
  )
  if (!order) return null

  const statusInfo = STATUS_LABEL[order.status] ?? { label: order.status, color: 'var(--hint)', emoji: '📋' }

  return (
    <div className="px-4 pt-4 pb-6 space-y-4 animate-slide-up">
      {/* Успешная оплата */}
      {isSuccess && (
        <div className="flex flex-col items-center py-6 gap-2 animate-slide-up">
          <CheckCircle size={56} color="#10b981" />
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Оплата прошла!</h2>
          <p className="text-sm" style={{ color: 'var(--hint)' }}>Заказ принят в обработку</p>
        </div>
      )}

      {/* Статус */}
      <div className="card text-center">
        <p className="text-3xl mb-1">{statusInfo.emoji}</p>
        <p className="font-bold text-base" style={{ color: statusInfo.color }}>
          {statusInfo.label}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--hint)' }}>
          Заказ {order.order_number}
        </p>
      </div>

      {/* Позиции */}
      <div className="card space-y-3">
        <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Состав заказа</p>
        {order.items.map(item => (
          <div key={item.id}>
            <div className="flex justify-between items-start">
              <div className="flex-1 mr-2">
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  {item.product_name}
                </p>
                {item.lot_name && (
                  <p className="text-xs" style={{ color: 'var(--hint)' }}>{item.lot_name}</p>
                )}
                <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>
                  {item.quantity} шт. × {item.unit_price.toLocaleString('ru')} ₽
                </p>
              </div>
              <p className="font-bold text-sm flex-shrink-0" style={{ color: 'var(--text)' }}>
                {item.total_price.toLocaleString('ru')} ₽
              </p>
            </div>

            {/* Данные выдачи */}
            {item.delivered_at && item.delivery_data && (
              <div className="mt-2 p-3 rounded-xl" style={{ background: 'var(--bg)' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: '#10b981' }}>
                  ✅ Данные получены
                </p>
                {Array.isArray((item.delivery_data as any).keys)
                  ? (item.delivery_data as any).keys.map((key: string, idx: number) => (
                      <div key={idx} className="flex items-center justify-between gap-2 mt-1">
                        <code className="text-xs flex-1 break-all" style={{ color: 'var(--text)' }}>
                          {key}
                        </code>
                        <button onClick={() => copyToClipboard(key)}>
                          <Copy size={14} style={{ color: 'var(--hint)' }} />
                        </button>
                      </div>
                    ))
                  : <p className="text-xs" style={{ color: 'var(--text)' }}>
                      {JSON.stringify(item.delivery_data)}
                    </p>
                }
              </div>
            )}
          </div>
        ))}

        <div className="h-px" style={{ background: 'var(--bg)' }} />
        {order.discount_amount > 0 && (
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--hint)' }}>Скидка</span>
            <span style={{ color: '#10b981' }}>-{order.discount_amount.toLocaleString('ru')} ₽</span>
          </div>
        )}
        <div className="flex justify-between font-bold">
          <span style={{ color: 'var(--text)' }}>Итого</span>
          <span style={{ color: 'var(--btn)' }}>{order.total_amount.toLocaleString('ru')} ₽</span>
        </div>
      </div>

      {/* Даты */}
      <div className="card space-y-2 text-sm">
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
            <span style={{ color: '#10b981' }}>
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
