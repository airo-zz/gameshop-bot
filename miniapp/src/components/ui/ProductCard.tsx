// src/components/ui/ProductCard.tsx
import { Link } from 'react-router-dom'
import { useTelegram } from '@/hooks/useTelegram'
import { catalogApi, type Product } from '@/api'
import ImageWithSkeleton from '@/components/ui/ImageWithSkeleton'

interface Props {
  product: Product
  isFavorite?: boolean
  onFavoriteToggle?: (id: string, added: boolean) => void
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
  const isAuto = product.delivery_type === 'auto'

  const hasImage = !!product.images[0]

  return (
    <Link
      to={product.game_slug
        ? `/catalog/${product.game_slug}${product.category_id ? `?cat=${product.category_id}` : ''}`
        : `/catalog`}
      className="relative flex flex-col overflow-hidden transition-all duration-200 active:scale-95 product-card-hover"
      style={{
        background: 'var(--bg2)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '18px',
      }}
    >
      {/* Image area — только когда есть картинка */}
      {hasImage && (
        <div className="relative overflow-hidden" style={{ aspectRatio: '1 / 1' }}>
          <ImageWithSkeleton
            src={product.images[0]}
            alt={product.name}
            aspectRatio="1 / 1"
            objectFit="cover"
            loading="lazy"
            style={{ width: '100%' }}
          />

          {/* Gradient overlay */}
          <div
            className="absolute inset-x-0 bottom-0 h-12 pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(13,13,26,0.9) 0%, transparent 100%)' }}
          />

          {/* Featured badge */}
          {product.is_featured && (
            <span
              className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full z-10"
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                color: '#fff',
                boxShadow: '0 2px 8px rgba(245,158,11,0.4)',
              }}
            >
              ХИТ
            </span>
          )}

          {/* Auto delivery badge */}
          {isAuto && !isOutOfStock && (
            <span
              className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full z-10"
              style={{
                background: 'rgba(16,185,129,0.2)',
                color: '#34d399',
                border: '1px solid rgba(16,185,129,0.3)',
              }}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="#34d399" stroke="none">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
              Авто
            </span>
          )}

          {/* Out of stock overlay */}
          {isOutOfStock && (
            <div
              className="absolute inset-0 flex items-center justify-center z-10"
              style={{ background: 'rgba(8,8,16,0.75)', backdropFilter: 'blur(2px)' }}
            >
              <span
                className="text-white font-bold text-xs px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(239,68,68,0.7)', border: '1px solid rgba(239,68,68,0.5)' }}
              >
                Нет в наличии
              </span>
            </div>
          )}

          {/* Favorite button */}
          <button
            type="button"
            className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90 z-20"
            style={{
              background: 'rgba(8,8,16,0.65)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
            onClick={handleFavorite}
          >
            <svg width="13" height="13" viewBox="0 0 24 24"
                 fill={isFavorite ? '#ef4444' : 'none'}
                 stroke={isFavorite ? '#ef4444' : 'rgba(255,255,255,0.7)'}
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21C12 21 3 14.5 3 8.5a5 5 0 0 1 9-3 5 5 0 0 1 9 3C21 14.5 12 21 12 21z" />
            </svg>
          </button>
        </div>
      )}

      {/* Content */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        {/* Badges row — shown here when no image */}
        {!hasImage && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {product.is_featured && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                  color: '#fff',
                }}
              >
                ХИТ
              </span>
            )}
            {isAuto && !isOutOfStock && (
              <span
                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: 'rgba(16,185,129,0.2)',
                  color: '#34d399',
                  border: '1px solid rgba(16,185,129,0.3)',
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="#34d399" stroke="none">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
                Авто
              </span>
            )}
            {isOutOfStock && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                Нет в наличии
              </span>
            )}
          </div>
        )}

        <p
          className="text-sm font-semibold line-clamp-2 leading-snug"
          style={{ color: 'rgba(255,255,255,0.9)' }}
        >
          {product.name}
        </p>

        <p
          className="text-base font-bold mt-auto"
          style={{ color: 'rgba(255,255,255,0.9)' }}
        >
          от {minPrice.toLocaleString('ru')} ₽
        </p>
      </div>

      {/* Favorite button — shown in corner when no image */}
      {!hasImage && (
        <button
          type="button"
          className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90"
          style={{
            background: 'rgba(8,8,16,0.5)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
          onClick={handleFavorite}
        >
          <svg width="13" height="13" viewBox="0 0 24 24"
               fill={isFavorite ? '#ef4444' : 'none'}
               stroke={isFavorite ? '#ef4444' : 'rgba(255,255,255,0.5)'}
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21C12 21 3 14.5 3 8.5a5 5 0 0 1 9-3 5 5 0 0 1 9 3C21 14.5 12 21 12 21z" />
          </svg>
        </button>
      )}
    </Link>
  )
}
