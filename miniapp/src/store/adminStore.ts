/**
 * src/store/adminStore.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Zustand store для admin-панели.
 *
 * useAdminStore — проверка прав, текущий статус загрузки
 * useAdminOrdersStore — фильтры и пагинация списка заказов
 * useAdminUsersStore  — фильтры и пагинация списка пользователей
 * ─────────────────────────────────────────────────────────────────────────
 */

import { create } from 'zustand'
import type { AdminOrderStatus } from '@/api/admin'

// ── Admin Auth Store ──────────────────────────────────────────────────────────

interface AdminAuthState {
  isAdmin: boolean
  isChecked: boolean
  setAdmin: (v: boolean) => void
  setChecked: () => void
}

export const useAdminStore = create<AdminAuthState>((set) => ({
  isAdmin: false,
  isChecked: false,
  setAdmin: (v) => set({ isAdmin: v }),
  setChecked: () => set({ isChecked: true }),
}))

// ── Admin Orders Store ────────────────────────────────────────────────────────

interface AdminOrdersState {
  page: number
  status: AdminOrderStatus | 'all'
  search: string
  setPage: (page: number) => void
  setStatus: (status: AdminOrderStatus | 'all') => void
  setSearch: (search: string) => void
  reset: () => void
}

export const useAdminOrdersStore = create<AdminOrdersState>((set) => ({
  page: 0,
  status: 'all',
  search: '',
  setPage: (page) => set({ page }),
  setStatus: (status) => set({ status, page: 0 }),
  setSearch: (search) => set({ search, page: 0 }),
  reset: () => set({ page: 0, status: 'all', search: '' }),
}))

// ── Admin Users Store ─────────────────────────────────────────────────────────

interface AdminUsersState {
  page: number
  search: string
  isBanned: boolean | null
  setPage: (page: number) => void
  setSearch: (search: string) => void
  setIsBanned: (v: boolean | null) => void
  reset: () => void
}

export const useAdminUsersStore = create<AdminUsersState>((set) => ({
  page: 0,
  search: '',
  isBanned: null,
  setPage: (page) => set({ page }),
  setSearch: (search) => set({ search, page: 0 }),
  setIsBanned: (v) => set({ isBanned: v, page: 0 }),
  reset: () => set({ page: 0, search: '', isBanned: null }),
}))

// ── Admin Catalog Store ───────────────────────────────────────────────────────

interface AdminCatalogState {
  page: number
  gameSlug: string | null
  search: string
  setPage: (page: number) => void
  setGameSlug: (slug: string | null) => void
  setSearch: (search: string) => void
  reset: () => void
}

export const useAdminCatalogStore = create<AdminCatalogState>((set) => ({
  page: 0,
  gameSlug: null,
  search: '',
  setPage: (page) => set({ page }),
  setGameSlug: (slug) => set({ gameSlug: slug, page: 0 }),
  setSearch: (search) => set({ search, page: 0 }),
  reset: () => set({ page: 0, gameSlug: null, search: '' }),
}))
