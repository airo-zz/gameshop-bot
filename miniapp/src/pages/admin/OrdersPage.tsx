/**
 * src/pages/admin/OrdersPage.tsx
 * Список заказов с фильтрацией по статусу и поиском.
 * Поддерживает фильтр "Мои" и кнопку "Взять в работу" для paid-заказов.
 */

import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, AlertCircle, Trash2, UserCheck } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/api/admin'
import type { AdminOrderListItem, PaginatedResponse } from '@/api/admin'
import { useAdminOrdersStore } from '@/store/adminStore'
import toast from 'react-hot-toast'

// Палитра цветов администраторов — зеркало ADMIN_COLORS из shared/models/order.py
export const ADMIN_COLORS = [
  '#3b82f6', // 0 blue
  '#8b5cf6', // 1 violet
  '#10b981', // 2 emerald
  '#f59e0b', // 3 amber
  '#ef4444', // 4 red
  '#06b6d4', // 5 cyan
  '#f97316', // 6 orange
  '#ec4899', // 7 pink
]

const STATUS_LABELS: Record<string, string> = {
  all:             'Все',
  new:             'Новый',
  pending_payment: 'Ожидает оплаты',
  paid:            'Оплачен',
  processing:      'В работе',
  clarification:   'Уточнение',
  completed:       'Выполнен',
  cancelled:       'Отменён',
  mine:            'Мои',
}

const STATUS_COLORS: Record<string, string> = {
  new:             'bg-slate-500/15 text-slate-400',
  pending_payment: 'bg-yellow-500/15 text-yellow-400',
  paid:            'bg-blue-500/15 text-blue-400',
  processing:      'bg-violet-500/15 text-violet-400',
  clarification:   'bg-amber-500/15 text-amber-400',
  completed:       'bg-emerald-500/15 text-emerald-400',
  cancelled:       'bg-red-500/15 text-red-400',
}

function formatMoney(v: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(v)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function AdminBadge({ admin }: { admin: NonNullable<AdminOrderListItem['assigned_admin']> }) {
  const color = ADMIN_COLORS[admin.color_index % ADMIN_COLORS.length]
  const label = admin.username ? `@${admin.username}` : admin.first_name
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
      style={{
        background: `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      <UserCheck size={9} />
      {label}
    </span>
  )
}

export default function OrdersPage() {
  const { page, status, search, setPage, setStatus, setSearch } = useAdminOrdersStore()
  const [assignedToMe, setAssignedToMe] = useState(false)

  const { data: trashData } = useQuery({
    queryKey: ['admin', 'orders', 'trash', 1],
    queryFn: () => adminApi.getTrashOrders(1, 1),
    staleTime: 60_000,
  })
  const [data, setData] = useState<PaginatedResponse<AdminOrderListItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [searchInput, setSearchInput] = useState(search)
  const [claimingId, setClaimingId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    adminApi.getOrders({
      page,
      status: (status === 'all' || status === 'mine') ? undefined : status,
      search: search || undefined,
      assigned_to_me: assignedToMe || status === 'mine' ? true : undefined,
    } as Parameters<typeof adminApi.getOrders>[0])
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [page, status, search, assignedToMe])

  useEffect(() => { load() }, [load])

  // При переключении на "Мои" — включаем фильтр assigned_to_me
  useEffect(() => {
    setAssignedToMe(status === 'mine')
  }, [status])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) setSearch(searchInput)
    }, 400)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const handleClaim = async (e: React.MouseEvent, orderId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (claimingId) return
    setClaimingId(orderId)
    try {
      const res = await adminApi.claimOrder(orderId)
      toast.success('Заказ взят в работу')
      // Оптимистичное обновление списка
      setData(prev => prev ? {
        ...prev,
        items: prev.items.map(o => o.id === orderId ? {
          ...o,
          status: 'processing',
          assigned_admin: res.assigned_admin,
          assigned_at: res.assigned_at,
        } : o),
      } : prev)
    } catch {
      toast.error('Не удалось взять заказ')
    } finally {
      setClaimingId(null)
    }
  }

  const FILTER_TABS = ['all', 'new', 'pending_payment', 'paid', 'processing', 'clarification', 'completed', 'cancelled', 'mine']

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Заказы</h1>
          {data && (
            <p className="text-sm text-white/40 mt-0.5">Всего: {data.total}</p>
          )}
        </div>
        <Link
          to="/admin/orders/trash"
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors duration-200 mt-1"
        >
          <Trash2 size={13} />
          Корзина
          {(trashData?.total ?? 0) > 0 && (
            <span className="bg-red-500/20 text-red-400 text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none">
              {trashData!.total}
            </span>
          )}
        </Link>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Поиск по номеру заказа, пользователю..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl py-2.5 pl-9 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-all duration-200"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {FILTER_TABS.map((key) => (
            <button
              key={key}
              onClick={() => setStatus(key)}
              className={[
                'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-[0.98]',
                status === key
                  ? 'bg-white/15 text-white'
                  : 'bg-white/[0.05] text-white/50 hover:bg-white/[0.08]',
              ].join(' ')}
            >
              {STATUS_LABELS[key] ?? key}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-white/40 text-sm py-8 text-center">Загрузка...</p>
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/40">
          <AlertCircle size={36} />
          <p className="text-sm">Ошибка загрузки заказов</p>
          <button onClick={load} className="text-xs text-white/50 hover:text-white/70 active:scale-[0.98] transition-transform">
            Попробовать снова
          </button>
        </div>
      ) : !data?.items.length ? (
        <div className="text-center py-16 text-white/30 text-sm">
          Заказов не найдено
        </div>
      ) : (
        <div className="space-y-2">
          {data.items.map((order) => (
            <Link
              key={order.id}
              to={`/admin/orders/${order.id}`}
              className="flex items-center gap-3 bg-[#1a1f2e] hover:bg-[#1f2538] border border-white/[0.06] rounded-xl px-4 py-3.5 transition-all duration-200 active:scale-[0.99]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-mono font-medium text-white">
                    {order.order_number}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status] ?? 'bg-white/10 text-white/50'}`}>
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>
                  {order.assigned_admin && (
                    <AdminBadge admin={order.assigned_admin} />
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <span>
                    {order.user_first_name}
                    {order.user_username ? ` @${order.user_username}` : ''}
                  </span>
                  <span>·</span>
                  <span>{formatDate(order.created_at)}</span>
                  <span>·</span>
                  <span>{order.items_count} поз.</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="text-sm font-semibold text-white">
                  {formatMoney(order.total_amount)}
                </div>
                {order.status === 'paid' && !order.assigned_admin && (
                  <button
                    onClick={(e) => handleClaim(e, order.id)}
                    disabled={claimingId === order.id}
                    className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/25 hover:bg-blue-500/25 active:scale-[0.96] transition-all duration-200 disabled:opacity-50"
                  >
                    {claimingId === order.id ? '...' : 'Взять'}
                  </button>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > 20 && (
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
            disabled={page >= data.pages}
            onClick={() => setPage(page + 1)}
            className="px-4 py-2 rounded-xl bg-white/[0.05] text-sm text-white/60 disabled:opacity-30 hover:bg-white/[0.08] active:scale-[0.98] transition-all duration-200"
          >
            Вперёд
          </button>
        </div>
      )}
    </div>
  )
}
