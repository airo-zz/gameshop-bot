// src/components/ui/ProductCard.tsx
import { Link } from 'react-router-dom'
import { Heart, Zap, Clock, Package } from 'lucide-react'
import { useTelegram } from '@/hooks/useTelegram'
import { catalogApi, type Product } from '@/api'
import clsx from 'clsx'

interface Props {
  product: Product
  isFavorite?: boolean
  onFavoriteToggle?: (id: string, added: boolean) => void
}

const DELIVERY_ICONS = {
  auto:   <Zap  size={12} />,
  manual: <Clock size={12} />,
  mixed:  <Package size={12} />,
}
const DELIVERY_LABELS = {
  auto:   'Авто',
  manual: 'Вручную',
  mixed:  'Смешанно',
}

export default function ProductCard({ product, isFavorite = false, onFavoriteToggle }: Props) {
  const { haptic } = useTelegram()
  const minPrice = product.lots.length
    ? Math.min(...product.lots.map(l => l.price))
    : product.price

  const handleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault()
    haptic.impact('light')
    try {
      const res = await catalogApi.toggleFavorite(product.id)
      onFavoriteToggle?.(product.id, res.added)
    } catch {}
  }

  const isOutOfStock = product.stock !== null && product.stock === 0

  return (
    <Link
      to={`/product/${product.id}`}
      className={clsx(
        'relative flex flex-col rounded-2xl overflow-hidden animate-fade-in',
        'transition-transform duration-150 active:scale-95'
      )}
      style={{ background: 'var(--bg2)' }}
    >
      {/* Изображение */}
      <div className="relative aspect-square overflow-hidden bg-black/5">
        {product.images[0] ? (
          <img
            src={product.images[0]}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">
            🎮
          </div>
        )}

        {/* Бейдж "Хит" */}
        {product.is_featured && (
          <span className="badge absolute top-2 left-2">🔥 ХИТ</span>
        )}

        {/* Нет в наличии */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white font-bold text-sm">Нет в наличии</span>
          </div>
        )}

        {/* Кнопка избранного */}
        <button
          className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center
                     transition-transform active:scale-90"
          style={{ background: 'rgba(0,0,0,0.3)' }}
          onClick={handleFavorite}
        >
          <Heart
            size={16}
            fill={isFavorite ? '#ef4444' : 'none'}
            stroke={isFavorite ? '#ef4444' : 'white'}
          />
        </button>
      </div>

      {/* Контент */}
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="text-sm font-semibold line-clamp-2 leading-snug" style={{ color: 'var(--text)' }}>
          {product.name}
        </p>

        <div className="flex items-center gap-1 mt-auto">
          <span className="text-xs flex items-center gap-0.5" style={{ color: 'var(--hint)' }}>
            {DELIVERY_ICONS[product.delivery_type]}
            {DELIVERY_LABELS[product.delivery_type]}
          </span>
        </div>

        <p className="text-base font-bold mt-1" style={{ color: 'var(--btn)' }}>
          от {minPrice.toLocaleString('ru')} ₽
        </p>
      </div>
    </Link>
  )
}
