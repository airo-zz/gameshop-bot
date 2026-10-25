/**
 * src/web/components/CookieBanner.tsx
 * Плашка о cookie при первом визите — полоса во всю ширину внизу экрана, как на
 * большинстве сайтов. «Принять» включает аналитику; «Только необходимые» — без
 * неё (по 152-ФЗ отказ от аналитики должен быть возможен). Выбор — в браузере.
 *
 * Та же плашка приходит в HTML с сервера (api/routers/seo.py, COOKIE_SSR — вёрстку
 * держать одинаковой), поэтому здесь без анимации появления.
 *
 * Пока плашка на экране, её высота — в CSS-переменной --cookie-h на <html>:
 * кнопка чата, приветствие и нижние панели поднимаются над ней.
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { getCookieConsent, setCookieConsent, type CookieConsent } from '@/web/seo'

function setCookieHeight(px: number) {
  document.documentElement.style.setProperty('--cookie-h', `${Math.round(px)}px`)
}

export default function CookieBanner() {
  const [shown, setShown] = useState(() => getCookieConsent() === null)
  const ref = useRef<HTMLDivElement>(null)
  const choose = (v: CookieConsent) => { setCookieConsent(v); setShown(false) }

  useEffect(() => {
    const el = ref.current
    if (!shown || !el) { setCookieHeight(0); return }
    const ro = new ResizeObserver(() => setCookieHeight(el.offsetHeight))
    ro.observe(el)
    setCookieHeight(el.offsetHeight)
    return () => { ro.disconnect(); setCookieHeight(0) }
  }, [shown])

  return (
    <AnimatePresence>
      {shown && (
        <m.div
          key="cookie"
          ref={ref}
          id="cookie-banner"
          role="region"
          aria-label="Cookie"
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.2 }}
          className="border-t border-[var(--border)] bg-[var(--bg3)]"
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 180,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)', boxShadow: '0 -12px 32px rgba(0,0,0,0.45)',
          }}
        >
          <div className="web-container py-3.5 md:py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-8">
            <p className="flex-1 text-[14px] md:text-[15px] leading-relaxed text-[var(--text)]">
              Мы используем cookie, чтобы сайт работал удобнее. Подробнее — в{' '}
              <a href="/app/legal/privacy.html#cookie" target="_blank" rel="noopener noreferrer" className="underline text-[var(--link)] hover:text-[var(--text)]">
                политике конфиденциальности
              </a>.
            </p>
            <div className="flex items-center gap-4 shrink-0">
              <button
                type="button"
                onClick={() => choose('all')}
                className="h-11 px-7 rounded-xl text-[15px] font-semibold text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors"
              >
                Принять
              </button>
              <button
                type="button"
                onClick={() => choose('necessary')}
                className="text-sm text-[var(--text-2)] underline-offset-4 hover:underline hover:text-[var(--text)]"
              >
                Только необходимые
              </button>
            </div>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
