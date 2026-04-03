/**
 * src/store/index.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Zustand стор — глобальное состояние приложения.
 *
 * Сторы:
 *   useAuthStore    — авторизация (инициализирована / пользователь)
 *   useCartStore    — корзина (количество позиций для бейджа в навбаре)
 *   useHistoryStore — история просмотренных товаров (localStorage)
 * ─────────────────────────────────────────────────────────────────────────
 */

import { create } from 'zustand'
import type { Product } from '@/api'

// ── Auth Store ────────────────────────────────────────────────────────────────

interface AuthState {
  isReady: boolean      // Telegram WebApp готов и авторизация прошла
  isError: boolean      // Ошибка авторизации
  setReady: () => void
  setError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  isReady: false,
  isError: false,
  setReady: () => set({ isReady: true, isError: false }),
  setError: () => set({ isError: true }),
}))

// ── Cart Store ────────────────────────────────────────────────────────────────

interface CartState {
  itemsCount: number
  setItemsCount: (count: number) => void
  increment: () => void
  decrement: () => void
}

export const useCartStore = create<CartState>((set) => ({
  itemsCount: 0,
  setItemsCount: (count) => set({ itemsCount: count }),
  increment: () => set((s) => ({ itemsCount: s.itemsCount + 1 })),
  decrement: () => set((s) => ({ itemsCount: Math.max(0, s.itemsCount - 1) })),
}))

// ── Shop Name Store ────────────────────────────────────────────────────────────
// Название магазина может приходить из API (если захотим менять без деплоя)

interface ShopState {
  name: string
  setName: (name: string) => void
}

export const useShopStore = create<ShopState>((set) => ({
  name: import.meta.env.VITE_SHOP_NAME ?? 'reDonate',
  setName: (name) => set({ name }),
}))

// ── UI Store ───────────────────────────────────────────────────────────────────
// Глобальные настройки UI, которые должны быть видны из любого компонента

const LS_PARTICLES_KEY = 'redonate_particles_enabled'

function readParticlesEnabled(): boolean {
  try {
    const stored = localStorage.getItem(LS_PARTICLES_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

interface UIState {
  particlesEnabled: boolean
  setParticlesEnabled: (v: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  particlesEnabled: readParticlesEnabled(),
  setParticlesEnabled: (v) => {
    try { localStorage.setItem(LS_PARTICLES_KEY, String(v)) } catch {}
    set({ particlesEnabled: v })
  },
}))

// ── History Store ──────────────────────────────────────────────────────────────
// Последние просмотренные товары, сохраняются в localStorage

const LS_RECENTLY_VIEWED_KEY = 'recently_viewed'
const RECENTLY_VIEWED_MAX = 5

function readRecentlyViewed(): Product[] {
  try {
    const stored = localStorage.getItem(LS_RECENTLY_VIEWED_KEY)
    if (!stored) return []
    return JSON.parse(stored) as Product[]
  } catch {
    return []
  }
}

interface HistoryState {
  recentlyViewed: Product[]
  addRecentlyViewed: (product: Product) => void
}

export const useHistoryStore = create<HistoryState>((set) => ({
  recentlyViewed: readRecentlyViewed(),
  addRecentlyViewed: (product) => {
    set((state) => {
      const filtered = state.recentlyViewed.filter(p => p.id !== product.id)
      const next = [product, ...filtered].slice(0, RECENTLY_VIEWED_MAX)
      try { localStorage.setItem(LS_RECENTLY_VIEWED_KEY, JSON.stringify(next)) } catch {}
      return { recentlyViewed: next }
    })
  },
}))
