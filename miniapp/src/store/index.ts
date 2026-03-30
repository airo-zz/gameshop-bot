/**
 * src/store/index.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Zustand стор — глобальное состояние приложения.
 *
 * Два стора:
 *   useAuthStore — авторизация (инициализирована / пользователь)
 *   useCartStore — корзина (количество позиций для бейджа в навбаре)
 * ─────────────────────────────────────────────────────────────────────────
 */

import { create } from 'zustand'

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
  name: import.meta.env.VITE_SHOP_NAME ?? 'GameShop',
  setName: (name) => set({ name }),
}))
