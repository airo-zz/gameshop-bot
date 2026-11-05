/**
 * src/pages/admin/catalog/GamesLevel.tsx
 * Уровень 1 каталога: список игр и сервисов, переход в воркспейс игры.
 * Часть страницы «Каталог» (pages/admin/CatalogPage.tsx).
 */

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Gamepad2, ChevronRight, ImageOff } from '@/components/ui/icons'
import { adminApi } from '@/api/admin'
import { type AdminGame } from '@/api/admin'
import { normalizeImageUrl } from '@/utils/imageUrl'

export interface GamesLevelProps {
  onSelect: (game: AdminGame) => void
}

export function GamesLevel({ onSelect }: GamesLevelProps) {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Каталог</h1>
          <p className="text-xs text-[var(--hint)] mt-0.5">Выберите игру</p>
        </div>
        <button
          onClick={() => navigate('/admin/catalog/games')}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg2)] border border-[var(--border)] hover:bg-[var(--bg3)] active:scale-[0.97] text-xs font-medium text-[var(--text-2)] transition-all duration-200"
        >
          Управление играми
          <ChevronRight size={14} />
        </button>
      </div>

      {loading ? (
        <p className="text-[var(--hint)] text-sm py-8 text-center">Загрузка...</p>
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3 text-[var(--hint)]">
          <AlertCircle size={36} />
          <p className="text-sm">Ошибка загрузки игр</p>
          <button onClick={load} className="text-xs text-[var(--hint)] hover:text-[var(--text-2)] active:scale-[0.97] transition-transform">Попробовать снова</button>
        </div>
      ) : games.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-[var(--hint)]">
          <Gamepad2 size={36} />
          <p className="text-sm">Игр пока нет</p>
        </div>
      ) : (
        <div className="space-y-2">
          {games.map((game) => (
            <div
              key={game.id}
              onClick={() => onSelect(game)}
              className="flex items-center gap-3 bg-[var(--bg2)] hover:bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-4 py-3.5 transition-all duration-200 cursor-pointer active:scale-[0.97]"
            >
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-[var(--bg2)] shrink-0 flex items-center justify-center">
                {game.image_url ? (
                  <img
                    src={normalizeImageUrl(game.image_url) ?? game.image_url}
                    alt={game.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                    }}
                  />
                ) : (
                  <ImageOff size={18} className="text-[var(--hint)]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[var(--text)] truncate">{game.name}</div>
                <div className="text-xs text-[var(--hint)] mt-0.5">
                  <span className={game.is_active ? 'text-emerald-400' : 'text-[var(--hint)]'}>
                    {game.is_active ? 'Активна' : 'Неактивна'}
                  </span>
                </div>
              </div>
              <ChevronRight size={16} className="text-[var(--hint)] shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
