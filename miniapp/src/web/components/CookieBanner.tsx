/**
 * src/web/components/CookieBanner.tsx
 * Плашка о cookie при первом визите: «Принять» включает Яндекс.Метрику,
 * «Только необходимые» — без аналитики. Выбор хранится в браузере.
 */
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { getCookieConsent, setCookieConsent, type CookieConsent } from '@/web/seo'

export default function CookieBanner() {
  const [shown, setShown] = useState(() => getCookieConsent() === null)
  const choose = (v: CookieConsent) => { setCookieConsent(v); setShown(false) }

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          role="region"
          aria-label="Cookie"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.25 }}
          className="rounded-2xl border border-[var(--border)] bg-[var(--bg2)] p-4 md:p-5"
          style={{
            position: 'fixed', left: 16, bottom: 16, zIndex: 180,
            // справа остаётся место под кнопку чата
            width: 'min(420px, calc(100vw - 104px))',
            boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
            marginBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
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
        </motion.div>
      )}
    </AnimatePresence>
  )
}
