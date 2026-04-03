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
    <div className="px-4 pt-5 pb-4 space-y-3 animate-fade-in">
      <h1 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        🎮 Каталог игр
      </h1>

      <div className="space-y-2 pt-1">
        {isLoading
          ? Array(6).fill(0).map((_, i) => (
              <div key={i} className="skeleton h-[72px] rounded-2xl" />
            ))
          : games.map(game => (
              <Link
                key={game.id}
                to={`/catalog/${game.slug}`}
                className="flex items-center gap-3 p-3 rounded-2xl active:scale-[0.98] transition-transform"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
              >
                <div
                  className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0"
                  style={{ background: 'var(--bg3)' }}
                >
                  {game.image_url
                    ? <img src={game.image_url} alt={game.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-2xl">🎮</div>
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
                <ChevronRight size={16} style={{ color: 'var(--hint)' }} />
              </Link>
            ))
        }
      </div>

      {!isLoading && games.length === 0 && (
        <div className="text-center py-20">
          <p className="text-5xl mb-3">🎮</p>
          <p style={{ color: 'var(--hint)' }}>Игры скоро появятся</p>
        </div>
      )}
    </div>
  )
}
