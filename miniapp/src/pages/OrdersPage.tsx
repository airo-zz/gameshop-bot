// src/pages/OrdersPage.tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Package, ChevronRight } from 'lucide-react'
import { ordersApi } from '@/api'

const STATUS_LABEL: Record<string, string> = {
  new:             'Новый',
  pending_payment: 'Ожидает оплаты',
  paid:            'Оплачен',
  processing:      'В обработке',
  clarification:   'Уточнение',
  completed:       'Выполнен',
  cancelled:       'Отменён',
  dispute:         'Спор',
}

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  completed:       { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',    border: 'rgba(34,197,94,0.2)' },
  cancelled:       { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.2)' },
  dispute:         { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.2)' },
  paid:            { color: '#818cf8', bg: 'rgba(99,102,241,0.1)',   border: 'rgba(99,102,241,0.2)' },
  processing:      { color: '#a78bfa', bg: 'rgba(139,92,246,0.1)',   border: 'rgba(139,92,246,0.2)' },
  pending_payment: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.15)' },
  new:             { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.15)' },
}

export default function OrdersPage() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.list(),
  })

  if (isLoading) return (
    <div className="px-4 pt-5 space-y-3">
      {Array(5).fill(0).map((_, i) => (
        <div key={i} className="skeleton h-[72px] rounded-2xl" />
      ))}
    </div>
  )

  return (
    <div className="px-4 pt-5 space-y-3 animate-fade-in">
      <h1 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        📋 Мои заказы
      </h1>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-5">
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center"
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
            }}
          >
            <Package size={44} style={{ color: 'var(--hint)' }} />
          </div>
          <div className="text-center">
            <p className="font-semibold" style={{ color: 'var(--text)' }}>Заказов пока нет</p>
            <p className="text-sm mt-1" style={{ color: 'var(--hint)' }}>
              Сделай первый заказ в каталоге
            </p>
          </div>
          <Link to="/catalog" className="btn-primary" style={{ maxWidth: 220 }}>
            В каталог
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map(order => {
            const st = STATUS_STYLE[order.status] ?? STATUS_STYLE.new
            return (
              <Link
                key={order.id}
                to={`/orders/${order.id}`}
                className="flex items-center gap-3 p-4 rounded-2xl active:scale-[0.98] transition-all duration-200"
                style={{
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>
                      {order.order_number}
                    </p>
                    <p className="font-bold text-sm flex-shrink-0" style={{ color: '#818cf8' }}>
                      {order.total_amount.toLocaleString('ru')} ₽
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        color: st.color,
                        background: st.bg,
                        border: `1px solid ${st.border}`,
                      }}
                    >
                      {STATUS_LABEL[order.status] ?? order.status}
                    </span>
                    <p className="text-xs" style={{ color: 'var(--hint)' }}>
                      {new Date(order.created_at).toLocaleDateString('ru', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--hint)', flexShrink: 0 }} />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
