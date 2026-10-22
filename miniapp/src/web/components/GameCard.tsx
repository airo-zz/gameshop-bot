/**
 * src/web/components/GameCard.tsx
 * Карточка игры на сайте: обложка + название. Ведёт на /game/:slug.
 */

import { Link } from 'react-router-dom'
import { Gamepad2 } from '@/components/ui/icons'
import type { Game } from '@/api'
import { normalizeImageUrl } from '@/utils/imageUrl'

export default function GameCard({ game }: { game: Game }) {
  const img = game.image_url ? normalizeImageUrl(game.image_url) ?? game.image_url : null
  return (
    <Link to={`/game/${game.slug}`} className="group block">
      <div
        className="aspect-square rounded-2xl bg-[var(--bg2)] flex items-center justify-center overflow-hidden transition-transform duration-300 group-hover:-translate-y-1"
        style={{ boxShadow: 'inset 0 0 0 1px var(--border)' }}
      >
        {img ? (
          <img
            src={img}
            alt={game.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <Gamepad2 size={32} className="text-[var(--hint)]" />
        )}
      </div>
      <p className="mt-2.5 text-sm font-medium text-[var(--text)] line-clamp-2 group-hover:text-[var(--link)] transition-colors">
        {game.name}
      </p>
    </Link>
  )
}
