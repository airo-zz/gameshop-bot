/**
 * src/config/appTarget.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Цель сборки: 'telegram' (Mini App, base /app/) или 'web' (сайт, base /).
 * Значение инъектируется на этапе сборки через vite `define`
 * (import.meta.env.VITE_APP_TARGET). По умолчанию — 'telegram', поэтому
 * обычная сборка `vite build` без переменной не меняет поведение /app.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type AppTarget = 'telegram' | 'web'

export const APP_TARGET: AppTarget =
  (import.meta.env.VITE_APP_TARGET as AppTarget) === 'web' ? 'web' : 'telegram'

export const isWeb = APP_TARGET === 'web'
export const isTelegram = APP_TARGET === 'telegram'

/** basename роутера: сайт живёт в корне, miniapp — в /app. */
export const ROUTER_BASENAME = isWeb ? '/' : '/app'

// ── Внешние ссылки бренда ──────────────────────────────────────────────────
export const SHOP_NAME = (import.meta.env.VITE_SHOP_NAME as string) || 'reDonate'
export const SITE_URL = 'https://redonate.su'
// Username бота берётся из сборочной переменной (в CI = redonate_robot),
// как и в остальных местах приложения; фолбэк на дефолт из settings.py.
export const BOT_USERNAME = (import.meta.env.VITE_BOT_USERNAME as string) || 'redonate_bot'
export const BOT_URL = `https://t.me/${BOT_USERNAME}`
export const MINIAPP_URL = `https://t.me/${BOT_USERNAME}?startapp`
export const SUPPORT_BOT_URL = 'https://t.me/reDonateSupport_bot'
