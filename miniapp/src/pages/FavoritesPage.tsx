// src/pages/FavoritesPage.tsx
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { catalogApi } from '@/api'
import ProductCard from '@/components/ui/ProductCard'
import { Heart } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function FavoritesPage() {
  const qc = useQueryClient()
  const { data: favorites = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['favorites'],
    queryFn: catalogApi.getFavorites,
    staleTime: 60_000,
  })

  if (isError) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p className="text-5xl mb-4">😔</p>
      <p className="text-sm mb-4" style={{ color: 'var(--hint)' }}>Не удалось загрузить данные</p>
      <button
        onClick={() => refetch()}
        className="px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-95"
        style={{ background: 'rgba(45,88,173,0.16)', border: '1px solid rgba(45,88,173,0.38)', color: '#6b9de8' }}
      >
        Повторить
      </button>
    </div>
  )

  const handleToggle = (_id: string, _added: boolean) => {
    qc.invalidateQueries({ queryKey: ['favorites'] })
  }

  if (isLoading) return null

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
