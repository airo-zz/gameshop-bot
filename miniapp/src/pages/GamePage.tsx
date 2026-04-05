// src/pages/GamePage.tsx
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { catalogApi, type Category } from '@/api'
import ProductCard from '@/components/ui/ProductCard'
import PageLoader from '@/components/ui/PageLoader'
import clsx from 'clsx'

export default function GamePage() {
  const { slug } = useParams<{ slug: string }>()
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  // Получаем список всех игр для поиска реального названия по slug
  const { data: games = [] } = useQuery({
    queryKey: ['games'],
    queryFn: catalogApi.getGames,
    staleTime: 5 * 60 * 1000,
  })

  const { data: categories = [], isLoading: catsLoading, isError: catsError, refetch: refetchCats } = useQuery({
    queryKey: ['categories', slug],
    queryFn: () => catalogApi.getCategories(slug!),
    enabled: !!slug,
  })

  const activeCatId = selectedCatId ?? categories[0]?.id ?? null

  const { data: products = [], isLoading: productsLoading, isError: productsError, refetch: refetchProducts } = useQuery({
    queryKey: ['products', activeCatId],
    queryFn: () => catalogApi.getProducts(activeCatId!),
    enabled: !!activeCatId,
  })

  // Реальное название из API, fallback на slug
  const gameFromApi = games.find(g => g.slug === slug)
  const gameName = gameFromApi?.name ?? slug?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? ''

  const handleFavoriteToggle = (id: string, added: boolean) => {
    setFavorites(prev => {
      const next = new Set(prev)
      added ? next.add(id) : next.delete(id)
      return next
    })
  }

  const rootCats = (cats: Category[]) => cats.filter(c => !c.parent_id)

  if (catsError) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p className="text-5xl mb-4">😔</p>
      <p className="text-sm mb-4" style={{ color: 'var(--hint)' }}>Не удалось загрузить данные</p>
      <button
        onClick={() => refetchCats()}
        className="px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-95"
        style={{ background: 'rgba(45,88,173,0.16)', border: '1px solid rgba(45,88,173,0.38)', color: '#6b9de8' }}
      >
        Повторить
      </button>
    </div>
  )

  return (
    <motion.div
      initial={{ opacity: 0, filter: 'blur(6px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* Заголовок */}
      <div
        className="px-4 pt-5 pb-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h1 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
          {gameName}
        </h1>
      </div>

      {/* Категории */}
      <div className="flex gap-2 px-4 pt-3 overflow-x-auto pb-2 no-scrollbar">
        {catsLoading
          ? <PageLoader delay={300} />
          : rootCats(categories).map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCatId(cat.id)}
                className={clsx('pill', activeCatId === cat.id && 'pill-active')}
              >
                {cat.name}
              </button>
            ))
        }
      </div>

      {/* Подкатегории с активным состоянием */}
      {activeCatId && (() => {
        const parent = categories.find(c => c.id === activeCatId)
        if (!parent?.children?.length) return null
        return (
          <div className="flex gap-2 px-4 overflow-x-auto pb-2 no-scrollbar">
            {parent.children.map(sub => (
              <button
                key={sub.id}
                onClick={() => setSelectedCatId(sub.id)}
                style={{
                  flexShrink: 0,
                  fontSize: '12px',
                  padding: '4px 12px',
                  borderRadius: 999,
                  border: selectedCatId === sub.id
                    ? '1px solid rgba(45,88,173,0.55)'
                    : '1px solid var(--border)',
                  background: selectedCatId === sub.id
                    ? 'rgba(45,88,173,0.22)'
                    : 'var(--bg2)',
                  color: selectedCatId === sub.id
                    ? '#93b8f0'
                    : 'var(--hint)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontWeight: 500,
                  transition: 'all 0.15s',
                  boxShadow: selectedCatId === sub.id ? '0 0 10px rgba(45,88,173,0.2)' : 'none',
                }}
              >
                {sub.name}
              </button>
            ))}
          </div>
        )
      })()}

      {/* Товары */}
      <div className="px-4 pt-3 pb-4">
        {productsError ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p className="text-sm mb-3" style={{ color: 'var(--hint)' }}>Не удалось загрузить товары</p>
            <button
              onClick={() => refetchProducts()}
              className="px-5 py-2 rounded-2xl text-sm font-semibold transition-all active:scale-95"
              style={{ background: 'rgba(45,88,173,0.16)', border: '1px solid rgba(45,88,173,0.38)', color: '#6b9de8' }}
            >
              Повторить
            </button>
          </div>
        ) : productsLoading ? (
          <PageLoader />
        ) : products.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-3">📦</p>
            <p style={{ color: 'var(--hint)' }}>Товары скоро появятся</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                isFavorite={favorites.has(product.id)}
                onFavoriteToggle={handleFavoriteToggle}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
