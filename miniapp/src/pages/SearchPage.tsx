// src/pages/SearchPage.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { catalogApi } from '@/api'
import ProductCard from '@/components/ui/ProductCard'
import { useDebounce } from '@/hooks/useDebounce'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const debouncedQ = useDebounce(query, 350)

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search', debouncedQ],
    queryFn: () => catalogApi.search(debouncedQ),
    enabled: debouncedQ.length >= 2,
  })

  const { data: recent = [] } = useQuery({
    queryKey: ['recently-viewed'],
    queryFn: catalogApi.getRecentlyViewed,
    enabled: debouncedQ.length < 2,
    staleTime: 60_000,
  })

  return (
    <div className="px-4 pt-5 space-y-5">
      {/* Поиск */}
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
          placeholder="Поиск товаров..."
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

      {/* Недавно просмотренные */}
      {debouncedQ.length < 2 && recent.length > 0 && (
        <section>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--hint)' }}>
            Недавно просматривал
          </p>
          <div className="grid grid-cols-2 gap-3">
            {recent.slice(0, 4).map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {/* Результаты */}
      {debouncedQ.length >= 2 && (
        <section>
          {isFetching ? (
            <div className="grid grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-2xl animate-pulse" style={{ background: 'var(--bg2)', height: 180 }} />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-5xl mb-3">🔍</p>
              <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Ничего не найдено</p>
              <p className="text-sm" style={{ color: 'var(--hint)' }}>Попробуй другой запрос</p>
            </div>
          ) : (
            <>
              <p className="text-xs mb-3 font-medium" style={{ color: 'var(--hint)' }}>
                Найдено: {results.length}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {results.map(p => <ProductCard key={p.id} product={p} />)}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
