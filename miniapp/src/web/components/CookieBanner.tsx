/**
 * src/web/components/CookieBanner.tsx
 * Плашка о cookie при первом визите: «Принять» включает Яндекс.Метрику,
 * «Только необходимые» — без аналитики. Выбор хранится в браузере.
 * Та же плашка приходит в HTML с сервера (api/routers/seo.py, видна сразу);
 * поэтому здесь без анимации появления — React подхватывает её на месте.
 */
import { useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { getCookieConsent, setCookieConsent, type CookieConsent } from '@/web/seo'

export default function CookieBanner() {
  const [shown, setShown] = useState(() => getCookieConsent() === null)
  const choose = (v: CookieConsent) => { setCookieConsent(v); setShown(false) }

  return (
    <AnimatePresence>
      {shown && (
        // Обёртка: по центру снизу; на телефоне справа место под кнопку чата
        <m.div
          key="cookie"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none flex justify-start md:justify-center pl-4 pr-[88px] md:px-24"
          style={{ position: 'fixed', left: 0, right: 0, bottom: 16, zIndex: 180, marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
        <m.div
          id="cookie-banner"
          role="region"
          aria-label="Cookie"
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-auto w-full max-w-[560px] rounded-2xl border border-[var(--border)] bg-[var(--bg2)] p-4 md:p-5"
          style={{ boxShadow: '0 16px 40px rgba(0,0,0,0.45)' }}
        >
          <p className="text-[13px] leading-relaxed text-[var(--text-2)]">
            Мы используем cookie: необходимые — для входа и корзины, аналитические (Яндекс.Метрика) —
            чтобы улучшать сайт. Подробнее — в{' '}
            <a href="/app/legal/privacy.html#cookie" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--text)]">
              политике конфиденциальности
            </a>.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => choose('all')}
              className="h-10 px-4 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors"
            >
              Принять
            </button>
            <button
              type="button"
              onClick={() => choose('necessary')}
              className="h-10 px-4 rounded-xl text-sm text-[var(--text-2)] bg-[var(--bg3)] hover:text-[var(--text)] transition-colors"
            >
              Только необходимые
            </button>
          </div>
        </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
