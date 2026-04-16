/**
 * src/api/index.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Все API-методы приложения.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { apiClient } from './client'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Game {
  id: string
  name: string
  slug: string
  image_url: string | null
  banner_url: string | null
  description: string | null
  is_featured: boolean
  sort_order: number
  tags: string[]
  type: 'game' | 'service'
}

export interface Category {
  id: string
  name: string
  slug: string
  image_url: string | null
  description: string | null
  sort_order: number
  parent_id: string | null
  children: Category[]
}

export interface TrendingCategory {
  id: string
  name: string
  slug: string
  game_name: string
  game_slug: string
  game_image_url: string | null
}

export interface Lot {
  id: string
  name: string
  price: number
  original_price: number | null
  quantity: number
  badge: string | null
  sort_order: number
}

export interface Product {
  id: string
  name: string
  game_name?: string | null
  game_slug?: string | null
  short_description: string | null
  description: string | null
  price: number
  currency: string
  images: string[]
  is_featured: boolean
  delivery_type: 'auto' | 'manual' | 'mixed'
  stock: number | null
  lots: Lot[]
  input_fields: InputField[]
  instruction: string | null
  avg_rating: number | null
  reviews_count: number
}

export interface InputField {
  key: string
  label: string
  type: 'text' | 'select' | 'number'
  placeholder?: string
  required: boolean
  options?: string[]
}

export interface CartItem {
  id: string
  product_id: string
  lot_id: string | null
  quantity: number
  price_snapshot: number
  subtotal: number
  input_data: Record<string, string>
  product_name: string
  product_image: string | null
  lot_name: string | null
}

export interface Cart {
  id: string
  items: CartItem[]
  items_count: number
  subtotal: number
  discount_amount: number
  total: number
  promo_code: string | null
  promo_discount: number | null
  expires_at: string | null
}

export interface Order {
  id: string
  order_number: string
  status: string
  subtotal: number
  discount_amount: number
  total_amount: number
  payment_method: string | null
  items: OrderItem[]
  created_at: string
  paid_at: string | null
  completed_at: string | null
}

export interface OrderItem {
  id: string
  product_id: string
  product_name: string
  lot_name: string | null
  quantity: number
  unit_price: number
  total_price: number
  input_data: Record<string, string>
  delivery_data: Record<string, unknown>
  delivered_at: string | null
}

export interface Ticket {
  id: string
  subject: string
  status: 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed'
  order_id?: string | null
  created_at: string
  closed_at: string | null
}

export interface TicketMessage {
  id: string
  sender_type: 'user' | 'admin'
  sender_id: string
  text: string
  attachments: string[]
  is_template_response: boolean
  created_at: string
}

export interface LoyaltyLevelEntry {
  name: string
  min_spent: number
  min_orders: number
  discount_percent: number
  cashback_percent: number
  color_hex: string
  icon_emoji: string
  priority: number
}

export interface Profile {
  telegram_id: number
  username: string | null
  first_name: string
  photo_url: string | null
  balance: number
  orders_count: number
  total_spent: number
  referral_code: string
  referrals_count: number
  loyalty_level_name: string
  loyalty_level_emoji: string
  loyalty_discount_percent: number
  loyalty_cashback_percent: number
  loyalty_color_hex: string
  loyalty_levels: LoyaltyLevelEntry[]
}

// ── Catalog API ───────────────────────────────────────────────────────────────

export const catalogApi = {
  getGames: (type?: 'game' | 'service') =>
    apiClient.get<Game[]>('/catalog/games', { params: type ? { type } : undefined }).then(r => r.data),

  getCategories: (slug: string) =>
    apiClient.get<Category[]>(`/catalog/games/${slug}/categories`).then(r => r.data),

  getProducts: (categoryId: string, page = 0) =>
    apiClient.get<Product[]>('/catalog/products', {
      params: { category_id: categoryId, page }
    }).then(r => r.data),

  getProduct: (id: string) =>
    apiClient.get<Product>(`/catalog/products/${id}`).then(r => r.data),

  search: (q: string, page = 0) =>
    apiClient.get<Product[]>('/catalog/products/search', { params: { q, page } }).then(r => r.data),

  searchGames: (q: string) =>
    apiClient.get<Game[]>('/catalog/games/search', { params: { q } }).then(r => r.data),

  getTrending: () =>
    apiClient.get<Product[]>('/catalog/products/trending').then(r => r.data),

  getTrendingCategories: () =>
    apiClient.get<TrendingCategory[]>('/catalog/categories/trending').then(r => r.data),

  toggleFavorite: (productId: string) =>
    apiClient.post<{ added: boolean }>(`/catalog/products/${productId}/favorite`).then(r => r.data),

  getFavorites: () =>
    apiClient.get<Product[]>('/catalog/favorites').then(r => r.data),

  getRecentlyViewed: () =>
    apiClient.get<Product[]>('/catalog/recently-viewed').then(r => r.data),
}

// ── Cart API ──────────────────────────────────────────────────────────────────

export const cartApi = {
  get: () =>
    apiClient.get<Cart>('/cart').then(r => r.data),

  addItem: (data: { product_id: string; lot_id?: string; quantity: number; input_data: Record<string, string> }) =>
    apiClient.post<{ ok: boolean; item_id: string; item_quantity: number }>('/cart/items', data).then(r => r.data),

  updateItem: (itemId: string, quantity: number) =>
    apiClient.put<{ ok: boolean; deleted: boolean }>(`/cart/items/${itemId}`, { quantity }).then(r => r.data),

  clear: () =>
    apiClient.delete('/cart').then(r => r.data),

  applyPromo: (code: string) =>
    apiClient.post<{ valid: boolean; discount: number; message: string }>('/cart/promo', { code }).then(r => r.data),
}

// ── Orders API ────────────────────────────────────────────────────────────────

export const ordersApi = {
  create: (data: { payment_method: string; crypto_currency?: string; promo_code?: string }) =>
    apiClient.post<Order>('/orders', data).then(r => r.data),

  list: (page = 0) =>
    apiClient.get<Order[]>('/orders', { params: { page } }).then(r => r.data),

  get: (id: string) =>
    apiClient.get<Order>(`/orders/${id}`).then(r => r.data),

  pay: (orderId: string) =>
    apiClient.post<{
      payment_id: string
      method: string
      status: string
      redirect_url?: string
      success?: boolean
    }>(`/payments/orders/${orderId}/pay`).then(r => r.data),
}

// ── Profile API ───────────────────────────────────────────────────────────────

export interface BalanceTransaction {
  id: string
  amount: number
  balance_before: number
  balance_after: number
  type: string
  description: string | null
  created_at: string
}

export interface ReferralUser {
  telegram_id: number
  first_name: string
  username: string | null
  orders_count: number
  joined_at: string
}

export interface ReferralStats {
  referrals_count: number
  referrals: ReferralUser[]
}

export const profileApi = {
  get: () =>
    apiClient.get<Profile>('/profile').then(r => r.data),

  getBalanceHistory: () =>
    apiClient.get<BalanceTransaction[]>('/profile/balance-history').then(r => r.data),

  getReferralStats: () =>
    apiClient.get<ReferralStats>('/profile/referrals').then(r => r.data),
}

// ── Payments API ──────────────────────────────────────────────────────────────

export const paymentsApi = {
  topupBalance: (amount: number, method: 'card_yukassa' | 'crypto', currency?: string) =>
    apiClient.post<{ redirect_url?: string; pay_url?: string; payment_id?: string; invoice_id?: string }>(
      '/payments/balance/topup',
      { amount, method, currency: currency ?? 'USDT' }
    ).then(r => r.data),
}

// ── Support API ───────────────────────────────────────────────────────────────

export const supportApi = {
  createTicket: (data: { subject: string; message: string; order_id?: string; attachments?: string[] }) =>
    apiClient.post<{ ticket_id: string; ok: boolean }>('/support', data).then(r => r.data),

  list: () =>
    apiClient.get<Ticket[]>('/support').then(r => r.data),

  get: (ticketId: string) =>
    apiClient.get<Ticket>(`/support/${ticketId}`).then(r => r.data),

  getMessages: (ticketId: string, limit = 50, beforeId?: string) =>
    apiClient.get<TicketMessage[]>(`/support/${ticketId}/messages`, {
      params: { limit, ...(beforeId ? { before_id: beforeId } : {}) },
    }).then(r => r.data),

  reply: (ticketId: string, text: string, attachments: string[] = []) =>
    apiClient.post<{ ok: boolean; message_id: string }>(`/support/${ticketId}/reply`, { text, attachments }).then(r => r.data),

  upload: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiClient.post<{ url: string }>('/support/upload', fd).then(r => r.data)
  },

  getByOrderId: (orderId: string) =>
    apiClient.get<Ticket>(`/support/by-order/${orderId}`).then(r => r.data),
}
