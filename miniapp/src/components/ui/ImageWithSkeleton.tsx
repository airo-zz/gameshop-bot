/**
 * src/components/ui/ImageWithSkeleton.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Картинка с skeleton-анимацией пока не загрузится + fallback при ошибке.
 *
 * Props:
 *   src         — URL из API (нормализуется автоматически)
 *   alt         — alt текст
 *   fallback    — ReactNode при отсутствии/ошибке загрузки (по умолчанию 🎮)
 *   className   — дополнительные Tailwind-классы для контейнера
 *   imgClassName — классы непосредственно для <img>
 *   aspectRatio  — CSS aspect-ratio контейнера (default "1 / 1")
 *   objectFit    — CSS object-fit для img (default "cover")
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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

  const handleLoad = useCallback(() => setStatus('loaded'), [])
  const handleError = useCallback(() => setStatus('error'), [])

  const defaultFallback = (
    <div
      className="w-full h-full flex items-center justify-center text-3xl select-none"
      style={{ background: 'var(--bg3)', color: 'rgba(107,157,232,0.35)' }}
      aria-hidden="true"
    >
      🎮
    </div>
  )

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio, background: 'var(--bg3)', ...style }}
    >
      {/* Skeleton pulse — видим пока грузится */}
      <AnimatePresence>
        {status === 'loading' && (
          <motion.div
            key="skeleton"
            className="absolute inset-0 z-10"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              background: 'linear-gradient(90deg, var(--bg3) 25%, rgba(45,88,173,0.08) 50%, var(--bg3) 75%)',
              backgroundSize: '200% 100%',
              animation: 'skeletonShimmer 1.6s ease-in-out infinite',
            }}
          />
        )}
      </AnimatePresence>

      {/* Fallback при ошибке или отсутствии src */}
      {status === 'error' && (fallback ?? defaultFallback)}

      {/* Картинка — рендерим всегда (если есть src), скрываем пока грузится */}
      {normalizedSrc && (
        <motion.img
          src={normalizedSrc}
          alt={alt}
          loading={loading}
          onLoad={handleLoad}
          onError={handleError}
          className={`w-full h-full ${imgClassName}`}
          style={{ objectFit, display: 'block' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: status === 'loaded' ? 1 : 0 }}
          transition={{ duration: 0.25 }}
        />
      )}
    </div>
  )
}
