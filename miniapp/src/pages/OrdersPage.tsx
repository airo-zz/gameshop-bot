// src/pages/OrdersPage.tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Package, ChevronRight } from 'lucide-react'
import { ordersApi, type Order } from '@/api'

const STATUS_LABEL: Record<string, string> = {
  new:             '🆕 Новый',
  pending_payment: '⏳ Ожидает оплаты',
  paid:            '💚 Оплачен',
  processing:      '⚙️ В обработке',
  clarification:   '❓ Уточнение',
  completed:       '✅ Выполнен',
  cancelled:       '❌ Отменён',
  dispute:         '⚠️ Спор',
}
const STATUS_COLOR: Record<string, string> = {
  completed:  '#10b981',
  cancelled:  '#ef4444',
  dispute:    '#f59e0b',
  paid:       '#3b82f6',
  processing: '#8b5cf6',
}

export default function OrdersPage() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.list(),
  })

  if (isLoading) return (
    <div className="px-4 pt-4 space-y-3">
      {Array(5).fill(0).map((_, i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
    </div>
  )

  return (
    <div className="px-4 pt-4 space-y-3 animate-fade-in">
      <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>📋 Мои заказы</h1>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Package size={56} style={{ color: 'var(--bg2)' }} />
          <p style={{ color: 'var(--hint)' }}>Заказов пока нет</p>
          <Link to="/catalog" className="btn-primary" style={{ maxWidth: 200 }}>В каталог</Link>
        </div>
      ) : (
        orders.map(order => (
          <Link
            key={order.id}
            to={`/orders/${order.id}`}
            className="flex items-center gap-3 p-4 rounded-2xl active:scale-98 transition-transform"
            style={{ background: 'var(--bg2)' }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>
                  {order.order_number}
                </p>
                <p className="font-bold text-sm" style={{ color: 'var(--btn)' }}>
                  {order.total_amount.toLocaleString('ru')} ₽
                </p>
              </div>
              <p
                className="text-xs mt-1"
                style={{ color: STATUS_COLOR[order.status] ?? 'var(--hint)' }}
              >
                {STATUS_LABEL[order.status] ?? order.status}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>
                {new Date(order.created_at).toLocaleDateString('ru', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                })}
              </p>
            </div>
            <ChevronRight size={18} style={{ color: 'var(--hint)' }} />
          </Link>
        ))
      )}
    </div>
  )
}
