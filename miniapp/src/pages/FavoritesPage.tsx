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
      {Array(4).fill(0).map((_, i) => <div key={i} className="skeleton rounded-2xl" style={{ height: 220 }} />)}
    </div>
  )

  return (
    <div className="px-4 pt-5 pb-4 space-y-4 animate-fade-in">
      <h1 className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>❤️ Избранное</h1>

      {favorites.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-5">
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
          >
            <Heart size={40} style={{ color: 'var(--hint)' }} />
          </div>
          <div className="text-center">
            <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Нет избранных товаров</p>
            <p className="text-sm" style={{ color: 'var(--hint)' }}>Добавляй товары в избранное через ❤️</p>
          </div>
          <Link to="/catalog" className="btn-primary" style={{ maxWidth: 200 }}>В каталог</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {favorites.map(p => (
            <ProductCard key={p.id} product={p} isFavorite onFavoriteToggle={handleToggle} />
          ))}
        </div>
      )}
    </div>
  )
}
