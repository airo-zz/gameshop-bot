/**
 * src/components/ui/ImageWithSkeleton.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Картинка с skeleton-анимацией пока не загрузится + fallback при ошибке.
 * Только CSS-переходы (без framer-motion) — дёшево даже в длинных сетках.
 * Картинка из кэша показывается сразу, без повторного fade-in.
 *
 * Props:
 *   src         — URL из API (нормализуется автоматически)
 *   alt         — alt текст
 *   fallback    — ReactNode при отсутствии/ошибке загрузки (по умолчанию иконка геймпада)
 *   className   — дополнительные Tailwind-классы для контейнера
 *   imgClassName — классы непосредственно для <img>
 *   aspectRatio  — CSS aspect-ratio контейнера (default "1 / 1")
 *   objectFit    — CSS object-fit для img (default "cover")
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback } from 'react'
import { Gamepad2 } from 'lucide-react'
import { normalizeImageUrl } from '@/utils/imageUrl'

interface ImageWithSkeletonProps {
  src: string | null | undefined
  alt: string
  fallback?: React.ReactNode
  className?: string
  imgClassName?: string
  aspectRatio?: string
  objectFit?: React.CSSProperties['objectFit']
  loading?: 'lazy' | 'eager'
  style?: React.CSSProperties
}

export default function ImageWithSkeleton({
  src,
  alt,
  fallback,
  className = '',
  imgClassName = '',
  aspectRatio = '1 / 1',
  objectFit = 'cover',
  loading = 'lazy',
  style,
}: ImageWithSkeletonProps) {
  const normalizedSrc = normalizeImageUrl(src)
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    normalizedSrc ? 'loading' : 'error'
  )
  // true — картинка уже была в кэше: показываем без анимации
  const [instant, setInstant] = useState(false)

  const handleLoad = useCallback(() => setStatus('loaded'), [])
  const handleError = useCallback(() => setStatus('error'), [])
  const imgRef = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth > 0) {
      setInstant(true)
      setStatus('loaded')
    }
  }, [])

  const defaultFallback = (
    <div
      className="w-full h-full flex items-center justify-center select-none"
      style={{ background: 'var(--bg3)', color: 'var(--hint)' }}
      aria-hidden="true"
    >
      <Gamepad2 size={28} strokeWidth={1.5} />
    </div>
  )

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio, background: 'var(--bg3)', ...style }}
    >
      {/* Skeleton — видим пока грузится */}
      {status === 'loading' && (
        <div
          className="absolute inset-0 z-10"
          style={{
            background: 'linear-gradient(90deg, var(--bg3) 25%, rgba(220,235,255,0.04) 50%, var(--bg3) 75%)',
            backgroundSize: '200% 100%',
            animation: 'skeletonShimmer 1.6s ease-in-out infinite',
          }}
        />
      )}

      {/* Fallback при ошибке или отсутствии src */}
      {status === 'error' && (fallback ?? defaultFallback)}

      {/* Картинка — рендерим всегда (если есть src), скрываем пока грузится */}
      {normalizedSrc && status !== 'error' && (
        <img
          ref={imgRef}
          src={normalizedSrc}
          alt={alt}
          loading={loading}
          onLoad={handleLoad}
          onError={handleError}
          className={`w-full h-full ${imgClassName}`}
          style={{
            objectFit,
            display: 'block',
            opacity: status === 'loaded' ? 1 : 0,
            transition: instant ? 'none' : 'opacity 0.2s ease',
          }}
        />
      )}
    </div>
  )
}
