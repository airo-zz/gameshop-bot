/**
 * src/api/admin.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Types and API methods for admin panel.
 * All endpoints under /admin/* - accessible only to admin users.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { apiClient } from './client'
import type { Review, ReviewKind } from './index'

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
  | 'clarification'
  | 'completed'
  | 'cancelled'
  | 'refunded'

export interface AssignedAdmin {
  id: string
  username: string | null
  first_name: string
  color_index: number
}

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
  assigned_admin: AssignedAdmin | null
  assigned_at: string | null
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
  input_data: Record<string, { game_name: string; fields: { key: string; label: string; value: string }[] }>
  notes: string | null
  cancel_reason: string | null
  created_at: string
  paid_at: string | null
  processing_started_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  assigned_admin: AssignedAdmin | null
  assigned_at: string | null
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
  custom_order_enabled?: boolean
  sort_order: number
  type: 'game' | 'service'
  input_fields?: Record<string, unknown>[]
  seo_title?: string | null
  seo_description?: string | null
  seo_aliases?: string | null
  seo_text?: string | null
  created_at: string
}

export interface AdminProductListItem {
  id: string
  category_id: string
  name: string
  price: number
  original_price: number | null
  badge: string | null
  stock: number | null
  is_out_of_stock: boolean
  delivery_type: string
  is_active: boolean
  sort_order: number
  created_at: string
  meta?: { fazer?: FazerMapping } & Record<string, unknown>
}

export interface AdminProductDetail {
  id: string
  category_id: string
  name: string
  description: string | null
  short_description: string | null
  price: number
  price_usd: number | null
  original_price: number | null
  quantity: number
  badge: string | null
  stock: number | null
  is_out_of_stock: boolean
  delivery_type: string
  input_fields: unknown[]
  instruction: string | null
  images: string[]
  is_active: boolean
  sort_order: number
  created_at: string
  meta?: Record<string, unknown> | null
}

export interface HomeBlocks {
  hero_game_ids: string[]
  popular_category_ids: string[]
}

export interface AdminCategory {
  id: string
  game_id: string
  parent_id: string | null
  name: string
  slug: string
  description?: string | null
  is_active: boolean
  is_featured: boolean
  sort_order: number
  input_fields?: Record<string, unknown>[] | null
  // Движок автовыдачи (T20): null = нет; telegram_stars | telegram_premium
  auto_engine?: string | null
}

// ── CSV Import (ggsel) ─────────────────────────────────────────────────────────

export interface ImportProductItem {
  name: string
  /** Модификатор к базовой цене оффера (может быть отрицательным). */
  price_modifier: number
}

export interface ImportCategoryItem {
  name: string
  products: ImportProductItem[]
}

export interface ImportInputField {
  key: string
  label: string
  type: string
  required: boolean
}

export interface ImportPreview {
  categories: ImportCategoryItem[]
  input_fields: ImportInputField[]
  warnings: string[]
  stats: { categories: number; products: number; input_fields: number; warnings: number }
}

export interface ImportCommitResult {
  categories_created: number
  products_created: number
}

export interface PricingSettings {
  usd_rub_rate: number
  usd_rub_rate_updated_at: string | null
  markup_crypto: number
  markup_card: number
  markup_sbp: number
  markup_balance: number
}

export interface IntegrationsSettings {
  enabled: boolean
  ssid_set: boolean
  ssid_masked: string
  token_set: boolean
  token_masked: string
  ton_token_set: boolean
  ton_token_masked: string
  seed_set: boolean
  seed_masked: string
  payment_method: string
  stars_min: number
  stars_max: number
  show_sender: boolean
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
  monthly_cashback_cap: number | null
  is_active: boolean
  color_hex: string | null
  icon_emoji: string | null
}

export interface ReferralSettings {
  percent: number
  period_months: number
  new_user_discount_percent: number
}

// ── Content (тексты и фото бота) ───────────────────────────────────────────────

export interface ContentVariable {
  name: string
  hint: string
  system: boolean
}

export interface ContentText {
  key: string
  label: string
  group: string
  default: string
  value: string
  is_overridden: boolean
  variables: ContentVariable[]
}

export interface ContentPhoto {
  key: string
  label: string
  group: string
  hint: string
  url: string
  preview_url: string
  is_set: boolean
}

export interface BotContent {
  texts: ContentText[]
  photos: ContentPhoto[]
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

export interface LinkedOrder {
  id: string
  order_number: string
  status: string
  total_amount: number
  assigned_admin_id: string | null
}

export interface AdminChatListItem {
  id: string
  user: AdminChatUserInfo
  last_message_preview: string | null
  last_message_at: string | null
  admin_unread_count: number
  order: LinkedOrder | null
}

export interface AdminChatDetail {
  id: string
  user: AdminChatUserInfo
  created_at: string
  last_message_at: string | null
  messages: AdminChatMessage[]
  order: LinkedOrder | null
}

// ── Admin API ────────────────────────────────────────────────────────────────

export interface AdminReview extends Review {
  source: 'site' | 'ggsel'
  is_visible: boolean
  external_id: string | null
  order_id: string | null
}

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
    page_size?: number
    status?: string
    search?: string
    assigned_to_me?: boolean
    unassigned?: boolean
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

  claimOrder: (id: string) =>
    apiClient.post<{ ok: boolean; assigned_admin: AssignedAdmin; assigned_at: string }>(
      `/admin/orders/${id}/claim`
    ).then(r => r.data),

  unclaimOrder: (id: string) =>
    apiClient.post<{ ok: boolean }>(`/admin/orders/${id}/unclaim`).then(r => r.data),

  // Users
  getUsers: (params?: {
    page?: number
    search?: string
    is_blocked?: boolean
  }) =>
    apiClient.get<PaginatedResponse<AdminUserListItem>>('/admin/users/', { params }).then(r => r.data),

  getUser: (userId: string) =>
    apiClient.get<AdminUserDetail>(`/admin/users/${userId}`).then(r => r.data),

  updateUser: (userId: string, data: { is_blocked?: boolean; blocked_reason?: string; loyalty_level_id?: string; total_spent?: number }) =>
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

  createGame: (data: { name: string; slug?: string; image_url?: string; description?: string; is_active?: boolean; is_featured?: boolean; custom_order_enabled?: boolean; sort_order?: number; type?: 'game' | 'service'; input_fields?: Record<string, unknown>[]; seo_title?: string; seo_description?: string; seo_aliases?: string; seo_text?: string }) =>
    apiClient.post<AdminGame>('/admin/catalog/games', data).then(r => r.data),

  updateGame: (id: string, data: Partial<{ name: string; slug: string; image_url: string; description: string; is_active: boolean; is_featured: boolean; custom_order_enabled: boolean; sort_order: number; type: 'game' | 'service'; input_fields: Record<string, unknown>[]; seo_title: string; seo_description: string; seo_aliases: string; seo_text: string }>) =>
    apiClient.patch<AdminGame>(`/admin/catalog/games/${id}`, data).then(r => r.data),

  deleteGame: (id: string) =>
    apiClient.delete(`/admin/catalog/games/${id}`).then(r => r.data),

  reorderCategories: (items: Array<{ id: string; sort_order: number }>) =>
    apiClient.post('/admin/catalog/categories/reorder', { items }),

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

  // Catalog — CSV Import (ggsel)
  importGgselPreview: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiClient.post<ImportPreview>('/admin/catalog/import/ggsel/preview', fd).then(r => r.data)
  },

  importGgselCommit: (payload: {
    game_id: string
    base_price: number
    categories: ImportCategoryItem[]
    input_fields: ImportInputField[]
  }) =>
    apiClient.post<ImportCommitResult>('/admin/catalog/import/ggsel/commit', payload).then(r => r.data),

  // Integrations (Fragment: Stars/Premium автопополнение)
  getIntegrations: () =>
    apiClient.get<IntegrationsSettings>('/admin/settings/integrations').then(r => r.data),

  updateIntegrations: (data: {
    enabled?: boolean
    stel_ssid?: string
    stel_token?: string
    stel_ton_token?: string
    ton_seed?: string
    payment_method?: string
    stars_min?: number
    stars_max?: number
    show_sender?: boolean
  }) =>
    apiClient.patch<IntegrationsSettings>('/admin/settings/integrations', data).then(r => r.data),

  // Pricing (USD-курс RAPIRA + наценка платёжки)
  getPricing: () =>
    apiClient.get<PricingSettings>('/admin/settings/pricing').then(r => r.data),

  updatePricing: (data: { markup_crypto: number; markup_card: number; markup_sbp: number; markup_balance: number }) =>
    apiClient.patch<PricingSettings>('/admin/settings/pricing', data).then(r => r.data),

  // Главная сайта: игры и разделы в блоках
  getHomeBlocks: () =>
    apiClient.get<HomeBlocks>('/admin/settings/home').then(r => r.data),

  updateHomeBlocks: (data: HomeBlocks) =>
    apiClient.put<HomeBlocks>('/admin/settings/home', data).then(r => r.data),

  // Отзывы: модерация и загрузка с GGSEL
  getReviews: (params: { source?: 'site' | 'ggsel'; kind?: ReviewKind; hidden?: boolean; offset?: number; limit?: number }) =>
    apiClient.get<{ items: AdminReview[]; total: number }>('/admin/reviews', { params }).then(r => r.data),

  setReviewVisible: (id: string, is_visible: boolean) =>
    apiClient.patch<AdminReview>(`/admin/reviews/${id}`, { is_visible }).then(r => r.data),

  syncGgselReviews: () =>
    apiClient.post<{ added: number; updated: number; relinked: number }>('/admin/reviews/sync-ggsel').then(r => r.data),

  // Catalog — Categories
  getCategories: (gameId: string) =>
    apiClient.get<AdminCategory[]>(`/admin/catalog/games/${gameId}/categories`).then(r => r.data),

  createCategory: (data: { game_id: string; parent_id?: string; name: string; slug?: string; is_active?: boolean; sort_order?: number }) =>
    apiClient.post<AdminCategory>('/admin/catalog/categories', data).then(r => r.data),

  updateCategory: (id: string, data: { is_featured?: boolean; is_active?: boolean; sort_order?: number; name?: string; description?: string | null; input_fields?: Record<string, unknown>[]; auto_engine?: string }) =>
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
  }) =>
    apiClient.post<{ updated_count: number }>('/admin/catalog/products/bulk-price-update', data).then(r => r.data),

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
    cashback_percent: number
    monthly_cashback_cap: number | null
    is_active?: boolean
    color_hex?: string
    icon_emoji?: string
  }) =>
    apiClient.post<LoyaltyLevel>('/admin/settings/loyalty', data).then(r => r.data),

  updateLoyaltyLevel: (id: string, data: Partial<{
    name: string
    min_spent: number
    cashback_percent: number
    monthly_cashback_cap: number | null
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

  updateReferralSettings: (data: Partial<ReferralSettings>) =>
    apiClient.patch<ReferralSettings>('/admin/settings/referral', data).then(r => r.data),

  // Content — тексты и фото бота
  getContent: () =>
    apiClient.get<BotContent>('/admin/content').then(r => r.data),

  updateContentText: (key: string, value: string | null) =>
    apiClient
      .patch<{ key: string; value: string; is_overridden: boolean }>(
        `/admin/content/text/${key}`,
        { value },
      )
      .then(r => r.data),

  updateContentPhoto: (key: string, url: string | null) =>
    apiClient
      .patch<{ key: string; url: string; preview_url: string; is_set: boolean }>(
        `/admin/content/photo/${key}`,
        { url },
      )
      .then(r => r.data),

  // Chats
  getChats: (filterMode?: 'all' | 'mine' | 'free') =>
    apiClient.get<AdminChatListItem[]>('/admin/chats', {
      params: filterMode && filterMode !== 'all' ? { filter_mode: filterMode } : undefined,
    }).then(r => r.data),

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

  createCustomLot: (chatId: string, data: { title: string; price: number; description?: string }) =>
    apiClient.post<{ order_id: string; order_number: string }>(`/admin/chats/${chatId}/custom-lot`, data).then(r => r.data),

  notifyUserChat: (chatId: string, text?: string) =>
    apiClient.post(`/admin/chats/${chatId}/notify`, { text }).then(r => r.data),
}

// ── Админка: сессии, сотрудники, журнал, счётчики, поиск ─────────────────────

export interface AdminSessionInfo {
  id: string
  method: string
  method_label: string
  ip: string | null
  user_agent: string | null
  created_at: string
  last_seen_at: string
  current: boolean
}

export interface AdminSecurity {
  email: string | null
  has_password: boolean
  password_set_at: string | null
  sessions: AdminSessionInfo[]
}

export type StaffRole = 'owner' | 'admin' | 'manager' | 'operator' | 'content'

export interface StaffMember {
  id: string
  telegram_id: number
  username: string | null
  first_name: string
  role: StaffRole
  role_label: string
  is_active: boolean
  email: string | null
  has_password: boolean
  created_at: string
  last_seen_at: string | null
  sessions: number
}

export interface StaffRoleInfo {
  role: StaffRole
  label: string
  description: string
  permissions: string[]
}

export interface AuditItem {
  id: string
  created_at: string
  action: string
  action_label: string
  entity_type: string | null
  entity_id: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  description: string | null
  ip: string | null
  admin: { id: string; name: string; username: string | null }
}

export interface AdminSearchResult {
  orders: { id: string; order_number: string; status: string; total: number; created_at: string; user: string | null }[]
  users: { id: string; telegram_id: number; name: string; email: string | null; orders_count: number }[]
  products: { id: string; name: string; game: string; price: number; is_active: boolean }[]
  games: { id: string; name: string; slug: string; is_active: boolean }[]
}

export const adminWorkspaceApi = {
  badges: () =>
    apiClient.get<{ new_orders: number; unread_chats: number }>('/admin/badges').then(r => r.data),
  search: (q: string) =>
    apiClient.get<AdminSearchResult>('/admin/search', { params: { q } }).then(r => r.data),
  logout: () => apiClient.post('/admin/auth/logout').then(r => r.data),

  security: () => apiClient.get<AdminSecurity>('/admin/auth/security').then(r => r.data),
  revokeSession: (id: string) => apiClient.delete(`/admin/auth/sessions/${id}`).then(r => r.data),
  revokeOtherSessions: () => apiClient.post<{ revoked: number }>('/admin/auth/sessions/revoke-others').then(r => r.data),
  credentialsRequest: (email: string) => apiClient.post('/admin/auth/credentials/request', { email }),
  credentialsSave: (data: { email: string; code: string; password: string }) =>
    apiClient.post('/admin/auth/credentials', data).then(r => r.data),

  staff: () => apiClient.get<StaffMember[]>('/admin/staff').then(r => r.data),
  staffRoles: () => apiClient.get<StaffRoleInfo[]>('/admin/staff/roles').then(r => r.data),
  staffAdd: (query: string, role: StaffRole) =>
    apiClient.post<StaffMember>('/admin/staff', { query, role }).then(r => r.data),
  staffUpdate: (id: string, data: { role?: StaffRole; is_active?: boolean }) =>
    apiClient.patch<StaffMember>(`/admin/staff/${id}`, data).then(r => r.data),
  staffSessions: (id: string) => apiClient.get<AdminSessionInfo[]>(`/admin/staff/${id}/sessions`).then(r => r.data),
  staffRevoke: (id: string) => apiClient.post<{ revoked: number }>(`/admin/staff/${id}/revoke-sessions`).then(r => r.data),

  audit: (params: { admin_id?: string; action?: string; date_from?: string; date_to?: string; offset?: number; limit?: number }) =>
    apiClient.get<{ total: number; items: AuditItem[] }>('/admin/audit', { params }).then(r => r.data),
  auditActions: () =>
    apiClient.get<{ action: string; label: string; count: number }[]>('/admin/audit/actions').then(r => r.data),
}

// ── FazerCards (автовыдача пополнений, гифт-карт и Steam) ─────────────────────

export type FazerKind = 'topup' | 'giftcard' | 'steam_topup'

/** Привязка товара к FazerCards — Product.meta.fazer */
export interface FazerMapping {
  kind: FazerKind
  category_id?: string
  category_name?: string
  offer_ids?: string[]
  card_ids?: string[]
  offer_names?: string[]
  cost_usd?: number
  validate?: boolean
  currency?: string
  steam_amount?: number
}

export interface FazerOverview {
  enabled: boolean
  api_key_set: boolean
  api_key_masked: string
  low_balance: number
  balance: number | null
  balance_at: string | null
  error: string
  profile: { login?: string; plan?: string; planExpiresAt?: string; subscriptionActive?: boolean } | null
}

export interface FazerGame {
  category_id: string
  name: string
  validate: boolean
}

export interface FazerOffer {
  id: string
  name: string
  price_usd: number
  stock: number | null
}

export interface FazerField {
  key: string
  label?: string
  type?: string
  options?: Record<string, unknown>[]
}

export interface FazerGameDetails {
  category_id: string
  name: string
  note: string
  offers: FazerOffer[]
  fields: FazerField[]
  validate: boolean
}

/** Результат выдачи в OrderItem.delivery_data.fazer */
export interface FazerDeliveryInfo {
  attempt?: number
  kind?: FazerKind
  state?: 'ok' | 'pending' | 'fail' | 'refunded' | 'queued'
  detail?: string
  cost_usd?: number | null
  orders?: { id: string; state: string; status: string }[]
  at?: string
}

export const fazerApi = {
  overview: () => apiClient.get<FazerOverview>('/admin/fazer/overview').then(r => r.data),
  updateConfig: (data: { enabled?: boolean; api_key?: string; low_balance?: number }) =>
    apiClient.patch<FazerOverview>('/admin/fazer/config', data).then(r => r.data),
  games: (kind: 'topup' | 'giftcard', q: string) =>
    apiClient.get<{ total: number; found: number; items: FazerGame[] }>('/admin/fazer/games', { params: { kind, q } }).then(r => r.data),
  game: (kind: 'topup' | 'giftcard', category_id: string, fresh = false) =>
    apiClient.get<FazerGameDetails>('/admin/fazer/game', { params: { kind, category_id, fresh } }).then(r => r.data),
  steamRates: () =>
    apiClient.get<{ base: string; rates: Record<string, number>; updated_at: string }>('/admin/fazer/steam-rates').then(r => r.data),
  importOffers: (data: {
    category_id: string
    kind: 'topup' | 'giftcard'
    fazer_category_id: string
    offer_ids: string[]
    margin_percent: number
    apply_fields: boolean
    validate_id: boolean
  }) => apiClient.post<{ created: number; fields_set: boolean; product_ids: string[] }>('/admin/fazer/import', data).then(r => r.data),
  importSteam: (data: { category_id: string; currency: string; margin_percent: number; name?: string; min_amount: number }) =>
    apiClient.post<{ created: number }>('/admin/fazer/import-steam', data).then(r => r.data),
  link: (productId: string, mapping: FazerMapping | null) =>
    apiClient.put<{ meta: Record<string, unknown>; delivery_type: string }>(`/admin/fazer/products/${productId}/link`, { mapping }).then(r => r.data),
  redeliver: (itemId: string, fields: Record<string, string>) =>
    apiClient.post<{ ok: boolean }>(`/admin/fazer/order-items/${itemId}/redeliver`, { fields }).then(r => r.data),
}
