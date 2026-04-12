/**
 * src/pages/admin/GamesListPage.tsx
 * Список всех игр с возможностью редактирования и создания новых.
 *
 * Route: /admin/catalog/games
 */

import { useEffect, useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, AlertCircle, Gamepad2, Star, ImageOff, ArrowLeft } from 'lucide-react'
import { adminApi } from '@/api/admin'
import type { AdminGame } from '@/api/admin'

export default function GamesListPage() {
  const navigate = useNavigate()
  const [games, setGames] = useState<AdminGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    adminApi
      .getGames()
      .then(setGames)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/catalog')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors shrink-0"
          >
            <ArrowLeft size={18} className="text-white/60" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Игры</h1>
            {!loading && !error && (
              <p className="text-sm text-white/40 mt-0.5">Всего: {games.length}</p>
            )}
          </div>
        </div>
        <Link
          to="/admin/catalog/games/new"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white transition-colors shrink-0"
        >
          <Plus size={16} />
          Добавить игру
        </Link>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[72px] rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/40">
          <AlertCircle size={36} />
          <p className="text-sm">Ошибка загрузки игр</p>
          <button onClick={load} className="text-xs text-blue-400 hover:text-blue-300">
            Попробовать снова
          </button>
        </div>
      ) : games.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/30">
          <Gamepad2 size={36} />
          <p className="text-sm">Игр пока нет</p>
          <Link to="/admin/catalog/games/new" className="text-xs text-blue-400 hover:text-blue-300">
            Создать первую игру
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {games.map((game, i) => (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              onClick={() => navigate(`/admin/catalog/games/${game.id}`)}
              className="flex items-center gap-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-xl px-4 py-3 transition-colors duration-200 cursor-pointer"
            >
              {/* Image / placeholder */}
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                {game.image_url ? (
                  <img
                    src={game.image_url}
                    alt={game.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                      ;(e.currentTarget.nextElementSibling as HTMLElement | null)?.removeAttribute('style')
                    }}
                  />
                ) : null}
                <ImageOff
                  size={18}
                  className="text-white/20"
                  style={{ display: game.image_url ? 'none' : undefined }}
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-white truncate">{game.name}</span>
                  {game.is_featured && (
                    <Star size={12} className="text-amber-400 shrink-0" fill="currentColor" />
                  )}
                </div>
                <div className="text-xs text-white/35 mt-0.5 truncate">
                  {game.slug && <span className="font-mono mr-2">{game.slug}</span>}
                  <span
                    className={game.is_active ? 'text-emerald-400' : 'text-white/30'}
                  >
                    {game.is_active ? 'Активна' : 'Неактивна'}
                  </span>
                </div>
              </div>

              {/* Arrow hint */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-white/20 shrink-0"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
