/**
 * src/api/index.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Все API-методы приложения.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { apiClient, type TelegramWidgetUser } from './client'

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
  input_fields?: InputField[]
  custom_order_enabled?: boolean
  /** «Украшения Discord» — открывается страница-каталог вместо вкладок */
  decor_catalog?: boolean
}

/** Каталог украшений Discord (общий с discordcatalog.net), GET /catalog/decor */
export interface DecorItem {
  id: string        // product_id
  c: string         // id коллекции (категории)
  i?: number | null // номер товара в коллекции (варианты цвета делят его)
  code: string
  name: string
  en: string
  t: number         // индекс в types
  color: string
  hex: string
  img: string
  price: number
  out: boolean
}

export interface DecorCatalogData {
  game: { id: string; slug: string; name: string }
  collections: { id: string; name: string; slug?: string }[]
  types: string[]
  items: DecorItem[]
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
  delivery_type: 'auto' | 'manual' | 'mixed' | null
  // Авто-движок выдачи (T20): telegram_stars | telegram_premium | null
  auto_engine?: string | null
  // Поля покупателя подраздела (для Telegram собираются тут, а не на оплате)
  input_fields?: InputField[] | null
}

export interface TrendingCategory {
  id: string
  name: string
  slug: string
  game_name: string
  game_slug: string
  game_image_url: string | null
  // «Популярное» на главной сайта: цена «от» и есть ли автовыдача
  min_price?: string | null
  has_auto?: boolean
}

/** Вариант блока быстрого пополнения на главной сайта (api/services/home_service.resolve_topup) */
export interface HomeTopup {
  kind: 'stars' | 'premium' | 'steam'
  game_slug: string
  category_slug: string
  category_name: string
  fields: InputField[]  // поля получателя (@username, логин Steam)
  products: Product[]
}

export interface Product {
  id: string
  name: string
  game_name?: string | null
  game_slug?: string | null
  category_id?: string | null
  short_description: string | null
  description: string | null
  price: number
  original_price: number | null
  currency: string
  quantity: number
  badge: string | null
  images: string[]
  is_featured: boolean
  is_out_of_stock: boolean
  delivery_type: 'auto' | 'manual' | 'mixed'
  stock: number | null
  input_fields: InputField[]
  instruction: string | null
  avg_rating: number | null
  reviews_count: number
}

export interface InputField {
  key: string
  label: string
  type: 'text' | 'select' | 'number' | 'quantity'
  placeholder?: string
  required: boolean
  options?: string[]
  // type=quantity (T19): покупатель вводит количество (напр. звёзд), цена = за 1 ед.
  min?: number
  unit?: string
}

export interface CartItem {
  id: string
  product_id: string
  quantity: number
  price_snapshot: number
  subtotal: number
  input_data: Record<string, string>
  product_name: string
  product_image: string | null
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
  input_data?: Record<string, { game_name: string; fields: { key: string; label: string; value: string }[] }>
  items_count?: number   // присутствует в list-endpoint вместо items
  created_at: string
  paid_at: string | null
  completed_at: string | null
}

export interface OrderItem {
  id: string
  product_id: string
  product_name: string
  game_name: string | null
  quantity: number
  unit_price: number
  total_price: number
  input_data: Record<string, string>
  delivery_data: Record<string, unknown>
  delivered_at: string | null
  instruction: string | null
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

export interface ChatMessage {
  id: string
  chat_id: string
  sender_type: 'user' | 'admin' | 'system'
  text: string | null
  attachments: string[]
  created_at: string
}

export interface LoyaltyLevelEntry {
  name: string
  min_spent: number
  min_orders: number
  discount_percent: number
  cashback_percent: number
  monthly_cashback_cap: number | null
  color_hex: string
  icon_emoji: string
  priority: number
}

export interface Profile {
  telegram_id: number
  username: string | null
  first_name: string
  photo_url: string | null
  /** Почта (вход на сайте по коду); у пользователей без Telegram has_telegram=false */
  email: string | null
  has_telegram: boolean
  /** Согласие на рекламные письма */
  marketing_consent: boolean
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
  // Модель Bybit: уровень по тратам месяца (API отдаёт Decimal строкой — Number())
  loyalty_level_index: number
  loyalty_cashback_cap: number | string | null
  loyalty_month_cashback: number | string
  loyalty_month_spent: number | string
  loyalty_prev_month_spent: number | string
  loyalty_held_from_prev_month: boolean
  loyalty_next_level_name: string | null
  loyalty_next_level_min_spent: number | string | null
  loyalty_period_ends_at: string | null
  /** % пригласившему с каждого заказа друга и срок в месяцах (0 — бессрочно) */
  referral_percent: number | string
  referral_period_months: number
  referral_new_user_discount_percent: number | string
}

// ── Catalog API ───────────────────────────────────────────────────────────────

export interface GameSeo {
  title: string
  description: string
  h1: string
  intro: string
  aliases: string[]
  text: string | null
}

export interface LoyaltyProgram {
  levels: { name: string; min_spent: number; cashback_percent: number; monthly_cashback_cap: number | null; color_hex: string }[]
  referral: { percent: number; period_months: number; new_user_discount_percent: number }
}

export interface FaqSection {
  slug: string
  title: string
  items: { q: string; a: string }[]
}

export const catalogApi = {
  getDecor: () =>
    apiClient.get<DecorCatalogData>('/catalog/decor').then(r => r.data),

  getLoyaltyProgram: () =>
    apiClient.get<LoyaltyProgram>('/catalog/loyalty').then(r => r.data),

  getGames: (type?: 'game' | 'service') =>
    apiClient.get<Game[]>('/catalog/games', { params: type ? { type } : undefined }).then(r => r.data),

  getCategories: (slug: string) =>
    apiClient.get<Category[]>(`/catalog/games/${slug}/categories`).then(r => r.data),

  /** Тексты страницы игры/раздела — те же, что видит поисковик (api/services/seo_content.py) */
  getGameSeo: (slug: string, cat?: string) =>
    apiClient.get<GameSeo>(`/catalog/games/${slug}/seo`, { params: cat ? { cat } : {} }).then(r => r.data),

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

  /** Страница «Вопросы и ответы» (api/services/faq_content.py) */
  getFaq: () =>
    apiClient.get<FaqSection[]>('/catalog/faq').then(r => r.data),

  /** Блоки главной сайта (выбираются в админке, иначе автоматически) */
  getHome: () =>
    apiClient.get<{ hero: Game[]; popular: TrendingCategory[]; topup?: HomeTopup[] }>('/catalog/home').then(r => r.data),

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

  addItem: (data: { product_id: string; quantity: number; input_data: Record<string, string> }) =>
    apiClient.post<{ ok: boolean; item_id: string; item_quantity: number }>('/cart/items', data).then(r => r.data),

  updateItem: (itemId: string, quantity: number) =>
    apiClient.put<{ ok: boolean; deleted: boolean }>(`/cart/items/${itemId}`, { quantity }).then(r => r.data),

  clear: () =>
    apiClient.delete('/cart').then(r => r.data),

  applyPromo: (code: string) =>
    apiClient.post<{ valid: boolean; discount: number; message: string }>('/cart/promo', { code }).then(r => r.data),

  getCheckoutFields: () =>
    apiClient.get<CheckoutFieldGroup[]>('/cart/checkout-fields').then(r => r.data),

  getQuote: () =>
    apiClient.get<{ crypto: number; balance: number; card: number; sbp: number }>('/cart/quote').then(r => r.data),
}

// ── Orders API ────────────────────────────────────────────────────────────────

export interface CheckoutFieldGroup {
  game_id: string
  game_name: string
  fields: InputField[]
}

export const ordersApi = {
  create: (data: {
    payment_method: string
    promo_code?: string
    input_data?: Record<string, Record<string, string>>
  }) =>
    apiClient.post<Order>('/orders', data).then(r => r.data),

  list: (page = 0) =>
    apiClient.get<Order[]>('/orders', { params: { page } }).then(r => r.data),

  get: (id: string) =>
    apiClient.get<Order>(`/orders/${id}`).then(r => r.data),

  // Котировка по способам оплаты для заранее созданного заказа (спец-лот)
  payQuote: (orderId: string) =>
    apiClient.get<{ crypto: number; balance: number; card: number; sbp: number }>(
      `/orders/${orderId}/pay-quote`,
    ).then(r => r.data),

  pay: (orderId: string, body?: { payment_method?: string; source?: 'web' | 'miniapp'; use_balance?: boolean }) =>
    apiClient.post<{
      payment_id: string
      method: string
      status: string
      redirect_url?: string
      success?: boolean
    }>(`/payments/orders/${orderId}/pay`, body ?? {}).then(r => r.data),
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
  spent: number       // потрачено другом (выполненные заказы)
  earned: number      // начислено вам с его заказов
}

export interface ReferralStats {
  referrals_count: number
  referrals: ReferralUser[]
  percent: number
  period_months: number
  new_user_discount_percent: number
  earned_total: number
}

/** Результат привязки способа входа: привязан или нужен вопрос «Объединить?» */
export interface LinkResult {
  status: 'linked' | 'merge_required'
  access_token?: string
  refresh_token?: string
  ticket?: string
  other?: { name: string; email: string | null; has_telegram: boolean; orders_count: number; balance: number }
}

export const profileApi = {
  get: () =>
    apiClient.get<Profile>('/profile').then(r => r.data),

  /** Привязка почты к аккаунту: код на почту → подтверждение */
  requestEmailLink: (email: string) =>
    apiClient.post('/profile/email/request', { email }).then(() => undefined),

  verifyEmailLink: (email: string, code: string) =>
    apiClient.post<LinkResult>('/profile/email/verify', { email, code }).then(r => r.data),

  /** Привязка Telegram к аккаунту без него */
  linkTelegram: (data: TelegramWidgetUser) =>
    apiClient.post<LinkResult>('/profile/link-telegram', data).then(r => r.data),

  /** Объединить с аккаунтом из ticket (после merge_required) — новые токены */
  merge: (ticket: string) =>
    apiClient.post<{ access_token: string; refresh_token: string }>('/profile/merge', { ticket }).then(r => r.data),

  unlinkEmail: () => apiClient.delete('/profile/email').then(() => undefined),

  setMarketing: (value: boolean) =>
    apiClient.put('/profile/marketing', { marketing_consent: value }).then(() => undefined),

  unlinkTelegram: () =>
    apiClient.delete<{ access_token: string; refresh_token: string }>('/profile/telegram').then(r => r.data),

  getBalanceHistory: () =>
    apiClient.get<BalanceTransaction[]>('/profile/balance-history').then(r => r.data),

  getReferralStats: () =>
    apiClient.get<ReferralStats>('/profile/referrals').then(r => r.data),
}

// ── Payments API ──────────────────────────────────────────────────────────────

export const paymentsApi = {
  topupBalance: (amount: number, method: 'sbp' | 'card' | 'crypto', source?: 'web' | 'miniapp') =>
    apiClient.post<{ redirect_url?: string; payment_id?: string }>(
      '/payments/balance/topup',
      { amount, method, source }
    ).then(r => r.data),
}

// ── Chat API ──────────────────────────────────────────────────────────────────

export interface ChatInfo {
  id: string
  user_id: number
  created_at: string
  unread_count?: number
}

export const chatApi = {
  getOrCreate: () =>
    apiClient.get<ChatInfo>('/chat').then(r => r.data),

  getMessages: (afterId?: string, limit = 50) =>
    apiClient.get<ChatMessage[]>('/chat/messages', {
      params: { limit, ...(afterId ? { after_id: afterId } : {}) },
    }).then(r => r.data),

  sendMessage: (text: string | null, attachments: string[] = []) =>
    apiClient.post<ChatMessage>('/chat/messages', { text, attachments }).then(r => r.data),

  markRead: () =>
    apiClient.post('/chat/read').then(r => r.data),

  getUnreadCount: () =>
    apiClient.get<ChatInfo>('/chat').then(r => (r.data as ChatInfo & { unread_count?: number }).unread_count ?? 0),

  upload: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiClient.post<{ url: string }>('/support/upload', fd).then(r => r.data)
  },
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

// ── Reviews API ───────────────────────────────────────────────────────────────

export interface Review {
  id: string
  positive: boolean
  text: string | null
  reply: string | null
  author: string
  game_name: string | null
  game_slug: string | null
  game_image_url: string | null
  product_name: string | null
  created_at: string
}

export interface ReviewSummary {
  total: number
  positive: number
  negative: number
  percent: number
}

export type ReviewKind = 'all' | 'positive' | 'negative' | 'text'

export interface ReviewList {
  summary: ReviewSummary | null
  items: Review[]
  has_more: boolean
}

export const reviewsApi = {
  /** Отзывы, новые сверху; summary — только при offset=0 */
  list: (params: { game?: string; kind?: ReviewKind; offset?: number; limit?: number } = {}) =>
    apiClient.get<ReviewList>('/reviews', { params }).then(r => r.data),

  getForOrder: (orderId: string) =>
    apiClient.get<{ can_review: boolean; review: Review | null }>(`/reviews/order/${orderId}`).then(r => r.data),

  create: (orderId: string, data: { positive: boolean; text?: string }) =>
    apiClient.post<Review>(`/reviews/order/${orderId}`, data).then(r => r.data),
}
