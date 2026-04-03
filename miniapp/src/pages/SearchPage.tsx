// src/pages/SearchPage.tsx
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { catalogApi } from '@/api'
import ProductCard from '@/components/ui/ProductCard'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 350)
    return () => clearTimeout(t)
  }, [query])

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search', debouncedQ],
    queryFn: () => catalogApi.search(debouncedQ),
    enabled: debouncedQ.length >= 2,
  })

  const { data: recent = [] } = useQuery({
    queryKey: ['recently-viewed'],
    queryFn: catalogApi.getRecentlyViewed,
    enabled: debouncedQ.length < 2,
  })

  return (
    <div className="px-4 pt-5 space-y-5 animate-fade-in">
      {/* Поле поиска */}
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
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{
              background: 'rgba(148,163,184,0.1)',
            }}
          >
            <X size={14} style={{ color: 'var(--hint)' }} />
          </button>
        )}
      </div>

      {/* Недавно просмотренные */}
      {debouncedQ.length < 2 && recent.length > 0 && (
        <section>
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: 'var(--hint)' }}
          >
            Недавно просматривал
          </p>
          <div className="grid grid-cols-2 gap-3">
            {recent.slice(0, 4).map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {/* Пустое состояние — подсказка */}
      {debouncedQ.length < 2 && recent.length === 0 && (
        <div className="text-center py-16">
          <p className="text-5xl mb-4">🔍</p>
          <p className="font-medium" style={{ color: 'var(--hint)' }}>
            Начни вводить название товара
          </p>
          <p className="text-sm mt-1" style={{ color: 'rgba(148,163,184,0.5)' }}>
            Минимум 2 символа
          </p>
        </div>
      )}

      {/* Результаты поиска */}
      {debouncedQ.length >= 2 && (
        <section>
          {isFetching ? (
            <div className="grid grid-cols-2 gap-3">
              {Array(4).fill(0).map((_, i) => (
                <div key={i} className="skeleton rounded-2xl" style={{ height: 220 }} />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-5xl mb-4">🤔</p>
              <p className="font-medium" style={{ color: 'var(--text)' }}>
                Ничего не найдено
              </p>
              <p className="text-sm mt-1.5" style={{ color: 'var(--hint)' }}>
                Попробуй другой запрос
              </p>
            </div>
          ) : (
            <>
              <p
                className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: 'var(--hint)' }}
              >
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
