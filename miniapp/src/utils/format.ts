/** Форматирует цену: 1500 → "1 500", 163.16 → "163,16", 1500.5 → "1 500,5".
 * До 2 знаков после запятой (копейки от наценки метода), без хвостовых нулей. */
export function fmtPrice(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (Number.isInteger(n)) return n.toLocaleString('ru')
  return parseFloat(n.toFixed(2)).toLocaleString('ru', { maximumFractionDigits: 2 })
}
