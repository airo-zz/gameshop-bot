/**
 * src/api/admin.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Types and API methods for admin panel.
 * All endpoints under /admin/* - accessible only to admin users.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { apiClient } from './client'

// ── Admin Me ─────────────────────────────────────────────────────────────────

export interface AdminMe {
  id: string
  telegram_id: number
  username: string | null
  first_name: string
  role: string
  permissions: string[]
}

// ── Dashboard ────────────────────────────────────────────────────────────────

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

// ── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

// ── Orders ───────────────────────────────────────────────────────────────────

export type AdminOrderStatus =
  | 'new'
  | 'pending_payment'
  | 'paid'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'refunded'

export interface AdminOrderListItem {
  id: string
  order_number: string
  status: string
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

export interface AdminOrderDetailUser {
  id: string
  telegram_id: number
  username: string | null
  first_name: string
  last_name: string | null
  balance: number
  orders_count: number
  total_spent: number
  is_blocked: boolean
}

export interface AdminOrderDetailItem {
  id: string
  product_id: string
  product_name: string
  lot_name: string | null
  quantity: number
  unit_price: number
  total_price: number
  input_data: Record<string, unknown> | null
  delivery_data: Record<string, unknown> | null
  delivered_at: string | null
}

export interface AdminOrderDetail {
  id: string
  order_number: string
  status: string
  subtotal: number
  discount_amount: number
  total_amount: number
  payment_method: string | null
  notes: string | null
  cancel_reason: string | null
  created_at: string
  paid_at: string | null
  processing_started_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  user: AdminOrderDetailUser
  items: AdminOrderDetailItem[]
  status_history: Array<{
    id: string
    from_status: string | null
    to_status: string
    changed_by_type: string
    reason: string | null
    created_at: string
  }>
  payments: Array<{
    id: string
    method: string
    status: string
    amount: number
    currency: string
    external_id: string | null
    paid_at: string | null
    created_at: string
  }>
}

// ── Users ────────────────────────────────────────────────────────────────────

export interface AdminUserListItem {
  id: string
  telegram_id: number
  username: string | null
  first_name: string
  last_name: string | null
  photo_url: string | null
  balance: number
  total_spent: number
  orders_count: number
  is_blocked: boolean
  blocked_reason: string | null
  loyalty_level: { id: string; name: string } | null
  created_at: string
  last_active_at: string | null
}

export interface AdminUserDetail {
  id: string
  telegram_id: number
  username: string | null
  first_name: string
  last_name: string | null
  language_code: string | null
  phone: string | null
  photo_url: string | null
  referral_code: string | null
  referred_by_id: string | null
  balance: number
  total_spent: number
  orders_count: number
  is_blocked: boolean
  blocked_reason: string | null
  blocked_at: string | null
  loyalty_level: {
    id: string
    name: string
    discount_percent: number
    cashback_percent: number
    color_hex: string | null
    icon_emoji: string | null
  } | null
  created_at: string
  last_active_at: string | null
  orders: Array<{
    id: string
    order_number: string
    status: string
    total_amount: number
    payment_method: string | null
    created_at: string
  }>
  balance_transactions: Array<{
    id: string
    amount: number
    balance_before: number
    balance_after: number
    type: string
    description: string | null
    created_at: string
  }>
}

// ── Catalog ──────────────────────────────────────────────────────────────────

export interface AdminGame {
  id: string
  name: string
  slug: string
  image_url: string | null
  description: string | null
  is_active: boolean
  is_featured: boolean
  sort_order: number
  type: 'game' | 'service'
  created_at: string
}

export interface AdminProductListItem {
  id: string
  category_id: string
  name: string
  price: number
  stock: number | null
  delivery_type: string
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface AdminProductDetail {
  id: string
  category_id: string
  name: string
  description: string | null
  short_description: string | null
  price: number
  stock: number | null
  delivery_type: string
  input_fields: unknown[]
  instruction: string | null
  images: string[]
  is_active: boolean
  sort_order: number
  lots: AdminLot[]
  created_at: string
}

export interface AdminLot {
  id: string
  product_id: string
  name: string
  price: number
  original_price: number | null
  quantity: number
  badge: string | null
  is_active: boolean
  sort_order: number
}

export interface AdminCategory {
  id: string
  game_id: string
  parent_id: string | null
  name: string
  slug: string
  is_active: boolean
  is_featured: boolean
  sort_order: number
}

// ── Discounts ────────────────────────────────────────────────────────────────

export interface DiscountRule {
  id: string
  name: string
  description: string | null
  type: string
  target_id: string | null
  discount_value_type: string
  discount_value: number
  min_order_amount: number
  max_discount_amount: number | null
  stackable: boolean
  priority: number
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  usage_limit: number | null
  usage_count: number
  created_at: string
}

export interface PromoCode {
  id: string
  code: string
  discount_rule_id: string
  discount_rule_name: string
  max_uses: number | null
  used_count: number
  per_user_limit: number
  is_active: boolean
  expires_at: string | null
  created_at: string
}

// ── Settings ─────────────────────────────────────────────────────────────────

export interface LoyaltyLevel {
  id: string
  name: string
  min_spent: number
  discount_percent: number
  cashback_percent: number
  is_active: boolean
  color_hex: string | null
  icon_emoji: string | null
}

export interface ReferralSettings {
  bonus_amount: number
}

// ── Chats ────────────────────────────────────────────────────────────────────

export interface AdminChatUserInfo {
  telegram_id: number
  username: string | null
  first_name: string
}

export interface AdminChatMessage {
  id: string
  chat_id: string
  sender_type: 'user' | 'admin' | 'system'
  text: string | null
  attachments: string[]
  created_at: string
}

export interface AdminChatListItem {
  id: string
  user: AdminChatUserInfo
  last_message_preview: string | null
  last_message_at: string | null
  admin_unread_count: number
}

export interface AdminChatDetail {
  id: string
  user: AdminChatUserInfo
  created_at: string
  last_message_at: string | null
  messages: AdminChatMessage[]
}

// ── Admin API ────────────────────────────────────────────────────────────────

export const adminApi = {
  // Auth
  getMe: () =>
    apiClient.get<AdminMe>('/admin/me').then(r => r.data),

  // Dashboard
  getDashboard: () =>
    apiClient.get<DashboardStats>('/admin/dashboard').then(r => r.data),

  // Orders
  getOrders: (params?: {
    page?: number
    status?: string
    search?: string
  }) =>
    apiClient.get<PaginatedResponse<AdminOrderListItem>>('/admin/orders', { params }).then(r => r.data),

  getOrder: (id: string) =>
    apiClient.get<AdminOrderDetail>(`/admin/orders/${id}`).then(r => r.data),

  updateOrderStatus: (id: string, status: string, reason?: string) =>
    apiClient.patch(`/admin/orders/${id}/status`, { status, reason }).then(r => r.data),

  deleteOrder: (id: string, reason?: string) =>
    apiClient.delete(`/admin/orders/${id}`, { params: reason ? { reason } : {} }).then(r => r.data),

  getTrashOrders: (page = 1, pageSize = 20) =>
    apiClient.get('/admin/orders/trash', { params: { page, page_size: pageSize } }).then(r => r.data),

  restoreOrder: (id: string) =>
    apiClient.post(`/admin/orders/${id}/restore`).then(r => r.data),

  forceDeleteOrder: (id: string) =>
    apiClient.delete(`/admin/orders/${id}/force`).then(r => r.data),

  addOrderNotes: (id: string, text: string) =>
    apiClient.post(`/admin/orders/${id}/notes`, { text }).then(r => r.data),

  notifyUser: (id: string) =>
    apiClient.post(`/admin/orders/${id}/notify`).then(r => r.data),

  // Users
  getUsers: (params?: {
    page?: number
    search?: string
    is_blocked?: boolean
  }) =>
    apiClient.get<PaginatedResponse<AdminUserListItem>>('/admin/users/', { params }).then(r => r.data),

  getUser: (userId: string) =>
    apiClient.get<AdminUserDetail>(`/admin/users/${userId}`).then(r => r.data),

  updateUser: (userId: string, data: { is_blocked?: boolean; blocked_reason?: string; loyalty_level_id?: string }) =>
    apiClient.patch(`/admin/users/${userId}`, data).then(r => r.data),

  adjustBalance: (userId: string, amount: number, type: 'manual_credit' | 'manual_debit', description?: string) =>
    apiClient.post<{
      user_id: string
      balance_before: number
      balance_after: number
      amount: number
      type: string
      description: string | null
    }>(`/admin/users/${userId}/balance`, { amount, type, description }).then(r => r.data),

  // Catalog — Games
  getGames: (params?: { is_active?: boolean; type?: 'game' | 'service' }) =>
    apiClient.get<AdminGame[]>('/admin/catalog/games', { params }).then(r => r.data),

  createGame: (data: { name: string; slug?: string; image_url?: string; description?: string; is_active?: boolean; is_featured?: boolean; sort_order?: number; type?: 'game' | 'service' }) =>
    apiClient.post<AdminGame>('/admin/catalog/games', data).then(r => r.data),

  updateGame: (id: string, data: Partial<{ name: string; slug: string; image_url: string; description: string; is_active: boolean; is_featured: boolean; sort_order: number; type: 'game' | 'service' }>) =>
    apiClient.patch<AdminGame>(`/admin/catalog/games/${id}`, data).then(r => r.data),

  reorderGames: (items: Array<{ id: string; sort_order: number }>) =>
    apiClient.post('/admin/catalog/games/reorder', { items }),

  reorderProducts: (items: Array<{ id: string; sort_order: number }>) =>
    apiClient.post('/admin/catalog/products/reorder', { items }),

  // Catalog — Products
  getProducts: (params?: { page?: number; page_size?: number; game_id?: string; category_id?: string; search?: string; is_active?: boolean }) =>
    apiClient.get<PaginatedResponse<AdminProductListItem>>('/admin/catalog/products', { params }).then(r => r.data),

  getProduct: (id: string) =>
    apiClient.get<AdminProductDetail>(`/admin/catalog/products/${id}`).then(r => r.data),

  createProduct: (data: Record<string, unknown>) =>
    apiClient.post<AdminProductDetail>('/admin/catalog/products', data).then(r => r.data),

  updateProduct: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<AdminProductDetail>(`/admin/catalog/products/${id}`, data).then(r => r.data),

  getProductKeyStats: (productId: string) =>
    apiClient.get<{ total: number; used: number; available: number }>(`/admin/catalog/products/${productId}/keys`).then(r => r.data),

  addProductKeys: (productId: string, keys: string[]) =>
    apiClient.post<{ added: number }>(`/admin/catalog/products/${productId}/keys`, { keys }).then(r => r.data),

  deleteUnusedProductKeys: (productId: string) =>
    apiClient.delete<{ deleted: number }>(`/admin/catalog/products/${productId}/keys/unused`).then(r => r.data),

  copyProduct: (id: string) =>
    apiClient.post<AdminProductDetail>(`/admin/catalog/products/${id}/copy`).then(r => r.data),

  // Catalog — Categories
  getCategories: (gameId: string) =>
    apiClient.get<AdminCategory[]>(`/admin/catalog/games/${gameId}/categories`).then(r => r.data),

  createCategory: (data: { game_id: string; parent_id?: string; name: string; slug?: string; is_active?: boolean; sort_order?: number }) =>
    apiClient.post<AdminCategory>('/admin/catalog/categories', data).then(r => r.data),

  updateCategory: (id: string, data: { is_featured?: boolean; is_active?: boolean; sort_order?: number; name?: string }) =>
    apiClient.patch<AdminCategory>(`/admin/catalog/categories/${id}`, data).then(r => r.data),

  deleteCategory: (id: string) =>
    apiClient.delete(`/admin/catalog/categories/${id}`),

  deleteProduct: (id: string) =>
    apiClient.delete(`/admin/catalog/products/${id}`).then(r => r.data),

  bulkPriceUpdate: (data: {
    mode: 'percent' | 'fixed'
    value: number
    scope: 'game' | 'category' | 'selected'
    game_id?: string
    category_id?: string
    product_ids?: string[]
    include_lots?: boolean
  }) =>
    apiClient.post<{ updated_count: number }>('/admin/catalog/products/bulk-price-update', data).then(r => r.data),

  // Catalog — Lots
  createLot: (productId: string, data: { name: string; price: number; original_price?: number; quantity?: number; badge?: string; is_active?: boolean; sort_order?: number }) =>
    apiClient.post<AdminLot>(`/admin/catalog/products/${productId}/lots`, data).then(r => r.data),

  updateLot: (lotId: string, data: Partial<{ name: string; price: number; original_price: number; quantity: number; badge: string; is_active: boolean; sort_order: number }>) =>
    apiClient.patch<AdminLot>(`/admin/catalog/lots/${lotId}`, data).then(r => r.data),

  deleteLot: (lotId: string) =>
    apiClient.delete(`/admin/catalog/lots/${lotId}`).then(r => r.data),

  // Upload
  uploadImage: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.post<{ url: string }>('/admin/upload/image', formData).then(r => r.data)
  },

  // Discounts — Rules
  getDiscountRules: () =>
    apiClient.get<DiscountRule[]>('/admin/discounts').then(r => r.data),

  createDiscountRule: (data: Record<string, unknown>) =>
    apiClient.post<DiscountRule>('/admin/discounts', data).then(r => r.data),

  updateDiscountRule: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<DiscountRule>(`/admin/discounts/${id}`, data).then(r => r.data),

  // Discounts — Promos
  getPromos: () =>
    apiClient.get<PromoCode[]>('/admin/discounts/promos').then(r => r.data),

  createPromo: (data: { code: string; discount_rule_id: string; max_uses?: number; per_user_limit?: number; is_active?: boolean; expires_at?: string }) =>
    apiClient.post<PromoCode>('/admin/discounts/promos', data).then(r => r.data),

  createPromoDirect: (data: {
    code: string
    discount_value_type: 'percent' | 'fixed'
    discount_value: number
    max_discount_amount?: number
    min_order_amount?: number
    max_uses?: number
    per_user_limit?: number
    expires_at?: string
  }) =>
    apiClient.post<PromoCode>('/admin/discounts/promos/direct', data).then(r => r.data),

  updatePromo: (id: string, data: { max_uses?: number; per_user_limit?: number; is_active?: boolean; expires_at?: string }) =>
    apiClient.patch<PromoCode>(`/admin/discounts/promos/${id}`, data).then(r => r.data),

  deletePromo: (id: string) =>
    apiClient.delete(`/admin/discounts/promos/${id}`).then(r => r.data),

  // Settings — Loyalty levels
  getLoyaltyLevels: () =>
    apiClient.get<LoyaltyLevel[]>('/admin/settings/loyalty').then(r => r.data),

  createLoyaltyLevel: (data: {
    name: string
    min_spent: number
    discount_percent: number
    cashback_percent: number
    is_active?: boolean
    color_hex?: string
    icon_emoji?: string
  }) =>
    apiClient.post<LoyaltyLevel>('/admin/settings/loyalty', data).then(r => r.data),

  updateLoyaltyLevel: (id: string, data: Partial<{
    name: string
    min_spent: number
    discount_percent: number
    cashback_percent: number
    is_active: boolean
    color_hex: string
    icon_emoji: string
  }>) =>
    apiClient.patch<LoyaltyLevel>(`/admin/settings/loyalty/${id}`, data).then(r => r.data),

  deleteLoyaltyLevel: (id: string) =>
    apiClient.delete(`/admin/settings/loyalty/${id}`),

  // Settings — Referral
  getReferralSettings: () =>
    apiClient.get<ReferralSettings>('/admin/settings/referral').then(r => r.data),

  updateReferralSettings: (data: { bonus_amount: number }) =>
    apiClient.patch<ReferralSettings>('/admin/settings/referral', data).then(r => r.data),

  // Chats
  getChats: () =>
    apiClient.get<AdminChatListItem[]>('/admin/chats').then(r => r.data),

  getChatDetail: (chatId: string) =>
    apiClient.get<AdminChatDetail>(`/admin/chats/${chatId}`).then(r => r.data),

  sendChatMessage: (chatId: string, text: string | null, attachments: string[] = []) =>
    apiClient.post<AdminChatMessage>(`/admin/chats/${chatId}/send`, { text, attachments }).then(r => r.data),

  uploadChatFile: (chatId: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiClient.post<{ url: string }>(`/admin/chats/${chatId}/upload`, fd).then(r => r.data)
  },

  markChatRead: (chatId: string) =>
    apiClient.post(`/admin/chats/${chatId}/read`).then(r => r.data),

  notifyUserChat: (chatId: string, text?: string) =>
    apiClient.post(`/admin/chats/${chatId}/notify`, { text }).then(r => r.data),
}
