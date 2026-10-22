/**
 * src/web/seo.ts
 * Клиентская часть SEO сайта.
 *  • usePageMeta — title / description / canonical при переходах внутри SPA
 *    (первую загрузку отдаёт сервер с готовыми метаданными: api/routers/seo.py).
 *  • initMetrika / trackPageView — Яндекс.Метрика, если задан VITE_YM_ID.
 */
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SITE = 'https://redonate.gg'
const DEFAULT_TITLE = 'reDonate — пополнение игр и цифровых сервисов'
const DEFAULT_DESCRIPTION =
  'Пополнение игровой валюты и цифровых сервисов. Оплата через СБП, банковской картой или криптовалютой. Автоматическая выдача заказов и поддержка операторов.'

function setMeta(selector: string, attr: 'content' | 'href', value: string, create: () => HTMLElement) {
  let el = document.head.querySelector(selector) as HTMLElement | null
  if (!el) { el = create(); document.head.appendChild(el) }
  el.setAttribute(attr, value)
}

export function usePageMeta({ title, description }: { title?: string; description?: string }) {
  const { pathname } = useLocation()
  useEffect(() => {
    const fullTitle = title ? (title.includes('| reDonate') ? title : `${title} | reDonate`) : DEFAULT_TITLE
    const desc = description ?? DEFAULT_DESCRIPTION
    document.title = fullTitle
    setMeta('meta[name="description"]', 'content', desc, () => Object.assign(document.createElement('meta'), { name: 'description' }))
    setMeta('meta[property="og:title"]', 'content', fullTitle, () => {
      const m = document.createElement('meta'); m.setAttribute('property', 'og:title'); return m
    })
    setMeta('meta[property="og:description"]', 'content', desc, () => {
      const m = document.createElement('meta'); m.setAttribute('property', 'og:description'); return m
    })
    setMeta('link[rel="canonical"]', 'href', SITE + (pathname === '/' ? '/' : pathname.replace(/\/$/, '')), () =>
      Object.assign(document.createElement('link'), { rel: 'canonical' }))
  }, [title, description, pathname])
}

// ── Яндекс.Метрика ────────────────────────────────────────────────────────────

const YM_ID = Number(import.meta.env.VITE_YM_ID || 0)

declare global {
  interface Window { ym?: (...args: unknown[]) => void }
}

// ── Согласие на cookie ────────────────────────────────────────────────────────
// 'all' — можно аналитику (Метрика), 'necessary' — только необходимые для работы.
const COOKIE_KEY = 'cookie_consent'
export type CookieConsent = 'all' | 'necessary'

export function getCookieConsent(): CookieConsent | null {
  try {
    const v = localStorage.getItem(COOKIE_KEY)
    return v === 'all' || v === 'necessary' ? v : null
  } catch { return null }
}

export function setCookieConsent(v: CookieConsent) {
  try { localStorage.setItem(COOKIE_KEY, v) } catch { /* приватный режим */ }
  if (v === 'all') initMetrika()
}

/** Метрика ставит cookie — запускаем только после согласия «Принять». */
export function initMetrika() {
  if (!YM_ID || window.ym || getCookieConsent() !== 'all') return
  // Официальный сниппет Метрики (тег), без noscript-пикселя
  const w = window as any
  w.ym = w.ym || function (...a: unknown[]) { (w.ym.a = w.ym.a || []).push(a) }
  w.ym.l = Date.now()
  const s = document.createElement('script')
  s.async = true
  s.src = 'https://mc.yandex.ru/metrika/tag.js'
  document.head.appendChild(s)
  window.ym!(YM_ID, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true, defer: true })
}

/** Отправляет просмотр страницы при навигации внутри SPA. */
export function useMetrikaPageViews() {
  const { pathname, search } = useLocation()
  useEffect(() => {
    if (YM_ID && window.ym) window.ym(YM_ID, 'hit', SITE + pathname + search)
  }, [pathname, search])
}
