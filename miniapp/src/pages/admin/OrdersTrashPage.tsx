/**
 * src/pages/admin/OrdersTrashPage.tsx
 * Корзина удалённых заказов — восстановление и окончательное удаление.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, AlertCircle, Trash2, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/api/admin'
import type { AdminOrderListItem } from '@/api/admin'
import { useTelegram } from '@/hooks/useTelegram'
import { fmtPrice } from '@/utils/format'

const STATUS_LABELS: Record<string, string> = {
  new:             'Новый',
  pending_payment: 'Ожидает оплаты',
  paid:            'Оплачен',
  processing:      'В работе',
  completed:       'Выполнен',
  cancelled:       'Отменён',
  refunded:        'Возврат',
}

const STATUS_COLORS: Record<string, string> = {
  new:             'bg-slate-500/15 text-slate-400',
  pending_payment: 'bg-yellow-500/15 text-yellow-400',
  paid:            'bg-blue-500/15 text-blue-400',
  processing:      'bg-violet-500/15 text-violet-400',
  completed:       'bg-emerald-500/15 text-emerald-400',
  cancelled:       'bg-red-500/15 text-red-400',
  refunded:        'bg-orange-500/15 text-orange-400',
}

function formatMoney(v: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(v)
}

function daysAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'сегодня'
  if (days === 1) return '1 день назад'
  if (days < 5) return `${days} дня назад`
  return `${days} дней назад`
}

type TrashOrderItem = AdminOrderListItem & { deleted_at?: string }

export default function OrdersTrashPage() {
  const [page, setPage] = useState(1)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const { haptic } = useTelegram()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'orders', 'trash', page],
    queryFn: () => adminApi.getTrashOrders(page, 20),
  })

  const restoreMutation = useMutation({
    mutationFn: (id: string) => adminApi.restoreOrder(id),
    onSuccess: () => {
      toast.success('Заказ восстановлен')
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders', 'trash'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
    },
    onError: () => {
      toast.error('Не удалось восстановить заказ')
    },
  })

  const forceDeleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.forceDeleteOrder(id),
    onSuccess: () => {
      toast.success('Заказ удалён навсегда')
      setConfirmId(null)
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders', 'trash'] })
    },
    onError: () => {
      toast.error('Не удалось удалить заказ')
      setConfirmId(null)
    },
  })

  function handleRestore(id: string) {
    haptic.impact('light')
    restoreMutation.mutate(id)
  }

  function handleForceDeleteRequest(id: string) {
    haptic.impact('medium')
    setConfirmId(id)
  }

  function handleForceDeleteConfirm() {
    if (!confirmId) return
    haptic.impact('medium')
    forceDeleteMutation.mutate(confirmId)
  }

  const items: TrashOrderItem[] = data?.items ?? []
  const total: number = data?.total ?? 0
  const pages: number = data?.pages ?? 1

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/admin/orders"
          className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors duration-200 active:scale-[0.97]"
        >
          <ArrowLeft size={16} />
          Заказы
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-bold text-white">Корзина заказов</h1>
        {data && (
          <p className="text-sm text-white/40 mt-0.5">Удалено: {total}</p>
        )}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
        <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300/80 leading-relaxed">
          Заказы хранятся 7 дней, затем удаляются автоматически
        </p>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-white/40 text-sm py-8 text-center">Загрузка...</p>
      ) : isError ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/40">
          <AlertCircle size={36} />
          <p className="text-sm">Ошибка загрузки корзины</p>
          <button
            onClick={() => refetch()}
            className="text-xs text-white/50 hover:text-white/70 active:scale-[0.98] transition-transform"
          >
            Попробовать снова
          </button>
        </div>
      ) : !items.length ? (
        <div className="flex flex-col items-center py-20 gap-3 text-white/25">
          <Trash2 size={44} strokeWidth={1.5} />
          <p className="text-sm">Корзина пуста</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((order) => (
            <div
              key={order.id}
              className="bg-[#1a1f2e] border border-white/[0.06] rounded-xl px-4 py-3.5 space-y-3"
            >
              {/* Order info row */}
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-mono font-medium text-white">
                      {order.order_number}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        STATUS_COLORS[order.status] ?? 'bg-white/10 text-white/50'
                      }`}
                    >
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-white/50">
                    <span>
                      {order.user_first_name}
                      {order.user_username ? ` @${order.user_username}` : ''}
                    </span>
                    <span>·</span>
                    <span>{order.items_count} поз.</span>
                    {order.deleted_at && (
                      <>
                        <span>·</span>
                        <span className="text-red-400/70">
                          удалён {daysAgo(order.deleted_at)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-white">
                    {formatMoney(order.total_amount)}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleRestore(order.id)}
                  disabled={restoreMutation.isPending && restoreMutation.variables === order.id}
                  className="flex items-center gap-1.5 flex-1 justify-center px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/15 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <RotateCcw size={13} />
                  Восстановить
                </button>
                <button
                  onClick={() => handleForceDeleteRequest(order.id)}
                  disabled={forceDeleteMutation.isPending && forceDeleteMutation.variables === order.id}
                  className="flex items-center gap-1.5 flex-1 justify-center px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/15 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Trash2 size={13} />
                  Удалить навсегда
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="px-4 py-2 rounded-xl bg-white/[0.05] text-sm text-white/60 disabled:opacity-30 hover:bg-white/[0.08] active:scale-[0.98] transition-all duration-200"
          >
            Назад
          </button>
          <span className="text-xs text-white/30">
            Страница {page}
          </span>
          <button
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
            className="px-4 py-2 rounded-xl bg-white/[0.05] text-sm text-white/60 disabled:opacity-30 hover:bg-white/[0.08] active:scale-[0.98] transition-all duration-200"
          >
            Вперёд
          </button>
        </div>
      )}

      {/* Force delete confirmation overlay */}
      {confirmId && (
        <div
          className="fixed inset-0 flex items-end justify-center bg-black/60 pb-6 px-4"
          style={{ zIndex: 200 }}
          onClick={() => setConfirmId(null)}
        >
          <div
            className="w-full max-w-sm bg-[#1a1f2e] border border-white/[0.08] rounded-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <p className="text-base font-semibold text-white">Удалить навсегда?</p>
              <p className="text-sm text-white/50">
                Это действие необратимо. Заказ будет удалён без возможности восстановления.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmId(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-sm text-white/70 hover:bg-white/[0.09] active:scale-[0.97] transition-all duration-200"
              >
                Отмена
              </button>
              <button
                onClick={handleForceDeleteConfirm}
                disabled={forceDeleteMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-sm text-red-400 font-medium hover:bg-red-500/25 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none"
              >
                {forceDeleteMutation.isPending ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
