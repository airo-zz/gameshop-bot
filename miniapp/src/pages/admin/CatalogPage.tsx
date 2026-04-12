/**
 * src/pages/admin/CatalogPage.tsx
 * Управление каталогом товаров (список + поиск + фильтр по игре).
 */

import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, Plus, AlertCircle, Package } from 'lucide-react'
import { adminApi } from '@/api/admin'
import type { PaginatedResponse, AdminProductListItem, AdminGame } from '@/api/admin'
import { useAdminCatalogStore } from '@/store/adminStore'

function formatMoney(v: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(v)
}

export default function CatalogPage() {
  const navigate = useNavigate()
  const { page, gameId, search, setPage, setGameId, setSearch } = useAdminCatalogStore()
  const [data, setData] = useState<PaginatedResponse<AdminProductListItem> | null>(null)
  const [games, setGames] = useState<AdminGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [searchInput, setSearchInput] = useState(search)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    Promise.all([
      adminApi.getProducts({
        page,
        game_id: gameId ?? undefined,
        search: search || undefined,
      }),
      games.length ? Promise.resolve(games) : adminApi.getGames(),
    ])
      .then(([products, gamesData]) => {
        setData(products)
        if (!games.length) setGames(gamesData)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, gameId, search])

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Каталог</h1>
          {data && <p className="text-sm text-white/40 mt-0.5">Всего: {data.total}</p>}
          <Link to="/admin/catalog/games/new" className="text-xs text-blue-400 hover:text-blue-300">
            Управление играми →
          </Link>
        </div>
        <Link to="/admin/catalog/products/new" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white transition-colors">
          <Plus size={16} />
          Добавить
        </Link>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Поиск товара..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
          />
        </div>

        {games.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setGameId(null)}
              className={[
                'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                gameId === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10',
              ].join(' ')}
            >
              Все игры
            </button>
            {games.map((game) => (
              <button
                key={game.id}
                onClick={() => setGameId(game.id)}
                className={[
                  'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                  gameId === game.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/5 text-white/50 hover:bg-white/10',
                ].join(' ')}
              >
                {game.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Products */}
      {loading ? (
        <div className="grid grid-cols-1 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/40">
          <AlertCircle size={36} />
          <p className="text-sm">Ошибка загрузки товаров</p>
          <button onClick={load} className="text-xs text-blue-400">Попробовать снова</button>
        </div>
      ) : !data?.items.length ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/30">
          <Package size={36} />
          <p className="text-sm">Товары не найдены</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.items.map((product, i) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              onClick={() => navigate(`/admin/catalog/products/${product.id}`)}
              className="flex items-center gap-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-xl px-4 py-3 transition-colors duration-200 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <Package size={18} className="text-white/20" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{product.name}</div>
                <div className="text-xs text-white/40">
                  {product.delivery_type}
                  {product.stock !== null && ` · склад: ${product.stock}`}
                  {' · '}
                  <span className={product.is_active ? 'text-emerald-400' : 'text-white/30'}>
                    {product.is_active ? 'Активен' : 'Неактивен'}
                  </span>
                </div>
              </div>
              <div className="text-sm font-semibold text-white shrink-0">
                {formatMoney(product.price)}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
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
