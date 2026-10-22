// src/components/ui/ProductCard.tsx
import { Link } from 'react-router-dom'
import { useTelegram } from '@/hooks/useTelegram'
import { catalogApi, type Product } from '@/api'
import ImageWithSkeleton from '@/components/ui/ImageWithSkeleton'

interface Props {
  product: Product
  isFavorite?: boolean
  onFavoriteToggle?: (id: string, added: boolean) => void
  hidePrice?: boolean
}

export default function ProductCard({ product, isFavorite = false, onFavoriteToggle, hidePrice = false }: Props) {
  const { haptic } = useTelegram()
  const minPrice = product.price

  const handleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault()
    haptic.impact('light')
    try {
      const res = await catalogApi.toggleFavorite(product.id)
      onFavoriteToggle?.(product.id, res.added)
    } catch {}
  }

  const isOutOfStock = product.is_out_of_stock || (product.stock !== null && product.stock === 0)
  const isAuto = product.delivery_type === 'auto'

  const hasImage = !!product.images[0]

  return (
    <Link
      to={product.game_slug
        ? `/catalog/${product.game_slug}${product.category_id ? `?cat=${product.category_id}` : ''}`
        : `/catalog`}
      className="relative flex flex-col overflow-hidden product-card-hover"
      style={{
        background: 'var(--bg2)',
        borderRadius: '12px',
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

          {/* Featured badge */}
          {product.is_featured && (
            <span
              className="absolute top-2 left-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-md z-10"
              style={{
                background: '#EF4444',
                color: '#fff',
              }}
            >
              ХИТ
            </span>
          )}

          {/* Auto delivery badge */}
          {isAuto && !isOutOfStock && (
            <span
              className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md z-10"
              style={{
                background: 'rgba(11,12,15,0.85)',
                color: '#34d399',
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
              style={{ background: 'rgba(11,12,15,0.75)' }}
            >
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-md"
                style={{ background: 'var(--bg2)', color: 'var(--hint)' }}
              >
                Нет в наличии
              </span>
            </div>
          )}

          {/* Favorite button */}
          <button
            type="button"
            className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center active:opacity-70 z-20"
            style={{ background: 'rgba(11,12,15,0.7)' }}
            onClick={handleFavorite}
          >
            <svg width="13" height="13" viewBox="0 0 24 24"
                 fill={isFavorite ? '#ef4444' : 'none'}
                 stroke={isFavorite ? '#ef4444' : 'rgba(220,235,255,0.7)'}
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
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                style={{
                  background: '#EF4444',
                  color: '#fff',
                }}
              >
                ХИТ
              </span>
            )}
            {isAuto && !isOutOfStock && (
              <span
                className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                style={{
                  background: 'rgba(16,185,129,0.14)',
                  color: '#34d399',
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
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                style={{ background: 'var(--bg3)', color: 'var(--hint)' }}
              >
                Нет в наличии
              </span>
            )}
          </div>
        )}

        {product.game_name && (
          <p
            className="text-[10px] font-medium leading-tight"
            style={{ color: 'var(--hint)' }}
          >
            {product.game_name}
          </p>
        )}
        <p
          className="text-sm font-medium line-clamp-2 leading-snug"
          style={{ color: 'var(--text)' }}
        >
          {product.name}
        </p>

        {!hidePrice && (
          <p
            className="text-base font-semibold mt-auto"
            style={{ color: 'var(--text)' }}
          >
            {minPrice.toLocaleString('ru')} ₽
          </p>
        )}
      </div>

      {/* Favorite button — shown in corner when no image */}
      {!hasImage && (
        <button
          type="button"
          className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center active:opacity-70"
          style={{ background: 'var(--bg3)' }}
          onClick={handleFavorite}
        >
          <svg width="13" height="13" viewBox="0 0 24 24"
               fill={isFavorite ? '#ef4444' : 'none'}
               stroke={isFavorite ? '#ef4444' : 'rgba(220,235,255,0.5)'}
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21C12 21 3 14.5 3 8.5a5 5 0 0 1 9-3 5 5 0 0 1 9 3C21 14.5 12 21 12 21z" />
          </svg>
        </button>
      )}
    </Link>
  )
}
