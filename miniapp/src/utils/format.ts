/** Форматирует цену: 1500 → "1 500", 1500.50 → "1 500,5" */
export function fmtPrice(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (Number.isInteger(n)) return n.toLocaleString('ru')
  return parseFloat(n.toFixed(1)).toLocaleString('ru')
}
