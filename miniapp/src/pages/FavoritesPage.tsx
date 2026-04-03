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
    <div className="px-4 pt-4 grid grid-cols-2 gap-3">
      {Array(4).fill(0).map((_, i) => <div key={i} className="skeleton rounded-2xl" style={{ height: 220 }} />)}
    </div>
  )

  return (
    <div className="px-4 pt-4 space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>❤️ Избранное</h1>

      {favorites.length === 0 ? (
        <div className="flex flex-col items-center py-20 gap-4">
          <Heart size={56} style={{ color: 'var(--bg2)' }} />
          <p style={{ color: 'var(--hint)' }}>Нет избранных товаров</p>
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
