// src/pages/CatalogPage.tsx
import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Search, X } from 'lucide-react'
import { catalogApi } from '@/api'
import ImageWithSkeleton from '@/components/ui/ImageWithSkeleton'
import { useDebounce } from '@/hooks/useDebounce'

type CatalogType = 'game' | 'service'

const TABS: { value: CatalogType; label: string }[] = [
  { value: 'game',    label: 'Игры' },
  { value: 'service', label: 'Сервисы' },
]

export default function CatalogPage() {
  const [query, setQuery] = useState('')
  const [activeType, setActiveType] = useState<CatalogType>('game')
  const debouncedQuery = useDebounce(query, 300)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const navigating = useRef(false)

  async function handleGameClick(slug: string) {
    if (navigating.current) return
    navigating.current = true
    try {
      const [, cats] = await Promise.all([
        import('@/pages/GamePage'),
        queryClient.fetchQuery({ queryKey: ['categories', slug], queryFn: () => catalogApi.getCategories(slug), staleTime: 5 * 60_000 }),
        queryClient.prefetchQuery({ queryKey: ['games'], queryFn: () => catalogApi.getGames(), staleTime: 5 * 60_000 }),
      ])
      const firstCatId = (cats as any[])[0]?.id
      if (firstCatId) {
        await queryClient.prefetchQuery({ queryKey: ['products', firstCatId], queryFn: () => catalogApi.getProducts(firstCatId), staleTime: 2 * 60_000 })
      }
      navigate(`/catalog/${slug}`)
    } finally {
      navigating.current = false
    }
  }

  const { data: games = [], isError, refetch } = useQuery({
    queryKey: ['games', activeType],
    queryFn: () => catalogApi.getGames(activeType),
    staleTime: 5 * 60 * 1000,
  })

  const isSearching = debouncedQuery.trim().length > 0

  // Фильтрация игр по названию
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
        Каталог
      </h1>

      {/* ── Segment control ─────────────────────────────────────────────── */}
      <div
        className="flex p-1 rounded-2xl"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
      >
        {TABS.map(tab => {
          const isActive = activeType === tab.value
          return (
            <button
              key={tab.value}
              onClick={() => { setActiveType(tab.value); setQuery('') }}
              className="relative flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-colors"
              style={{
                color: isActive ? 'var(--text)' : 'var(--hint)',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                zIndex: 1,
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="catalog-tab-pill"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: 'var(--accent)', zIndex: -1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              {tab.label}
            </button>
          )
        })}
      </div>

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

      {/* ── Search results (games only) ────────────────────────────────── */}
      {isSearching && (
        <div className="space-y-2 pt-1">
          {filteredGames.length > 0 ? (
            filteredGames.map(game => (
              <div
                key={game.id}
                onClick={() => handleGameClick(game.slug)}
                className="flex items-center gap-3 p-3 rounded-2xl active:scale-[0.98] transition-transform"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                  <ImageWithSkeleton
                    src={game.image_url}
                    alt={game.name}
                    aspectRatio="1 / 1"
                    objectFit="cover"
                    loading="lazy"
                    fallback={<div className="w-full h-full" style={{ background: 'var(--bg3)' }} />}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate" style={{ color: 'var(--text)' }}>{game.name}</p>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--hint)' }} />
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">🔍</p>
              <p style={{ color: 'var(--hint)', fontSize: 14 }}>Нет игр по запросу «{debouncedQuery}»</p>
            </div>
          )}
        </div>
      )}

      {/* ── Normal catalog ─────────────────────────────────────────────── */}
      {!isSearching && (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeType}
            className="grid grid-cols-3 gap-3 pt-1"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {games.map(game => (
              <div
                key={game.id}
                onClick={() => handleGameClick(game.slug)}
                className="flex flex-col rounded-2xl overflow-hidden active:scale-[0.96] transition-transform"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                <ImageWithSkeleton
                  src={game.image_url}
                  alt={game.name}
                  aspectRatio="1 / 1"
                  objectFit="cover"
                  loading="lazy"
                  style={{ width: '100%' }}
                  fallback={
                    <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg3)' }} />
                  }
                />
                <div className="px-2 py-1.5">
                  <p className="text-xs font-semibold text-center truncate" style={{ color: 'var(--text)' }}>
                    {game.name}
                  </p>
                </div>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}

      {!isSearching && games.length === 0 && (
        <div className="text-center py-20">
          <p style={{ color: 'var(--hint)' }}>
            {activeType === 'game' ? 'Игры скоро появятся' : 'Сервисы скоро появятся'}
          </p>
        </div>
      )}
    </motion.div>
  )
}
