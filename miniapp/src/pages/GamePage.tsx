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

  const { data: categories = [], isLoading: catsLoading } = useQuery({
    queryKey: ['categories', slug],
    queryFn: () => catalogApi.getCategories(slug!),
    enabled: !!slug,
  })

  // Первая категория — авто-выбор
  const activeCatId = selectedCatId ?? categories[0]?.id ?? null

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['products', activeCatId],
    queryFn: () => catalogApi.getProducts(activeCatId!),
    enabled: !!activeCatId,
  })

  const gameName = slug?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? ''

  const handleFavoriteToggle = (id: string, added: boolean) => {
    setFavorites(prev => {
      const next = new Set(prev)
      added ? next.add(id) : next.delete(id)
      return next
    })
  }

  // Рендер категорий — плоско (если нет вложенных) или с accordion
  const renderCategories = (cats: Category[]) => cats.filter(c => !c.parent_id)

  return (
    <div className="animate-fade-in">
      {/* Заголовок */}
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{gameName}</h1>
      </div>

      {/* Категории — горизонтальный скролл */}
      <div className="flex gap-2 px-4 overflow-x-auto pb-2 no-scrollbar">
        {catsLoading
          ? Array(4).fill(0).map((_, i) => (
              <div key={i} className="skeleton h-9 w-24 rounded-full flex-shrink-0" />
            ))
          : renderCategories(categories).map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCatId(cat.id)}
                className={clsx(
                  'flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium',
                  'transition-all duration-150 active:scale-95',
                  activeCatId === cat.id
                    ? 'text-white'
                    : 'opacity-60'
                )}
                style={{
                  background: activeCatId === cat.id ? 'var(--btn)' : 'var(--bg2)',
                  color: activeCatId === cat.id ? 'var(--btn-text)' : 'var(--text)',
                }}
              >
                {cat.name}
              </button>
            ))
        }
      </div>

      {/* Подкатегории (если есть) */}
      {activeCatId && (() => {
        const parent = categories.find(c => c.id === activeCatId)
        if (!parent?.children?.length) return null
        return (
          <div className="flex gap-2 px-4 overflow-x-auto pb-2 no-scrollbar">
            {parent.children.map(sub => (
              <button
                key={sub.id}
                onClick={() => setSelectedCatId(sub.id)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{ background: 'var(--bg2)', color: 'var(--hint)' }}
              >
                {sub.name}
              </button>
            ))}
          </div>
        )
      })()}

      {/* Товары */}
      <div className="px-4 pt-2">
        {productsLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="skeleton rounded-2xl" style={{ height: 220 }} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📦</p>
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
