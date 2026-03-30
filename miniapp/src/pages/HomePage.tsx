// src/pages/HomePage.tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
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
    <div className="px-4 pt-4 pb-2 space-y-5 animate-fade-in">
      {/* Заголовок + поиск */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs" style={{ color: 'var(--hint)' }}>Добро пожаловать в</p>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
            🎮 {shopName}
          </h1>
        </div>
        <Link
          to="/search"
          className="w-10 h-10 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--bg2)' }}
        >
          <Search size={20} style={{ color: 'var(--hint)' }} />
        </Link>
      </div>

      {/* Игры — горизонтальный скролл */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>Игры</h2>
          <Link to="/catalog" className="text-sm font-medium" style={{ color: 'var(--btn)' }}>
            Все →
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 no-scrollbar">
          {gamesLoading
            ? Array(4).fill(0).map((_, i) => (
                <div key={i} className="skeleton flex-shrink-0 w-24 h-24 rounded-2xl" />
              ))
            : games.map(game => (
                <Link
                  key={game.id}
                  to={`/catalog/${game.slug}`}
                  className="flex-shrink-0 w-24 rounded-2xl overflow-hidden relative active:scale-95 transition-transform"
                >
                  <div className="aspect-square overflow-hidden">
                    {game.image_url
                      ? <img src={game.image_url} alt={game.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-3xl"
                             style={{ background: 'var(--bg2)' }}>🎮</div>
                    }
                  </div>
                  <p className="text-center text-[11px] font-medium mt-1 px-1 line-clamp-1"
                     style={{ color: 'var(--text)' }}>
                    {game.name}
                  </p>
                </Link>
              ))
          }
        </div>
      </section>

      {/* Популярные товары */}
      {featured.length > 0 && (
        <section>
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
