// src/pages/GamePage.tsx
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { catalogApi, type Category } from '@/api'
import ProductCard from '@/components/ui/ProductCard'
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
        style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.35)', color: '#a78bfa' }}
      >
        Повторить
      </button>
    </div>
  )

  return (
    <div className="animate-fade-in">
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
          ? Array(4).fill(0).map((_, i) => (
              <div key={i} className="skeleton h-9 w-24 rounded-full flex-shrink-0" />
            ))
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
                    ? '1px solid rgba(124,58,237,0.5)'
                    : '1px solid var(--border)',
                  background: selectedCatId === sub.id
                    ? 'rgba(124,58,237,0.2)'
                    : 'var(--bg2)',
                  color: selectedCatId === sub.id
                    ? '#c4b5fd'
                    : 'var(--hint)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontWeight: 500,
                  transition: 'all 0.15s',
                  boxShadow: selectedCatId === sub.id ? '0 0 10px rgba(124,58,237,0.18)' : 'none',
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
              style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.35)', color: '#a78bfa' }}
            >
              Повторить
            </button>
          </div>
        ) : productsLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="skeleton rounded-2xl" style={{ height: 220 }} />
            ))}
          </div>
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
    </div>
  )
}
