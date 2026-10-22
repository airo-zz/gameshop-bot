/**
 * src/web/format.ts
 * Общие форматтеры и справочники сайта (деньги, статусы заказов, типы операций).
 */

export function money(v: number | string | null | undefined): string {
  return Number(v ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽'
}

export function apiError(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}

export const ORDER_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: 'Ожидает оплаты', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  pending_payment: { label: 'Ожидает оплаты', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  paid: { label: 'Оплачен', color: '#7FA6F5', bg: 'rgba(37,99,235,0.15)' },
  processing: { label: 'В обработке', color: '#7FA6F5', bg: 'rgba(37,99,235,0.15)' },
  clarification: { label: 'Требуется уточнение', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  completed: { label: 'Выполнен', color: '#34d399', bg: 'rgba(16,185,129,0.12)' },
  cancelled: { label: 'Отменён', color: '#f87171', bg: 'rgba(239,68,68,0.12)' },
  refunded: { label: 'Возврат', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
}

export function orderStatus(status: string) {
  return ORDER_STATUS[status] ?? { label: status, color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' }
}

export function isAwaitingPayment(status: string) {
  return status === 'new' || status === 'pending_payment'
}

const TX_LABEL: Record<string, string> = {
  manual_credit: 'Пополнение',
  manual_debit: 'Списание',
  order_payment: 'Оплата заказа',
  order_refund: 'Возврат',
  cashback: 'Кэшбэк',
  referral_bonus: 'Реферальный бонус',
  top_up: 'Пополнение',
}

export function txLabel(type: string) {
  return TX_LABEL[type] ?? type
}

export function txIsCredit(type: string) {
  return ['manual_credit', 'order_refund', 'cashback', 'referral_bonus', 'top_up'].includes(type)
}
