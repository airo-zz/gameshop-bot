// src/pages/SearchPage.tsx
import { useState, useRef } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { catalogApi, type Game } from '@/api'
import ProductCard from '@/components/ui/ProductCard'
import { useDebounce } from '@/hooks/useDebounce'

function GameCard({ game }: { game: Game }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const navigating = useRef(false)

  async function handleClick() {
    if (navigating.current) return
    navigating.current = true
    try {
      const [, cats] = await Promise.all([
        import('@/pages/GamePage'),
        qc.fetchQuery({ queryKey: ['categories', game.slug], queryFn: () => catalogApi.getCategories(game.slug), staleTime: 5 * 60_000 }),
        qc.prefetchQuery({ queryKey: ['games'], queryFn: () => catalogApi.getGames(), staleTime: 5 * 60_000 }),
      ])
      const firstCatId = (cats as any[])[0]?.id
      if (firstCatId) {
        await qc.prefetchQuery({ queryKey: ['products', firstCatId], queryFn: () => catalogApi.getProducts(firstCatId), staleTime: 2 * 60_000 })
      }
      navigate(`/catalog/${game.slug}`)
    } finally {
      navigating.current = false
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex-shrink-0 flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
      style={{ width: 100, minWidth: 100, flexShrink: 0 }}
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          width: 100, height: 100,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
        }}
      >
        {game.image_url ? (
          <img
            src={game.image_url}
            alt={game.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-xs font-bold"
            style={{ color: 'var(--hint)' }}
          >
            {game.name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      <p
        className="text-xs font-medium text-center leading-tight w-full truncate px-0.5"
        style={{ color: 'var(--text)' }}
      >
        {game.name}
      </p>
    </button>
  )
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const debouncedQ = useDebounce(query, 350)
  const isSearching = debouncedQ.length >= 2

  const { data: products = [] } = useQuery({
    queryKey: ['search', debouncedQ],
    queryFn: () => catalogApi.search(debouncedQ),
    enabled: isSearching,
    placeholderData: keepPreviousData,
  })

  const { data: games = [] } = useQuery({
    queryKey: ['search-games', debouncedQ],
    queryFn: () => catalogApi.searchGames(debouncedQ),
    enabled: isSearching,
    placeholderData: keepPreviousData,
  })

  const { data: recent = [] } = useQuery({
    queryKey: ['recently-viewed'],
    queryFn: catalogApi.getRecentlyViewed,
    enabled: !isSearching,
    staleTime: 60_000,
  })

  const hasResults = games.length > 0 || products.length > 0
  const showEmpty = isSearching && !hasResults

  return (
    <div className="px-4 pt-5 space-y-5">
      {/* Search input */}
      <div className="relative">
        <Search
          size={17}
          className="absolute left-3.5 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--hint)' }}
        />
        <input
          autoFocus
          type="search"
          className="input pl-10 pr-10"
          placeholder="Поиск игр и товаров..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{ background: 'var(--bg3)' }}
          >
            <X size={14} style={{ color: 'var(--hint)' }} />
          </button>
        )}
      </div>

      {/* Recently viewed */}
      {!isSearching && recent.length > 0 && (
        <section>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--hint)' }}>
            Недавно просматривал
          </p>
          <div className="grid grid-cols-2 gap-3">
            {recent.slice(0, 4).map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {/* Search results */}
      {isSearching && (
        <>
          {hasResults && (
            <div className="space-y-5">
              {games.length > 0 && (
                <section>
                  <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: 'var(--hint)' }}>
                    Игры
                  </p>
                  <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 no-scrollbar">
                    {games.map(g => <GameCard key={g.id} game={g} />)}
                  </div>
                </section>
              )}

              {products.length > 0 && (
                <section>
                  <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: 'var(--hint)' }}>
                    Товары
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {products.map(p => <ProductCard key={p.id} product={p} />)}
                  </div>
                </section>
              )}
            </div>
          )}

          {showEmpty && (
            <div className="text-center py-16">
              <div
                className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
              >
                <Search size={24} style={{ color: 'var(--hint)' }} />
              </div>
              <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Ничего не найдено</p>
              <p className="text-sm" style={{ color: 'var(--hint)' }}>Попробуй другой запрос</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
