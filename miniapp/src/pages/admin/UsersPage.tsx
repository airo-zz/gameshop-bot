/**
 * src/pages/admin/UsersPage.tsx
 * Список пользователей с поиском и фильтром по статусу.
 */

import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, AlertCircle, ShieldAlert } from '@/components/ui/icons'
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
        <h1 className="text-xl font-bold text-[var(--text)]">Пользователи</h1>
        {data && <p className="text-sm text-[var(--hint)] mt-0.5">Всего: {data.total}</p>}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--hint)]" />
          <input
            type="text"
            placeholder="Поиск по имени, @username, ID..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl py-2.5 pl-9 pr-4 text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none focus:ring-1 focus:ring-[var(--border)] focus:border-[var(--border)] transition-all duration-200"
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
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-[0.97]',
                isBlocked === opt.value
                  ? 'bg-[var(--bg3)] text-[var(--text)]'
                  : 'bg-[var(--bg2)] text-[var(--hint)] hover:bg-[var(--bg3)]',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-[var(--hint)] text-sm py-8 text-center">Загрузка...</p>
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3 text-[var(--hint)]">
          <AlertCircle size={36} />
          <p className="text-sm">Ошибка загрузки пользователей</p>
          <button onClick={load} className="text-xs text-[var(--hint)] hover:text-[var(--text-2)] active:scale-[0.97] transition-transform">Попробовать снова</button>
        </div>
      ) : !data?.items.length ? (
        <div className="text-center py-16 text-[var(--hint)] text-sm">Пользователи не найдены</div>
      ) : (
        <div className="space-y-2">
          {data.items.map((user) => (
            <Link
              key={user.id}
              to={`/admin/users/${user.id}`}
              className="flex items-center gap-3 bg-[var(--bg2)] hover:bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-4 py-3.5 transition-all duration-200 active:scale-[0.97]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--text)] truncate">
                    {user.first_name}
                  </span>
                  {user.is_blocked && (
                    <ShieldAlert size={13} className="text-red-400 shrink-0" />
                  )}
                </div>
                <div className="text-xs text-[var(--hint)]">
                  {user.username ? `@${user.username} · ` : ''}
                  {user.orders_count} заказов · {formatMoney(user.total_spent)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex items-center justify-between pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-4 py-2 rounded-xl bg-[var(--bg2)] text-sm text-[var(--text-2)] disabled:opacity-30 hover:bg-[var(--bg3)] active:scale-[0.97] transition-all duration-200"
          >
            Назад
          </button>
          <span className="text-xs text-[var(--hint)]">Страница {page}</span>
          <button
            disabled={page >= data.pages}
            onClick={() => setPage(page + 1)}
            className="px-4 py-2 rounded-xl bg-[var(--bg2)] text-sm text-[var(--text-2)] disabled:opacity-30 hover:bg-[var(--bg3)] active:scale-[0.97] transition-all duration-200"
          >
            Вперёд
          </button>
        </div>
      )}
    </div>
  )
}
