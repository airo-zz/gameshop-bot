/**
 * src/web/components/BannerCarousel.tsx
 * Карусель баннеров (акции, новинки) на первом экране главной — вместо стены обложек.
 * Баннеры заводятся в админке (Настройки → Главная сайта). Листается сама каждые 6 с,
 * на паузе при наведении мыши; стрелки, точки, свайп на телефоне.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import type { HomeBanner } from '@/api'
import { normalizeImageUrl } from '@/utils/imageUrl'

const AUTOPLAY_MS = 6000

function BannerLink({ b, children }: { b: HomeBanner; children: React.ReactNode }) {
  const cls = 'group absolute inset-0 block'
  if (!b.link) return <div className={cls}>{children}</div>
  if (/^https?:\/\//i.test(b.link)) {
    return <a href={b.link} target="_blank" rel="noopener noreferrer" className={cls} draggable={false}>{children}</a>
  }
  return <Link to={b.link} className={cls} draggable={false}>{children}</Link>
}

export default function BannerCarousel({ banners, intro }: { banners: HomeBanner[]; intro?: boolean }) {
  const reduce = useReducedMotion()
  const [[index, dir], setState] = useState<[number, number]>([0, 0])
  const [paused, setPaused] = useState(false)
  const n = banners.length
  const i = ((index % n) + n) % n
  const b = banners[i]

  const go = useCallback((d: number) => setState(([x]) => [x + d, d]), [])
  const to = (k: number) => setState(([x]) => [k, k > (((x % n) + n) % n) ? 1 : -1])

  useEffect(() => {
    if (n < 2 || paused || reduce) return
    const t = setTimeout(() => go(1), AUTOPLAY_MS)
    return () => clearTimeout(t)
  }, [index, n, paused, reduce, go])

  const img = normalizeImageUrl(b.image_url) ?? b.image_url
  const arrow =
    'hidden md:flex absolute top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full ' +
    'text-white opacity-0 group-hover/c:opacity-100 transition-opacity hover:bg-black/60'

  return (
    <m.div
      className="w-full"
      initial={intro && !reduce ? { opacity: 0, y: 24 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
    >
      <div
        className="group/c relative aspect-[16/9] w-full max-w-full rounded-2xl overflow-hidden bg-[var(--bg2)]"
        style={{ boxShadow: 'inset 0 0 0 1px var(--border)' }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        role="region"
        aria-roledescription="carousel"
        aria-label="Акции и новинки"
      >
        <AnimatePresence initial={false} custom={dir}>
          <m.div
            key={index}
            custom={dir}
            className="absolute inset-0"
            initial={reduce ? { opacity: 0 } : { x: dir >= 0 ? '100%' : '-100%' }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: dir >= 0 ? '-100%' : '100%' }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            drag={n > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60 || info.velocity.x < -400) go(1)
              else if (info.offset.x > 60 || info.velocity.x > 400) go(-1)
            }}
          >
            <BannerLink b={b}>
              <img
                src={img}
                alt={b.title || 'Акция'}
                draggable={false}
                className="w-full h-full object-cover select-none"
              />
              {(b.title || b.subtitle || b.button) && (
                <div
                  className="absolute inset-x-0 bottom-0 p-4 md:p-6 pt-16 flex items-end justify-between gap-4"
                  style={{ background: 'linear-gradient(to top, rgba(8,9,12,0.88), rgba(8,9,12,0.45) 55%, transparent)' }}
                >
                  <div className="min-w-0">
                    {b.title && (
                      <p className="text-lg md:text-2xl font-semibold leading-tight text-white" style={{ textWrap: 'balance' }}>{b.title}</p>
                    )}
                    {b.subtitle && <p className="mt-1 text-sm md:text-[15px] text-white/80 line-clamp-2">{b.subtitle}</p>}
                  </div>
                  {b.button && b.link && (
                    <span className="hidden sm:inline-flex shrink-0 h-10 px-5 items-center rounded-xl text-sm font-semibold text-white bg-[var(--accent)] group-hover:bg-[var(--btn-hover)] transition-colors">
                      {b.button}
                    </span>
                  )}
                </div>
              )}
            </BannerLink>
          </m.div>
        </AnimatePresence>

        {n > 1 && (
          <>
            <button onClick={() => go(-1)} className={arrow + ' left-3'} style={{ background: 'rgba(8,9,12,0.45)' }} aria-label="Предыдущий баннер">
              <ChevronLeft size={20} />
            </button>
            <button onClick={() => go(1)} className={arrow + ' right-3'} style={{ background: 'rgba(8,9,12,0.45)' }} aria-label="Следующий баннер">
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>

      {n > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {banners.map((x, k) => (
            <button
              key={k}
              onClick={() => to(k)}
              aria-label={`Баннер ${k + 1}${x.title ? `: ${x.title}` : ''}`}
              aria-current={k === i}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{ width: k === i ? 22 : 8, background: k === i ? 'var(--accent)' : 'var(--bg3)' }}
            />
          ))}
        </div>
      )}
    </m.div>
  )
}
