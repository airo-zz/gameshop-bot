// Разделитель тысяч: тонкий пробел (U+2009) вместо широкого неразрывного —
// «1 250» читается плотнее. По бокам WORD JOINER (U+2060), чтобы число не
// переносилось по этому пробелу. U+2009 есть в Onest, U+202F — нет.
const THIN = '⁠ ⁠'
const ruFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

/** Число по-русски с тонким разделителем тысяч: 1250.5 → "1 250,5". */
export function fmtNum(v: number | string | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v ?? 0)
  return ruFormat.format(Number.isFinite(n) ? n : 0).replace(/[   ]/g, THIN)
}

/** Форматирует цену: 1500 → "1 500", 163.16 → "163,16", 1500.5 → "1 500,5".
 * До 2 знаков после запятой (копейки от наценки метода), без хвостовых нулей. */
export function fmtPrice(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return fmtNum(parseFloat(n.toFixed(2)))
}
