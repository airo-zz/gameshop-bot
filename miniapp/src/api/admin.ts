/**
 * src/api/admin.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Типы и API-методы для admin-панели.
 * Все эндпоинты под /admin/* — доступны только пользователям с is_admin=true.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { apiClient } from './client'
import type { Order, Product, Game, Category } from './index'

// ── Admin User ────────────────────────────────────────────────────────────────

export interface AdminUser {
  telegram_id: number
  username: string | null
  first_name: string
  photo_url: string | null
  is_admin: boolean
  is_banned: boolean
  balance: number
  orders_count: number
  total_spent: number
  referral_code: string
  referrals_count: number
  loyalty_level_name: string
  loyalty_discount_percent: number
  loyalty_cashback_percent: number
  created_at: string
  last_seen_at: string | null
}

export interface AdminUserListItem {
  telegram_id: number
  username: string | null
  first_name: string
  photo_url: string | null
  is_admin: boolean
  is_banned: boolean
  balance: number
  orders_count: number
  total_spent: number
  created_at: string
}

// ── Admin Order ───────────────────────────────────────────────────────────────

export type AdminOrderStatus =
  | 'pending'
  | 'paid'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'refunded'

export interface AdminOrderListItem {
  id: string
  order_number: string
  status: AdminOrderStatus
  total_amount: number
  payment_method: string | null
  user_telegram_id: number
  user_first_name: string
  user_username: string | null
  items_count: number
  created_at: string
  paid_at: string | null
  completed_at: string | null
}

export interface AdminOrder extends Order {
  user_telegram_id: number
  user_first_name: string
  user_username: string | null
  admin_note: string | null
}

// ── Admin Discount ────────────────────────────────────────────────────────────

export type DiscountType = 'percentage' | 'fixed'

export interface Discount {
  id: string
  code: string
  type: DiscountType
  value: number
  min_order_amount: number | null
  max_uses: number | null
  uses_count: number
  is_active: boolean
  expires_at: string | null
  created_at: string
}

export interface CreateDiscountPayload {
  code: string
  type: DiscountType
  value: number
  min_order_amount?: number | null
  max_uses?: number | null
  is_active?: boolean
  expires_at?: string | null
}

export interface UpdateDiscountPayload extends Partial<CreateDiscountPayload> {}

// ── Admin Dashboard ───────────────────────────────────────────────────────────

export interface DashboardStats {
  orders_today: number
  orders_week: number
  orders_total: number
  revenue_today: number
  revenue_week: number
  revenue_total: number
  users_total: number
  users_today: number
  pending_orders: number
  products_total: number
  products_out_of_stock: number
}

// ── Pagination ────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  has_next: boolean
}

// ── Admin API ─────────────────────────────────────────────────────────────────

export const adminApi = {
  // Dashboard
  getDashboard: () =>
    apiClient.get<DashboardStats>('/admin/dashboard').then(r => r.data),

  // Orders
  getOrders: (params?: {
    page?: number
    status?: AdminOrderStatus
    user_id?: number
    search?: string
  }) =>
    apiClient.get<PaginatedResponse<AdminOrderListItem>>('/admin/orders', { params }).then(r => r.data),

  getOrder: (id: string) =>
    apiClient.get<AdminOrder>(`/admin/orders/${id}`).then(r => r.data),

  updateOrderStatus: (id: string, status: AdminOrderStatus, admin_note?: string) =>
    apiClient.patch<AdminOrder>(`/admin/orders/${id}`, { status, admin_note }).then(r => r.data),

  // Users
  getUsers: (params?: {
    page?: number
    search?: string
    is_banned?: boolean
    is_admin?: boolean
  }) =>
    apiClient.get<PaginatedResponse<AdminUserListItem>>('/admin/users', { params }).then(r => r.data),

  getUser: (telegramId: number) =>
    apiClient.get<AdminUser>(`/admin/users/${telegramId}`).then(r => r.data),

  getUserOrders: (telegramId: number, page = 0) =>
    apiClient.get<PaginatedResponse<AdminOrderListItem>>(`/admin/users/${telegramId}/orders`, {
      params: { page },
    }).then(r => r.data),

  banUser: (telegramId: number, banned: boolean) =>
    apiClient.patch<AdminUser>(`/admin/users/${telegramId}`, { is_banned: banned }).then(r => r.data),

  setAdmin: (telegramId: number, is_admin: boolean) =>
    apiClient.patch<AdminUser>(`/admin/users/${telegramId}`, { is_admin }).then(r => r.data),

  adjustBalance: (telegramId: number, delta: number, reason?: string) =>
    apiClient.post<{ balance: number }>(`/admin/users/${telegramId}/balance`, {
      delta,
      reason,
    }).then(r => r.data),

  // Catalog — Products
  getProducts: (params?: { page?: number; game_slug?: string; search?: string }) =>
    apiClient.get<PaginatedResponse<Product>>('/admin/products', { params }).then(r => r.data),

  createProduct: (data: Partial<Product>) =>
    apiClient.post<Product>('/admin/products', data).then(r => r.data),

  updateProduct: (id: string, data: Partial<Product>) =>
    apiClient.put<Product>(`/admin/products/${id}`, data).then(r => r.data),

  deleteProduct: (id: string) =>
    apiClient.delete(`/admin/products/${id}`).then(r => r.data),

  // Catalog — Games
  getGames: () =>
    apiClient.get<Game[]>('/admin/games').then(r => r.data),

  createGame: (data: Partial<Game>) =>
    apiClient.post<Game>('/admin/games', data).then(r => r.data),

  updateGame: (id: string, data: Partial<Game>) =>
    apiClient.put<Game>(`/admin/games/${id}`, data).then(r => r.data),

  deleteGame: (id: string) =>
    apiClient.delete(`/admin/games/${id}`).then(r => r.data),

  // Catalog — Categories
  getCategories: () =>
    apiClient.get<Category[]>('/admin/categories').then(r => r.data),

  // Discounts
  getDiscounts: (params?: { page?: number; is_active?: boolean }) =>
    apiClient.get<PaginatedResponse<Discount>>('/admin/discounts', { params }).then(r => r.data),

  createDiscount: (data: CreateDiscountPayload) =>
    apiClient.post<Discount>('/admin/discounts', data).then(r => r.data),

  updateDiscount: (id: string, data: UpdateDiscountPayload) =>
    apiClient.patch<Discount>(`/admin/discounts/${id}`, data).then(r => r.data),

  deleteDiscount: (id: string) =>
    apiClient.delete(`/admin/discounts/${id}`).then(r => r.data),
}
