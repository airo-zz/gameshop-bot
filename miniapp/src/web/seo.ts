/**
 * src/web/seo.ts
 * Клиентская часть SEO сайта.
 *  • usePageMeta — title / description / canonical при переходах внутри SPA
 *    (первую загрузку отдаёт сервер с готовыми метаданными: api/routers/seo.py).
 *    Пока title не известен (тексты страницы грузятся) — ничего не трогаем:
 *    иначе Google, рендеря страницу, запомнит заголовок по умолчанию.
 *  • initMetrika / trackPageView — Яндекс.Метрика, если задан VITE_YM_ID.
 */
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SITE = 'https://redonate.gg'
export const DEFAULT_TITLE = 'reDonate — пополнение игр и цифровых сервисов'
const DEFAULT_DESCRIPTION =
  'Пополнение игровой валюты и цифровых сервисов. Оплата через СБП, банковской картой или криптовалютой. Автоматическая выдача заказов и поддержка операторов.'

function setMeta(selector: string, attr: 'content' | 'href', value: string, create: () => HTMLElement) {
  let el = document.head.querySelector(selector) as HTMLElement | null
  if (!el) { el = create(); document.head.appendChild(el) }
  el.setAttribute(attr, value)
}

export function usePageMeta({ title, description, exact = false }: {
  title?: string; description?: string
  /** title уже готовый (с сервера) — не добавлять «| reDonate» */
  exact?: boolean
}) {
  const { pathname } = useLocation()
  useEffect(() => {
    if (!title) return
    const fullTitle = exact || title.includes('| reDonate') ? title : `${title} | reDonate`
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
  }, [title, description, exact, pathname])
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
  w.dataLayer = w.dataLayer || []
  w.ym = w.ym || function (...a: unknown[]) { (w.ym.a = w.ym.a || []).push(a) }
  w.ym.l = Date.now()
  const s = document.createElement('script')
  s.async = true
  s.src = `https://mc.yandex.ru/metrika/tag.js?id=${YM_ID}`
  document.head.appendChild(s)
  // Просмотр текущей страницы Метрика отправит сама при init (в т.ч. если согласие дали позже)
  lastHitUrl = location.href
  window.ym!(YM_ID, 'init', {
    ssr: true, webvisor: true, clickmap: true, ecommerce: 'dataLayer',
    referrer: document.referrer, url: location.href,
    accurateTrackBounce: true, trackLinks: true,
  })
}

let lastHitUrl = ''

/** Отправляет просмотр страницы при навигации внутри SPA. */
export function useMetrikaPageViews() {
  const { pathname, search } = useLocation()
  useEffect(() => {
    const url = SITE + pathname + search
    if (!YM_ID || !window.ym || url === lastHitUrl) return
    window.ym(YM_ID, 'hit', url, { referer: lastHitUrl || document.referrer })
    lastHitUrl = url
  }, [pathname, search])
}

// ── Электронная коммерция (dataLayer → отчёты «Товары» и «Заказы» в Метрике) ──

export type EcomProduct = { id: string; name: string; price: number; quantity?: number; category?: string }

function ecommerce(payload: Record<string, unknown>) {
  if (!YM_ID || !window.ym) return
  const w = window as any
  w.dataLayer = w.dataLayer || []
  w.dataLayer.push({ ecommerce: { currencyCode: 'RUB', ...payload } })
}

export const trackAdd = (p: EcomProduct) => ecommerce({ add: { products: [p] } })
export const trackRemove = (p: EcomProduct) => ecommerce({ remove: { products: [p] } })
export const trackDetail = (products: EcomProduct[]) => products.length && ecommerce({ detail: { products } })

/** Покупка — один раз на заказ (страницу заказа могут открыть повторно). */
export function trackPurchase(orderId: string, revenue: number, products: EcomProduct[]) {
  if (!YM_ID || !window.ym) return
  const key = `ym_purchase_${orderId}`
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1') } catch { /* приватный режим */ }
  ecommerce({ purchase: { actionField: { id: orderId, revenue }, products } })
}
