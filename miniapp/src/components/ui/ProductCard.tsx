// src/components/ui/ProductCard.tsx
import { useState } from 'react'
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
  auto:   <Zap  size={11} />,
  manual: <Clock size={11} />,
  mixed:  <Package size={11} />,
}
const DELIVERY_LABELS = {
  auto:   'Авто',
  manual: 'Вручную',
  mixed:  'Смешанно',
}

export default function ProductCard({ product, isFavorite = false, onFavoriteToggle }: Props) {
  const { haptic } = useTelegram()
  const [hovered, setHovered] = useState(false)

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
        'transition-all duration-200 active:scale-95',
        isOutOfStock && 'opacity-75'
      )}
      style={{
        background: 'var(--bg2)',
        border: hovered
          ? '1px solid rgba(99,102,241,0.45)'
          : '1px solid var(--border)',
        boxShadow: hovered
          ? '0 4px 20px rgba(99,102,241,0.12)'
          : '0 2px 12px rgba(0,0,0,0.3)',
        transition: 'border-color 200ms, box-shadow 200ms, transform 150ms',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Изображение */}
      <div className="relative overflow-hidden" style={{ aspectRatio: '1/1' }}>
        {product.images[0] ? (
          <img
            src={product.images[0]}
            alt={product.name}
            className="w-full h-full object-cover"
            style={{
              transform: hovered ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform 300ms ease-out',
            }}
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-4xl"
            style={{ background: '#1a1a28' }}
          >
            🎮
          </div>
        )}

        {/* Нижний градиент */}
        <div
          className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(19,19,26,0.7), transparent)' }}
        />

        {/* Бейдж "ХИТ" */}
        {product.is_featured && (
          <span
            className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
              color: '#fff',
              boxShadow: '0 2px 8px rgba(245,158,11,0.4)',
            }}
          >
            🔥 ХИТ
          </span>
        )}

        {/* Нет в наличии */}
        {isOutOfStock && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(10,10,15,0.65)' }}
          >
            <span
              className="text-xs font-bold px-3 py-1 rounded-full"
              style={{
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444',
              }}
            >
              Нет в наличии
            </span>
          </div>
        )}

        {/* Кнопка избранного */}
        <button
          className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center
                     transition-transform active:scale-90"
          style={{
            background: 'rgba(10,10,15,0.55)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
          onClick={handleFavorite}
        >
          <Heart
            size={14}
            fill={isFavorite ? '#ef4444' : 'none'}
            stroke={isFavorite ? '#ef4444' : 'rgba(255,255,255,0.8)'}
          />
        </button>
      </div>

      {/* Контент */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p
          className="text-sm font-semibold line-clamp-2 leading-snug"
          style={{ color: 'var(--text)' }}
        >
          {product.name}
        </p>

        <div className="flex items-center gap-1 mt-auto">
          <span
            className="text-[11px] flex items-center gap-0.5"
            style={{ color: 'var(--hint)' }}
          >
            {DELIVERY_ICONS[product.delivery_type]}
            {DELIVERY_LABELS[product.delivery_type]}
          </span>
        </div>

        <p
          className="text-sm font-bold mt-0.5"
          style={{ color: '#818cf8' }}
        >
          от {minPrice.toLocaleString('ru')} ₽
        </p>
      </div>
    </Link>
  )
}
