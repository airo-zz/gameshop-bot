/**
 * src/pages/admin/UsersPage.tsx
 * Список пользователей с поиском и фильтром по статусу.
 */

import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, AlertCircle, ChevronRight, ShieldAlert } from 'lucide-react'
import { adminApi } from '@/api/admin'
import type { AdminUserListItem, PaginatedResponse } from '@/api/admin'
import { useAdminUsersStore } from '@/store/adminStore'

function formatMoney(v: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(v)
}

export default function UsersPage() {
  const { page, search, isBlocked, setPage, setSearch, setIsBlocked } = useAdminUsersStore()
  const [data, setData] = useState<PaginatedResponse<AdminUserListItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [searchInput, setSearchInput] = useState(search)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    adminApi.getUsers({
      page,
      search: search || undefined,
      is_blocked: isBlocked ?? undefined,
    })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [page, search, isBlocked])

  useEffect(() => { load() }, [load])

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
        <h1 className="text-xl font-bold text-white">Пользователи</h1>
        {data && <p className="text-sm text-white/40 mt-0.5">Всего: {data.total}</p>}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Поиск по имени, @username, ID..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
          />
        </div>

        <div className="flex gap-2">
          {[
            { label: 'Все', value: null },
            { label: 'Активные', value: false },
            { label: 'Заблокированные', value: true },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => setIsBlocked(opt.value)}
              className={[
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                isBlocked === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10',
              ].join(' ')}
            >
              {opt.label}
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
          <p className="text-sm">Ошибка загрузки пользователей</p>
          <button onClick={load} className="text-xs text-blue-400">Попробовать снова</button>
        </div>
      ) : !data?.items.length ? (
        <div className="text-center py-16 text-white/30 text-sm">Пользователи не найдены</div>
      ) : (
        <div className="space-y-2">
          {data.items.map((user, i) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
            >
              <Link
                to={`/admin/users/${user.id}`}
                className="flex items-center gap-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-xl px-4 py-3 transition-colors duration-200"
              >
                {/* Avatar */}
                {user.photo_url ? (
                  <img
                    src={user.photo_url}
                    alt={user.first_name}
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-sm font-semibold text-white/60">
                    {user.first_name[0]}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">
                      {user.first_name}
                    </span>
                    {user.is_blocked && (
                      <ShieldAlert size={13} className="text-red-400 shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-white/40">
                    {user.username ? `@${user.username} · ` : ''}
                    {user.orders_count} заказов · {formatMoney(user.total_spent)}
                  </div>
                </div>

                <ChevronRight size={14} className="text-white/20 shrink-0" />
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex items-center justify-between pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-4 py-2 rounded-xl bg-white/5 text-sm text-white/60 disabled:opacity-30 hover:bg-white/10 transition-colors"
          >
            Назад
          </button>
          <span className="text-xs text-white/30">Страница {page}</span>
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
