/**
 * src/pages/admin/OrdersPage.tsx
 * Список заказов с фильтрацией по статусу и поиском.
 */

import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, AlertCircle, ChevronRight } from 'lucide-react'
import { adminApi } from '@/api/admin'
import type { AdminOrderListItem, PaginatedResponse } from '@/api/admin'
import { useAdminOrdersStore } from '@/store/adminStore'

const STATUS_LABELS: Record<string, string> = {
  all:             'Все',
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
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(v)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function OrdersPage() {
  const { page, status, search, setPage, setStatus, setSearch } = useAdminOrdersStore()
  const [data, setData] = useState<PaginatedResponse<AdminOrderListItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [searchInput, setSearchInput] = useState(search)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    adminApi.getOrders({
      page,
      status: status === 'all' ? undefined : status,
      search: search || undefined,
    })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [page, status, search])

  useEffect(() => { load() }, [load])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) setSearch(searchInput)
    }, 400)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Заказы</h1>
        {data && (
          <p className="text-sm text-white/40 mt-0.5">Всего: {data.total}</p>
        )}
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
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatus(key)}
              className={[
                'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                status === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/40">
          <AlertCircle size={36} />
          <p className="text-sm">Ошибка загрузки заказов</p>
          <button onClick={load} className="text-xs text-blue-400 hover:text-blue-300">
            Попробовать снова
          </button>
        </div>
      ) : !data?.items.length ? (
        <div className="text-center py-16 text-white/30 text-sm">
          Заказов не найдено
        </div>
      ) : (
        <div className="space-y-2">
          {data.items.map((order, i) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
            >
              <Link
                to={`/admin/orders/${order.id}`}
                className="flex items-center gap-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-xl px-4 py-3 transition-colors duration-200"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-mono font-medium text-white">
                      #{order.order_number}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status] ?? 'bg-white/10 text-white/50'}`}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/40">
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
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-white">
                    {formatMoney(order.total_amount)}
                  </div>
                  <ChevronRight size={14} className="text-white/20 ml-auto mt-1" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex items-center justify-between pt-2">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="px-4 py-2 rounded-xl bg-white/5 text-sm text-white/60 disabled:opacity-30 hover:bg-white/10 transition-colors"
          >
            Назад
          </button>
          <span className="text-xs text-white/30">
            Страница {page}
          </span>
          <button
            disabled={page >= data.pages}
            onClick={() => setPage(page + 1)}
            className="px-4 py-2 rounded-xl bg-white/5 text-sm text-white/60 disabled:opacity-30 hover:bg-white/10 transition-colors"
          >
            Вперёд
          </button>
        </div>
      )}
    </div>
  )
}
