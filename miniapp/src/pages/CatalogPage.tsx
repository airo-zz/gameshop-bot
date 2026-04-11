// src/pages/CatalogPage.tsx
import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronRight, Search, X } from 'lucide-react'
import { catalogApi } from '@/api'
import PageLoader from '@/components/ui/PageLoader'
import ImageWithSkeleton from '@/components/ui/ImageWithSkeleton'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function CatalogPage() {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: games = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['games'],
    queryFn: catalogApi.getGames,
    staleTime: 5 * 60 * 1000,
  })

  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ['catalog-search', debouncedQuery],
    queryFn: () => catalogApi.search(debouncedQuery, 0),
    enabled: debouncedQuery.trim().length > 0,
    staleTime: 30_000,
  })

  const isSearching = debouncedQuery.trim().length > 0

  // Фильтрация по названию игры (дополнительно к серверному поиску)
  const filteredGames = isSearching
    ? games.filter(g => g.name.toLowerCase().includes(debouncedQuery.toLowerCase()))
    : games

  if (isError) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p className="text-5xl mb-4">😔</p>
      <p className="text-sm mb-4" style={{ color: 'var(--hint)' }}>Не удалось загрузить каталог</p>
      <button
        onClick={() => refetch()}
        className="px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-95"
        style={{
          background: 'rgba(45,88,173,0.16)',
          border: '1px solid rgba(45,88,173,0.38)',
          color: '#6b9de8',
        }}
      >
        Повторить
      </button>
    </div>
  )

  return (
    <motion.div
      className="px-4 pt-5 pb-4 space-y-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <h1 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        🎮 Каталог игр
      </h1>

      {/* ── Search bar ─────────────────────────────────────────────────── */}
      <div
        className="search-bar"
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px' }}
      >
        <Search size={16} style={{ color: 'var(--hint)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Поиск игры или товара..."
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontSize: 14,
            padding: '11px 0',
            fontFamily: 'Inter, sans-serif',
          }}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--hint)',
              display: 'flex',
              padding: 2,
            }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* ── Search results ─────────────────────────────────────────────── */}
      {isSearching && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium" style={{ color: 'var(--hint)' }}>
            {searching ? 'Поиск...' : searchResults?.length
              ? `Найдено товаров: ${searchResults.length}`
              : filteredGames.length ? `Игры: ${filteredGames.length}` : 'Ничего не найдено'
            }
          </p>

          {/* Результаты — товары из поиска */}
          {!searching && searchResults && searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map(product => {
                const minPrice = product.lots.length
                  ? Math.min(...product.lots.map(l => l.price))
                  : product.price
                return (
                  <Link
                    key={product.id}
                    to={`/product/${product.id}`}
                    className="flex items-center gap-3 p-3 rounded-2xl active:scale-[0.98] transition-transform"
                    style={{ background: 'var(--bg2)', border: '1px solid var(--border)', textDecoration: 'none' }}
                  >
                    <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
                      <ImageWithSkeleton
                        src={product.images?.[0]}
                        alt={product.name}
                        aspectRatio="1 / 1"
                        objectFit="cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{product.name}</p>
                      <p className="text-xs mt-0.5 font-medium" style={{ color: '#6b9de8' }}>
                        от {minPrice.toLocaleString('ru')} ₽
                      </p>
                    </div>
                    <ChevronRight size={15} style={{ color: 'var(--hint)' }} />
                  </Link>
                )
              })}
            </div>
          )}

          {/* Игры, отфильтрованные по названию */}
          {filteredGames.length > 0 && (
            <div className="space-y-2">
              {searchResults && searchResults.length > 0 && (
                <p className="text-xs font-medium pt-1" style={{ color: 'var(--hint)' }}>Игры</p>
              )}
              {filteredGames.map(game => (
                <Link
                  key={game.id}
                  to={`/catalog/${game.slug}`}
                  className="flex items-center gap-3 p-3 rounded-2xl active:scale-[0.98] transition-transform"
                  style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
                >
                  <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                    <ImageWithSkeleton
                      src={game.image_url}
                      alt={game.name}
                      aspectRatio="1 / 1"
                      objectFit="cover"
                      loading="lazy"
                      fallback={<div className="w-full h-full flex items-center justify-center text-2xl" style={{ background: 'var(--bg3)' }}>🎮</div>}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate" style={{ color: 'var(--text)' }}>{game.name}</p>
                  </div>
                  <ChevronRight size={16} style={{ color: 'var(--hint)' }} />
                </Link>
              ))}
            </div>
          )}

          {!searching && (!searchResults || searchResults.length === 0) && filteredGames.length === 0 && (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">🔍</p>
              <p style={{ color: 'var(--hint)', fontSize: 14 }}>Ничего не найдено по запросу «{debouncedQuery}»</p>
            </div>
          )}
        </div>
      )}

      {/* ── Normal catalog ─────────────────────────────────────────────── */}
      {!isSearching && (
        isLoading
          ? <PageLoader />
          : (
            <div className="grid grid-cols-3 gap-3 pt-1">
              {games.map(game => (
                <Link
                  key={game.id}
                  to={`/catalog/${game.slug}`}
                  className="flex flex-col rounded-2xl overflow-hidden active:scale-[0.96] transition-transform"
                  style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
                >
                  <ImageWithSkeleton
                    src={game.image_url}
                    alt={game.name}
                    aspectRatio="1 / 1"
                    objectFit="cover"
                    loading="lazy"
                    style={{ width: '100%' }}
                    fallback={<div className="w-full h-full flex items-center justify-center text-4xl" style={{ background: 'var(--bg3)' }}>🎮</div>}
                  />
                  <div className="px-2 py-1.5">
                    <p className="text-xs font-semibold text-center truncate" style={{ color: 'var(--text)' }}>
                      {game.name}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )
      )}

      {!isLoading && !isSearching && games.length === 0 && (
        <div className="text-center py-20">
          <p className="text-5xl mb-3">🎮</p>
          <p style={{ color: 'var(--hint)' }}>Игры скоро появятся</p>
        </div>
      )}
    </motion.div>
  )
}
