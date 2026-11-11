/**
 * src/components/topup/topup.ts
 * Общая логика блока быстрого пополнения (Stars, Premium, Steam, коды сервисов) —
 * для сайта (web/components/QuickTopup.tsx) и мини-аппа (components/topup/MiniTopup.tsx).
 */

import type { HomeTopup, Product } from '@/api'

// у кодов вкладка на каждый сервис — ключ с его slug
export const tabKey = (o: HomeTopup) => (o.kind === 'codes' ? `codes:${o.game_slug}` : o.kind)

// Быстрый выбор суммы: звёзды и валюты Steam
export const PRESETS: Record<string, number[]> = {
  stars: [50, 100, 250, 500, 1000, 2500],
  RUB: [100, 300, 500, 1000, 2000, 5000],
  USD: [5, 10, 20, 50, 100, 200],
  KZT: [1000, 2500, 5000, 10000, 20000, 50000],
  UAH: [100, 200, 500, 1000, 2000],
}
export const CURRENCY_SIGN: Record<string, string> = { RUB: '₽', USD: '$', KZT: '₸', UAH: '₴' }

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
export const starsWord = (n: number) => plural(n, 'звезда', 'звезды', 'звёзд')

/** «Карты PlayStation Турция» → «Турция», «App Store — США» → «США» */
function regionLabel(cat: string, game: string) {
  const dash = cat.split(/\s[-–—]\s/)
  if (dash.length > 1) return dash[dash.length - 1].trim()
  const i = cat.toLowerCase().lastIndexOf(game.toLowerCase())
  return (i >= 0 ? cat.slice(i + game.length) : cat).trim() || cat
}

/** Подписи кнопок разделов сервиса. Если регион повторяется (карты и подписка в одной
 *  стране: «Карты Xbox — США», «Xbox Game Pass — США») — «Карты · США», «Game Pass · США». */
export function regionLabels(names: string[], game: string): string[] {
  const short = names.map((n) => regionLabel(n, game))
  if (new Set(short).size === short.length) return short
  return names.map((n, k) => {
    const head = n.split(/\s[-–—]\s/)[0]
    const at = head.toLowerCase().indexOf(game.toLowerCase())
    const kind = (at >= 0 ? head.slice(0, at) + head.slice(at + game.length) : head).replace(/\s+/g, ' ').trim()
    return kind ? `${kind} · ${short[k]}` : short[k]
  })
}

export const qtyField = (p?: Product) => (p?.input_fields ?? []).find((f) => f.type === 'quantity')
export const isTelegram = (kind: HomeTopup['kind']) => kind === 'stars' || kind === 'premium'

/** «Telegram Premium - 3 месяца» → «3 месяца»; число месяцев — для цены за месяц */
export function premiumTerm(name: string) {
  const term = name.replace(/^.*?\s[-–—]\s*/, '').trim() || name
  const months = Number(term.match(/\d+/)?.[0] ?? 0)
  return { term, months }
}

/** username для подстановки получателем Stars/Premium: свой Telegram, без «@» */
export const ownUsername = (u?: string | null) => (u ?? '').replace(/^@+/, '').trim()
