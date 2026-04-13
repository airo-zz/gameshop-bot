/**
 * src/utils/loyalty.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Общие константы и утилиты для системы уровней лояльности.
 * Используется в CheckoutPage, ProfilePage, HomePage.
 * ─────────────────────────────────────────────────────────────────────────
 */

// ── Статические данные уровней ────────────────────────────────────────────────

export interface LoyaltyLevelDef {
  name: string
  min: number
  max: number | null
}

/** Упрощённые данные для CheckoutPage (подсказка о прогрессе). */
export const LOYALTY_LEVELS: LoyaltyLevelDef[] = [
  { name: 'Bronze',   min: 0,     max: 1000  },
  { name: 'Silver',   min: 1000,  max: 5000  },
  { name: 'Gold',     min: 5000,  max: 15000 },
  { name: 'Platinum', min: 15000, max: null  },
]

/** Скидка при достижении уровня (используется в подсказке на CheckoutPage). */
export const LOYALTY_DISCOUNTS: Record<string, number> = {
  Silver:   3,
  Gold:     5,
  Platinum: 10,
}

// ── Цвет и иконка уровня (строковые, без JSX — чтобы файл не зависел от React) ──

/** Возвращает CSS-цвет для имени уровня лояльности. */
export function getLoyaltyColor(levelName: string | null): string {
  switch (levelName?.toLowerCase()) {
    case 'silver':   return '#94a3b8'
    case 'gold':     return '#eab308'
    case 'platinum': return '#a78bfa'
    default:         return '#f59e0b' // bronze
  }
}

/**
 * Возвращает строковое имя иконки (lucide) для уровня лояльности.
 * Компонент иконки создаётся на месте использования — это позволяет
 * хранить утилиту без зависимости от React/JSX.
 */
export function getLoyaltyIconName(levelName: string | null): 'Shield' | 'Star' | 'Crown' | 'Gem' {
  switch (levelName?.toLowerCase()) {
    case 'silver':   return 'Star'
    case 'gold':     return 'Crown'
    case 'platinum': return 'Gem'
    default:         return 'Shield'
  }
}
