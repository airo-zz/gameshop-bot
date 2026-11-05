/**
 * src/pages/admin/catalog/helpers.ts
 * Общее для каталога админки: формат денег и класс полей ввода.
 * Часть страницы «Каталог» (pages/admin/CatalogPage.tsx).
 */

export function formatMoney(v: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(v)
}

export const inputCls = 'w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none focus:ring-1 focus:ring-[var(--border)] focus:border-[var(--border)] transition-all duration-200'
