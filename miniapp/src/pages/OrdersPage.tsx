// src/pages/OrdersPage.tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Package, ChevronRight } from 'lucide-react'
import { ordersApi } from '@/api'

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
  completed:  '#34d399',
  cancelled:  '#f87171',
  dispute:    '#fbbf24',
  paid:       '#60a5fa',
  processing: '#a78bfa',
}

export default function OrdersPage() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.list(),
  })

  if (isLoading) return (
    <div className="px-4 pt-5 space-y-2">
      {Array(5).fill(0).map((_, i) => <div key={i} className="skeleton h-[76px] rounded-2xl" />)}
    </div>
  )

  return (
    <div className="px-4 pt-5 pb-4 space-y-3 animate-fade-in">
      <h1 className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>📋 Мои заказы</h1>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-5">
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
          >
            <Package size={40} style={{ color: 'var(--hint)' }} />
          </div>
          <div className="text-center">
            <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Заказов пока нет</p>
            <p className="text-sm" style={{ color: 'var(--hint)' }}>Перейди в каталог и сделай первый заказ</p>
          </div>
          <Link to="/catalog" className="btn-primary" style={{ maxWidth: 200 }}>В каталог</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map(order => (
            <Link
              key={order.id}
              to={`/orders/${order.id}`}
              className="flex items-center gap-3 p-4 rounded-2xl active:scale-[0.98] transition-transform"
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>
                    {order.order_number}
                  </p>
                  <p className="font-bold text-sm" style={{ color: '#60a5fa' }}>
                    {order.total_amount.toLocaleString('ru')} ₽
                  </p>
                </div>
                <p className="text-xs font-medium"
                   style={{ color: STATUS_COLOR[order.status] ?? 'var(--hint)' }}>
                  {STATUS_LABEL[order.status] ?? order.status}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>
                  {new Date(order.created_at).toLocaleDateString('ru', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                  })}
                </p>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--hint)' }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
