// src/pages/CatalogPage.tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { catalogApi } from '@/api'

export default function CatalogPage() {
  const { data: games = [], isLoading } = useQuery({
    queryKey: ['games'],
    queryFn: catalogApi.getGames,
  })

  return (
    <div className="px-4 pt-4 space-y-3 animate-fade-in">
      <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>🎮 Каталог игр</h1>

      {isLoading
        ? Array(6).fill(0).map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-2xl" />
          ))
        : games.map(game => (
            <Link
              key={game.id}
              to={`/catalog/${game.slug}`}
              className="flex items-center gap-3 p-3 rounded-2xl active:scale-95 transition-transform"
              style={{ background: 'var(--bg2)' }}
            >
              <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                {game.image_url
                  ? <img src={game.image_url} alt={game.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-2xl bg-black/5">🎮</div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate" style={{ color: 'var(--text)' }}>{game.name}</p>
                {game.description && (
                  <p className="text-xs truncate mt-0.5" style={{ color: 'var(--hint)' }}>
                    {game.description}
                  </p>
                )}
              </div>
              <ChevronRight size={18} style={{ color: 'var(--hint)' }} />
            </Link>
          ))
      }

      {!isLoading && games.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🎮</p>
          <p style={{ color: 'var(--hint)' }}>Игры скоро появятся</p>
        </div>
      )}
    </div>
  )
}
