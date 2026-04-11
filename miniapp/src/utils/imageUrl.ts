/**
 * src/utils/imageUrl.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Нормализует URL картинок из API.
 *
 * В БД хранятся строки вида:
 *   - "/static/games/brawl-stars.jpg"   → абсолютный путь на сервере
 *   - "https://..."                     → полный URL (CDN / внешний)
 *   - "games/brawl-stars.jpg"           → относительный путь
 *
 * MiniApp раздаётся по https://redonate.su/app/ — без явного base статика
 * не грузится (браузер пытается достать /app/static/...).
 *
 * Логика:
 *   1. Пустая строка / null → null (показываем заглушку)
 *   2. Уже абсолютный https:// → оставляем как есть
 *   3. Начинается с / → prepend ORIGIN (убираем /app если попало)
 *   4. Иначе — prepend /static/
 * ─────────────────────────────────────────────────────────────────────────
 */

const ORIGIN = (() => {
  if (typeof window === 'undefined') return ''
  // В production: https://redonate.su
  // В dev (vite proxy): http://localhost:5173
  return window.location.origin
})()

export function normalizeImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null

  // Уже полный URL
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw

  // Начинается с / — считаем абсолютным путём на сервере
  if (raw.startsWith('/')) return `${ORIGIN}${raw}`

  // Нет слеша — относительный путь, кладём в /static/
  return `${ORIGIN}/static/${raw}`
}
