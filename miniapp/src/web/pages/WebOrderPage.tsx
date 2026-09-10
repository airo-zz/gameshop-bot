/**
 * src/web/pages/WebOrderPage.tsx
 * Страница заказа на сайте: статус, состав, выданные данные/инструкция.
 * Пока заказ ждёт оплаты — периодически обновляем статус (webhook подтвердит).
 */

import { useSearchParams, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock, Loader2, XCircle, RotateCcw } from 'lucide-react'
import { ordersApi } from '@/api'
import { SUPPORT_BOT_URL } from '@/config/appTarget'

function money(v: number) {
  return Number(v).toLocaleString('ru-RU') + ' ₽'
}

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: 'Ожидает оплаты', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  pending_payment: { label: 'Ожидает оплаты', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  paid: { label: 'Оплачен', color: '#6b9de8', bg: 'rgba(45,88,173,0.15)' },
  processing: { label: 'В обработке', color: '#6b9de8', bg: 'rgba(45,88,173,0.15)' },
  clarification: { label: 'Требуется уточнение', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  completed: { label: 'Выполнен', color: '#34d399', bg: 'rgba(16,185,129,0.12)' },
  cancelled: { label: 'Отменён', color: '#f87171', bg: 'rgba(239,68,68,0.12)' },
  refunded: { label: 'Возврат', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
}

export default function WebOrderPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const justPaid = searchParams.get('success') === '1'

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['web', 'order', id],
    queryFn: () => ordersApi.get(id!),
    enabled: !!id,
    // Пока ждём оплаты — опрашиваем статус
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.status
      return s === 'new' || s === 'pending_payment' ? 4000 : false
    },
  })

  if (isLoading) {
    return <div className="web-container py-24 text-center text-sm text-white/40">Загрузка заказа...</div>
  }
  if (isError || !order) {
    return (
      <div className="web-container py-24 text-center">
        <XCircle size={36} className="text-white/30 mx-auto mb-4" />
        <p className="text-sm text-white/50 mb-5">Заказ не найден</p>
        <Link to="/catalog" className="text-sm" style={{ color: 'var(--link)' }}>В каталог</Link>
      </div>
    )
  }

  const st = STATUS[order.status] ?? { label: order.status, color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' }
  const awaitingPayment = order.status === 'new' || order.status === 'pending_payment'

  return (
    <div className="web-container py-8 md:py-12 max-w-2xl">
      {justPaid && (
        <div className="flex items-center gap-3 rounded-2xl p-4 mb-6" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <CheckCircle2 size={22} style={{ color: '#34d399' }} />
          <div>
            <p className="text-sm font-semibold text-white">Оплата прошла</p>
            <p className="text-xs text-white/50">Заказ принят в обработку.</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Заказ {order.order_number}</h1>
          <p className="text-xs text-white/40 mt-1">{new Date(order.created_at).toLocaleString('ru-RU')}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full" style={{ background: st.bg, color: st.color }}>
          {awaitingPayment ? <Clock size={14} /> : order.status === 'completed' ? <CheckCircle2 size={14} /> : <Loader2 size={14} />}
          {st.label}
        </span>
      </div>

      {/* Состав */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
        {order.items?.map((item) => (
          <div key={item.id} className="pb-3 border-b border-white/[0.05] last:border-0 last:pb-0">
            <div className="flex justify-between text-sm">
              <span className="text-white/85 flex-1 mr-3">{item.product_name} × {item.quantity}</span>
              <span className="text-white font-medium shrink-0">{money(item.total_price)}</span>
            </div>
            {item.instruction && (
              <p className="text-xs text-white/50 mt-2 whitespace-pre-wrap">{item.instruction}</p>
            )}
            {item.delivery_data && Object.keys(item.delivery_data).length > 0 && (
              <div className="mt-2 rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5 space-y-1">
                {Object.entries(item.delivery_data).map(([k, v]) => (
                  <div key={k} className="text-xs text-white/70 break-all"><span className="text-white/40">{k}:</span> {String(v)}</div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="flex justify-between text-base font-bold pt-1">
          <span className="text-white">Итого</span>
          <span style={{ color: 'var(--link)' }}>{money(order.total_amount)}</span>
        </div>
      </div>

      {awaitingPayment && (
        <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4 flex items-start gap-3">
          <Clock size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-amber-200">Ожидаем подтверждение оплаты. Статус обновится автоматически.</p>
            <button
              onClick={() => ordersApi.pay(order.id).then((p) => p.redirect_url && window.open(p.redirect_url, '_blank', 'noopener'))}
              className="inline-flex items-center gap-1.5 text-xs font-semibold mt-2.5 text-amber-300 hover:text-amber-200"
            >
              <RotateCcw size={13} /> Оплатить ещё раз
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link to="/catalog" style={{ color: 'var(--link)' }}>← В каталог</Link>
        <a href={SUPPORT_BOT_URL} target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white transition-colors">
          Нужна помощь?
        </a>
      </div>
    </div>
  )
}
