// src/pages/HomePage.tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Search, ChevronRight } from 'lucide-react'
import { catalogApi } from '@/api'
import { useShopStore } from '@/store'
import ProductCard from '@/components/ui/ProductCard'

export default function HomePage() {
  const shopName = useShopStore(s => s.name)

  const { data: games = [], isLoading: gamesLoading } = useQuery({
    queryKey: ['games'],
    queryFn: catalogApi.getGames,
  })

  const { data: featured = [] } = useQuery({
    queryKey: ['featured'],
    queryFn: () => catalogApi.search('', 0),
  })

  return (
    <div className="px-4 pt-5 pb-2 space-y-6 animate-fade-in">
      {/* Заголовок + кнопка поиска */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium" style={{ color: 'var(--hint)' }}>
            Добро пожаловать в
          </p>
          <h1
            className="text-2xl font-extrabold tracking-tight mt-0.5"
            style={{ color: 'var(--text)' }}
          >
            🎮 {shopName}
          </h1>
        </div>
        <Link
          to="/search"
          className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90"
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
          }}
        >
          <Search size={19} style={{ color: 'var(--hint)' }} />
        </Link>
      </div>

      {/* Игры — горизонтальный скролл */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>
            Игры
          </h2>
          <Link
            to="/catalog"
            className="flex items-center gap-0.5 text-sm font-medium transition-colors duration-200"
            style={{ color: 'var(--accent)' }}
          >
            Все <ChevronRight size={15} />
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 no-scrollbar">
          {gamesLoading
            ? Array(5).fill(0).map((_, i) => (
                <div key={i} className="skeleton flex-shrink-0 w-[88px] rounded-2xl" style={{ height: 110 }} />
              ))
            : games.map(game => (
                <Link
                  key={game.id}
                  to={`/catalog/${game.slug}`}
                  className="flex-shrink-0 w-[88px] rounded-2xl overflow-hidden active:scale-95 transition-all duration-200"
                  style={{
                    border: '1px solid var(--border)',
                    background: 'var(--bg2)',
                  }}
                >
                  <div className="overflow-hidden" style={{ aspectRatio: '1/1' }}>
                    {game.image_url ? (
                      <img
                        src={game.image_url}
                        alt={game.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-3xl"
                        style={{ background: 'var(--bg3, #1a1a28)' }}
                      >
                        🎮
                      </div>
                    )}
                  </div>
                  <p
                    className="text-center text-[11px] font-medium py-1.5 px-1 line-clamp-1"
                    style={{ color: 'var(--text)' }}
                  >
                    {game.name}
                  </p>
                </Link>
              ))
          }
        </div>
      </section>

      {/* Популярные товары */}
      {featured.length > 0 && (
        <section className="pb-2">
          <h2 className="font-bold text-base mb-3" style={{ color: 'var(--text)' }}>
            🔥 Популярное
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {featured.slice(0, 6).map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
