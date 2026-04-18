// src/pages/OrdersPage.tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
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
}

const STATUS_COLOR: Record<string, string> = {
  completed:     '#34d399',
  cancelled:     '#f87171',
  clarification: '#fbbf24',
  paid:          '#60a5fa',
  processing:    '#6b9de8',
}

export default function OrdersPage() {
  const { data: rawOrders = [], isError, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.list(),
    staleTime: 30_000,
  })

  // Скрываем неоплаченные заказы (new, pending_payment)
  const orders = rawOrders.filter(o => o.status !== 'new' && o.status !== 'pending_payment')

  if (isError) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p className="text-sm mb-4" style={{ color: 'var(--hint)' }}>Не удалось загрузить данные</p>
      <button
        type="button"
        onClick={() => refetch()}
        className="px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-95"
        style={{ background: 'rgba(45,88,173,0.16)', border: '1px solid rgba(45,88,173,0.38)', color: '#6b9de8' }}
      >
        Повторить
      </button>
    </div>
  )

  return (
    <motion.div
      className="px-4 pt-5 pb-4 space-y-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <h1 className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>Мои заказы</h1>

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
                  <p className="font-bold text-sm" style={{ color: '#6b9de8' }}>
                    {order.total_amount.toLocaleString('ru')} ₽
                  </p>
                </div>
                <p className="text-xs font-medium flex items-center"
                   style={{ color: STATUS_COLOR[order.status] ?? 'var(--hint)' }}>
                  <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[order.status] ?? 'rgba(255,255,255,0.3)', marginRight: 6, flexShrink: 0 }} />
                  {STATUS_LABEL[order.status] ?? order.status}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>
                  {new Date(order.created_at).toLocaleDateString('ru', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                  })}
                  {(order.items_count ?? order.items?.length ?? 0) > 0 && (() => {
                    const n = order.items_count ?? order.items?.length ?? 0
                    return <span style={{ marginLeft: 6 }}>&middot; {n} {n === 1 ? 'позиция' : n < 5 ? 'позиции' : 'позиций'}</span>
                  })()}
                </p>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--hint)' }} />
            </Link>
          ))}
        </div>
      )}
    </motion.div>
  )
}
