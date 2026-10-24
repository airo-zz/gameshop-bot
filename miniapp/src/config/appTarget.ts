/**
 * src/config/appTarget.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Цель сборки: 'telegram' (Mini App, base /app/), 'web' (сайт, base /) или
 * 'admin' (админка на admin.redonate.gg, base /).
 * Значение инъектируется на этапе сборки через vite `define`
 * (import.meta.env.VITE_APP_TARGET). По умолчанию — 'telegram', поэтому
 * обычная сборка `vite build` без переменной не меняет поведение /app.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type AppTarget = 'telegram' | 'web' | 'admin'

const RAW_TARGET = import.meta.env.VITE_APP_TARGET as AppTarget
export const APP_TARGET: AppTarget = RAW_TARGET === 'web' || RAW_TARGET === 'admin' ? RAW_TARGET : 'telegram'

export const isWeb = APP_TARGET === 'web'
export const isTelegram = APP_TARGET === 'telegram'
/** Отдельная сборка админки (admin.redonate.gg): вход по cookie-сессии */
export const isAdminApp = APP_TARGET === 'admin'

/** Источник оплаты для бэкенда — определяет URL возврата после оплаты. */
export const PAY_SOURCE: 'web' | 'miniapp' = isWeb ? 'web' : 'miniapp'

/** basename роутера: сайт живёт в корне, miniapp — в /app. */
export const ROUTER_BASENAME = isTelegram ? '/app' : '/'

// ── Внешние ссылки бренда ──────────────────────────────────────────────────
export const SHOP_NAME = (import.meta.env.VITE_SHOP_NAME as string) || 'reDonate'
export const SITE_URL = 'https://redonate.gg'
// Username бота берётся из сборочной переменной (в CI = redonate_robot),
// как и в остальных местах приложения; фолбэк на дефолт из settings.py.
export const BOT_USERNAME = (import.meta.env.VITE_BOT_USERNAME as string) || 'reDonate_robot'
export const BOT_URL = `https://t.me/${BOT_USERNAME}`
export const MINIAPP_URL = `https://t.me/${BOT_USERNAME}?startapp`
export const SUPPORT_BOT_URL = 'https://t.me/reDonateSupport_bot'
export const ADMIN_URL = 'https://admin.redonate.gg'
