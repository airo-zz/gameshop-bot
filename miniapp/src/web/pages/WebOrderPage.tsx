/**
 * src/web/pages/WebOrderPage.tsx
 * Страница заказа на сайте: статус, состав, выданные данные/инструкция.
 * Пока заказ ждёт оплаты — периодически обновляем статус (webhook подтвердит).
 */

import { useSearchParams, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock, Loader2, XCircle, RotateCcw } from '@/components/ui/icons'
import { PenLoader } from '@/components/brand/BrandMotion'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { ordersApi } from '@/api'
import { PAY_SOURCE } from '@/config/appTarget'
import { openChat } from '@/web/chat/chatStore'
import { OrderReviewForm } from '@/components/reviews/Reviews'
import { money, orderStatus, isAwaitingPayment, apiError } from '@/web/format'

export default function WebOrderPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const justPaid = searchParams.get('success') === '1'
  // ?review=1 — пришли по кнопке «Оставить отзыв» из уведомления
  const wantReview = searchParams.get('review') === '1'
  const [repaying, setRepaying] = useState(false)

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

  async function repay() {
    if (!id || repaying) return
    setRepaying(true)
    try {
      // use_balance: сохраняем доплату с баланса (холд заказа), если она была
      const p = await ordersApi.pay(id, { source: PAY_SOURCE, use_balance: true })
      if (p.success) {
        window.location.reload()
        return
      }
      if (p.redirect_url) {
        window.location.href = p.redirect_url
        return
      }
      toast.error('Не удалось открыть оплату')
    } catch (e) {
      toast.error(apiError(e, 'Не удалось открыть оплату'))
    } finally {
      setRepaying(false)
    }
  }

  if (isLoading) {
    return <div className="web-container py-24 text-center text-sm text-[var(--hint)]">Загрузка заказа...</div>
  }
  if (isError || !order) {
    return (
      <div className="web-container py-24 text-center">
        <XCircle size={36} className="text-[var(--hint)] mx-auto mb-4" />
        <p className="text-sm text-[var(--hint)] mb-5">Заказ не найден</p>
        <Link to="/catalog" className="text-sm" style={{ color: 'var(--link)' }}>В каталог</Link>
      </div>
    )
  }

  const st = orderStatus(order.status)
  const awaitingPayment = isAwaitingPayment(order.status)

  return (
    <div className="web-container py-8 md:py-12 max-w-2xl">
      {justPaid && !awaitingPayment && order.status !== 'cancelled' && (
        <div className="flex items-center gap-3 rounded-2xl p-4 mb-6" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid transparent' }}>
          <CheckCircle2 size={22} style={{ color: '#34d399' }} />
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Оплата прошла</p>
            <p className="text-xs text-[var(--hint)]">
              {order.status === 'completed' ? 'Заказ выполнен — данные ниже.' : 'Заказ принят в обработку. Статус обновится на этой странице, вопросы — в чате с оператором.'}
            </p>
          </div>
        </div>
      )}
      {justPaid && awaitingPayment && (
        <div className="flex items-center gap-3 rounded-2xl p-4 mb-6" style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid transparent' }}>
          <PenLoader size={28} label="Проверяем оплату" />
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Проверяем оплату</p>
            <p className="text-xs text-[var(--hint)]">Обычно это занимает до минуты — статус обновится сам.</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text)]">Заказ {order.order_number}</h1>
          <p className="text-xs text-[var(--hint)] mt-1">{new Date(order.created_at).toLocaleString('ru-RU')}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full" style={{ background: st.bg, color: st.color }}>
          {awaitingPayment ? <Clock size={14} /> : order.status === 'completed' ? <CheckCircle2 size={14} /> : <Loader2 size={14} />}
          {st.label}
        </span>
      </div>

      {/* Состав */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg2)] p-5 space-y-3">
        {order.items?.map((item) => (
          <div key={item.id} className="pb-3 border-b border-[var(--border)] last:border-0 last:pb-0">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-2)] flex-1 mr-3">{item.product_name} × {item.quantity}</span>
              <span className="text-[var(--text)] font-medium shrink-0">{money(item.total_price)}</span>
            </div>
            {item.instruction && (
              <p className="text-xs text-[var(--hint)] mt-2 whitespace-pre-wrap">{item.instruction}</p>
            )}
            {item.delivery_data && Object.keys(item.delivery_data).length > 0 && (
              <div className="mt-2 rounded-lg bg-[var(--bg2)] border border-[var(--border)] p-2.5 space-y-1">
                {Object.entries(item.delivery_data).map(([k, v]) => (
                  <div key={k} className="text-xs text-[var(--text-2)] break-all"><span className="text-[var(--hint)]">{k}:</span> {String(v)}</div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="flex justify-between text-base font-bold pt-1">
          <span className="text-[var(--text)]">Итого</span>
          <span style={{ color: 'var(--link)' }}>{money(order.total_amount)}</span>
        </div>
      </div>

      {awaitingPayment && (
        <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4 flex items-start gap-3">
          <Clock size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-amber-200">Ожидаем подтверждение оплаты. Статус обновится автоматически.</p>
            <button
              onClick={repay}
              disabled={repaying}
              className="inline-flex items-center gap-1.5 text-xs font-semibold mt-2.5 text-amber-300 hover:text-amber-200 disabled:opacity-50"
            >
              <RotateCcw size={13} /> {repaying ? 'Открываем оплату...' : 'Перейти к оплате'}
            </button>
          </div>
        </div>
      )}

      {order.status === 'completed' && (
        <div className="mt-5">
          <OrderReviewForm orderId={order.id} gameHref={(slug) => `/game/${slug}`} autoFocus={wantReview} />
        </div>
      )}

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link to="/orders" style={{ color: 'var(--link)' }}>← Мои заказы</Link>
        <button
          type="button"
          onClick={() => openChat({ prefill: `Вопрос по заказу ${order.order_number}: ` })}
          className="text-[var(--hint)] hover:text-[var(--text)] transition-colors"
        >
          Написать оператору
        </button>
      </div>
    </div>
  )
}
