// src/pages/OrderDetailPage.tsx
import React from 'react'
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ordersApi, chatApi } from '@/api'
import { CheckCircle, Clock, Copy, MessageCircle, XCircle, HelpCircle, RefreshCw, BadgeCheck, Circle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTelegram } from '@/hooks/useTelegram'

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  new:             { label: 'Новый',           color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', Icon: Circle },
  pending_payment: { label: 'Ожидает оплаты',  color: '#fbbf24', bg: 'rgba(245,158,11,0.1)',  Icon: Clock },
  paid:            { label: 'Оплачен',          color: '#6b9de8', bg: 'rgba(45,88,173,0.12)',  Icon: BadgeCheck },
  processing:      { label: 'В обработке',      color: '#6b9de8', bg: 'rgba(139,92,246,0.1)',  Icon: RefreshCw },
  clarification:   { label: 'Нужно уточнение', color: '#fbbf24', bg: 'rgba(245,158,11,0.1)',  Icon: HelpCircle },
  completed:       { label: 'Выполнен',         color: '#34d399', bg: 'rgba(16,185,129,0.1)',  Icon: CheckCircle },
  cancelled:       { label: 'Отменён',          color: '#f87171', bg: 'rgba(239,68,68,0.1)',   Icon: XCircle },
}

const SUPPORT_STATUSES = new Set(['clarification', 'paid'])

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isSuccess = searchParams.get('success') === '1'
  const { haptic } = useTelegram()

  async function handleChatClick() {
    await Promise.all([
      import('@/pages/ChatPage'),
      queryClient.getQueryData(['chat'])
        ? Promise.resolve()
        : queryClient.prefetchQuery({ queryKey: ['chat'], queryFn: chatApi.getOrCreate, staleTime: Infinity }),
      queryClient.getQueryData(['chat-messages'])
        ? Promise.resolve()
        : queryClient.prefetchQuery({ queryKey: ['chat-messages'], queryFn: () => chatApi.getMessages() }),
    ])
    navigate('/chat')
  }

  const isPending = searchParams.get('pending') === '1'

  const { data: order } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.get(id!),
    enabled: !!id,
    staleTime: 5_000,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status) return 5_000
      if (['completed', 'cancelled'].includes(status)) return false
      // Для ожидающих оплаты крипто-заказов — опрашиваем чаще
      if (status === 'pending_payment') return 4_000
      return 8_000
    },
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    haptic.success()
    toast.success('Скопировано!')
  }

  if (!order) return (
    <div className="flex flex-col items-center py-20 gap-4 px-4">
      <p className="font-semibold" style={{ color: 'var(--text)' }}>Заказ не найден</p>
      <Link to="/orders" className="btn-primary" style={{ maxWidth: 200 }}>К заказам</Link>
    </div>
  )

  const statusInfo = STATUS_LABEL[order.status] ?? { label: order.status, color: 'var(--hint)', bg: 'var(--bg2)', Icon: Circle }

  return (
    <div className="px-4 pt-5 pb-6 space-y-4 animate-slide-up">
      {/* Успешная оплата (баланс / карта) */}
      {isSuccess && (
        <div
          className="flex flex-col items-center py-6 gap-3 rounded-2xl animate-slide-up"
          style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}
        >
          <CheckCircle size={48} style={{ color: '#34d399' }} />
          <div className="text-center">
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Оплата прошла!</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--hint)' }}>Заказ принят в обработку</p>
          </div>
        </div>
      )}

      {/* Ожидание крипто-оплаты */}
      {isPending && order?.status === 'pending_payment' && (
        <div
          className="flex items-start gap-3 py-4 px-4 rounded-2xl animate-slide-up"
          style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}
        >
          <Clock size={20} className="flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
          <div>
            <p className="font-semibold text-sm" style={{ color: '#fbbf24' }}>Ожидаем подтверждения оплаты</p>
            <p className="text-xs mt-1" style={{ color: 'var(--hint)' }}>
              После оплаты в CryptoBot статус обновится автоматически — можешь не закрывать эту страницу.
            </p>
          </div>
        </div>
      )}

      {/* Крипто-оплата подтверждена */}
      {isPending && order?.status === 'paid' && (
        <div
          className="flex flex-col items-center py-6 gap-3 rounded-2xl animate-slide-up"
          style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}
        >
          <CheckCircle size={48} style={{ color: '#34d399' }} />
          <div className="text-center">
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Оплата получена!</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--hint)' }}>Заказ принят в обработку</p>
          </div>
        </div>
      )}

      {/* Статус */}
      <div
        className="rounded-2xl p-5 text-center"
        style={{ background: statusInfo.bg, border: `1px solid ${statusInfo.color}33` }}
      >
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${statusInfo.color}22`, border: `1.5px solid ${statusInfo.color}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
          <statusInfo.Icon size={26} style={{ color: statusInfo.color }} />
        </div>
        <p className="font-bold text-base" style={{ color: statusInfo.color }}>{statusInfo.label}</p>
        <div className="flex items-center justify-center gap-2 mt-1">
          <p className="text-xs" style={{ color: 'var(--hint)' }}>Заказ {order.order_number}</p>
          <button
            type="button"
            onClick={() => copyToClipboard(order.order_number)}
            className="p-1 rounded-lg active:scale-90 transition-transform"
            style={{ background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer' }}
          >
            <Copy size={11} style={{ color: 'var(--hint)' }} />
          </button>
        </div>
      </div>

      {/* Позиции */}
      <div className="card space-y-4">
        <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Состав заказа</p>
        {order.items.map(item => (
          <div key={item.id}>
            <div className="flex justify-between items-start">
              <div className="flex-1 mr-3">
                {item.game_name && (
                  <p className="text-[11px] font-medium mb-0.5" style={{ color: 'var(--hint)' }}>{item.game_name}</p>
                )}
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{item.product_name}</p>
                {item.lot_name && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>{item.lot_name}</p>
                )}
                <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>
                  {item.quantity} шт. × {item.unit_price.toLocaleString('ru')} ₽
                </p>
              </div>
              <p className="font-bold text-sm flex-shrink-0" style={{ color: '#6b9de8' }}>
                {item.total_price.toLocaleString('ru')} ₽
              </p>
            </div>

            {/* Данные выдачи */}
            {item.delivered_at && item.delivery_data && (
              <div
                className="mt-3 p-3 rounded-xl"
                style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
              >
                <p className="text-xs font-semibold mb-2" style={{ color: '#34d399' }}>
                  Данные получены
                </p>
                {Array.isArray((item.delivery_data as any).keys)
                  ? (item.delivery_data as any).keys.map((key: string, idx: number) => (
                      <div key={idx} className="flex items-center justify-between gap-2 mt-1">
                        <code className="text-xs flex-1 break-all" style={{ color: 'var(--text)' }}>{key}</code>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(key)}
                          className="p-1 rounded-lg transition-all active:scale-90"
                          style={{ background: 'var(--bg3)' }}
                        >
                          <Copy size={13} style={{ color: 'var(--hint)' }} />
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

        <div className="divider" />
        {order.discount_amount > 0 && (
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--hint)' }}>Скидка</span>
            <span style={{ color: '#34d399' }}>-{order.discount_amount.toLocaleString('ru')} ₽</span>
          </div>
        )}
        <div className="flex justify-between font-bold">
          <span style={{ color: 'var(--text)' }}>Итого</span>
          <span style={{ color: '#6b9de8' }}>{order.total_amount.toLocaleString('ru')} ₽</span>
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
            <span style={{ color: '#34d399' }}>
              {new Date(order.completed_at).toLocaleDateString('ru', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
              })}
            </span>
          </div>
        )}
      </div>

      {/* Кнопка поддержки для проблемных статусов */}
      {SUPPORT_STATUSES.has(order.status) && (
        <button
          type="button"
          onClick={handleChatClick}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm transition-all active:scale-95"
          style={{
            background: 'rgba(45,88,173,0.14)',
            border: '1px solid rgba(45,88,173,0.32)',
            color: '#6b9de8',
          }}
        >
          <MessageCircle size={17} />
          Написать в чат
        </button>
      )}
    </div>
  )
}
