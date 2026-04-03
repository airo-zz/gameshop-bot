// src/pages/FavoritesPage.tsx
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { catalogApi } from '@/api'
import ProductCard from '@/components/ui/ProductCard'
import { Heart } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function FavoritesPage() {
  const qc = useQueryClient()
  const { data: favorites = [], isLoading } = useQuery({
    queryKey: ['favorites'],
    queryFn: catalogApi.getFavorites,
  })

  const handleToggle = (_id: string, _added: boolean) => {
    qc.invalidateQueries({ queryKey: ['favorites'] })
  }

  if (isLoading) return (
    <div className="px-4 pt-5 grid grid-cols-2 gap-3">
      {Array(6).fill(0).map((_, i) => (
        <div key={i} className="skeleton rounded-2xl" style={{ height: 220 }} />
      ))}
    </div>
  )

  return (
    <div className="px-4 pt-5 space-y-4 animate-fade-in">
      <h1 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        ❤️ Избранное
      </h1>

      {favorites.length === 0 ? (
        <div className="flex flex-col items-center py-24 gap-5">
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center"
            style={{
              background: 'rgba(239,68,68,0.07)',
              border: '1px solid rgba(239,68,68,0.15)',
            }}
          >
            <Heart size={44} style={{ color: 'rgba(239,68,68,0.5)' }} />
          </div>
          <div className="text-center">
            <p className="font-semibold" style={{ color: 'var(--text)' }}>
              Нет избранных товаров
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--hint)' }}>
              Нажми ♥ на карточке товара
            </p>
          </div>
          <Link to="/catalog" className="btn-primary" style={{ maxWidth: 220 }}>
            В каталог
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {favorites.map(p => (
            <ProductCard
              key={p.id}
              product={p}
              isFavorite
              onFavoriteToggle={handleToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}
