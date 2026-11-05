/**
 * src/web/gameMatch.ts
 * Поиск игры на сайте: по названию и по другим названиям из админки (games.seo_aliases →
 * search_names: «стим», «Рейд»). Чем меньше ранг, тем выше в выдаче; null — не подходит.
 */

import type { Game } from '@/api'

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim()

export function gameMatchRank(g: Game, query: string): number | null {
  const q = norm(query)
  if (!q) return 0
  const name = norm(g.name)
  if (name.startsWith(q)) return 0
  if (name.includes(q)) return 1
  const alts = (g.search_names ?? []).map(norm)
  if (alts.some((a) => a.startsWith(q))) return 2
  if (alts.some((a) => a.includes(q))) return 3
  return null
}

/** Игры под запрос, подходящие по названию — выше подходящих по другим названиям. */
export function filterGames(games: Game[], query: string): Game[] {
  if (!norm(query)) return games
  return games
    .map((g, i) => ({ g, i, r: gameMatchRank(g, query) }))
    .filter((x) => x.r !== null)
    .sort((a, b) => a.r! - b.r! || a.i - b.i)
    .map((x) => x.g)
}
