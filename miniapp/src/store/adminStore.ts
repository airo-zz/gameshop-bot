/**
 * src/store/adminStore.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Zustand store for admin panel.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { create } from 'zustand'

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
  status: string
  search: string
  setPage: (page: number) => void
  setStatus: (status: string) => void
  setSearch: (search: string) => void
  reset: () => void
}

export const useAdminOrdersStore = create<AdminOrdersState>((set) => ({
  page: 1,
  status: 'new',
  search: '',
  setPage: (page) => set({ page }),
  setStatus: (status) => set({ status, page: 1 }),
  setSearch: (search) => set({ search, page: 1 }),
  reset: () => set({ page: 1, status: 'new', search: '' }),
}))

// ── Admin Users Store ─────────────────────────────────────────────────────────

interface AdminUsersState {
  page: number
  search: string
  isBlocked: boolean | null
  setPage: (page: number) => void
  setSearch: (search: string) => void
  setIsBlocked: (v: boolean | null) => void
  reset: () => void
}

export const useAdminUsersStore = create<AdminUsersState>((set) => ({
  page: 1,
  search: '',
  isBlocked: null,
  setPage: (page) => set({ page }),
  setSearch: (search) => set({ search, page: 1 }),
  setIsBlocked: (v) => set({ isBlocked: v, page: 1 }),
  reset: () => set({ page: 1, search: '', isBlocked: null }),
}))

// ── Admin Catalog Store ───────────────────────────────────────────────────────

interface AdminCatalogState {
  page: number
  gameId: string | null
  search: string
  setPage: (page: number) => void
  setGameId: (id: string | null) => void
  setSearch: (search: string) => void
  reset: () => void
}

export const useAdminCatalogStore = create<AdminCatalogState>((set) => ({
  page: 1,
  gameId: null,
  search: '',
  setPage: (page) => set({ page }),
  setGameId: (id) => set({ gameId: id, page: 1 }),
  setSearch: (search) => set({ search, page: 1 }),
  reset: () => set({ page: 1, gameId: null, search: '' }),
}))
