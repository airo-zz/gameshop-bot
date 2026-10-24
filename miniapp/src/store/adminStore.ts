/**
 * src/store/adminStore.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Zustand store for admin panel.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { create } from 'zustand'

// ── Admin Auth Store ──────────────────────────────────────────────────────────

export interface AdminMe {
  id: string
  telegram_id: number
  username: string | null
  first_name: string
  role: 'owner' | 'admin' | 'manager' | 'operator' | 'content'
  permissions: string[]
}

interface AdminAuthState {
  isAdmin: boolean
  isChecked: boolean
  me: AdminMe | null
  setAdmin: (v: boolean) => void
  setChecked: () => void
  setMe: (me: AdminMe | null) => void
}

export const useAdminStore = create<AdminAuthState>((set) => ({
  isAdmin: false,
  isChecked: false,
  me: null,
  setAdmin: (v) => set({ isAdmin: v }),
  setChecked: () => set({ isChecked: true }),
  setMe: (me) => set({ me }),
}))

/** Есть ли у сотрудника право (как AdminUser.has_permission: «*» и «orders.*»). */
export function hasPerm(me: AdminMe | null, perm: string): boolean {
  if (!me) return false
  const all = me.permissions
  if (all.includes('*') || all.includes(perm)) return true
  const parts = perm.split('.')
  for (let i = 1; i <= parts.length; i++) {
    if (all.includes(parts.slice(0, i).join('.') + '.*')) return true
  }
  return false
}

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
