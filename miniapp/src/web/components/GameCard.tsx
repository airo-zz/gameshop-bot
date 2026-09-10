/**
 * src/web/components/GameCard.tsx
 * Карточка игры на сайте. Ведёт на страницу игры /game/:slug.
 */

import { Link } from 'react-router-dom'
import { Gamepad2 } from 'lucide-react'
import type { Game } from '@/api'
import { normalizeImageUrl } from '@/utils/imageUrl'

export default function GameCard({ game }: { game: Game }) {
  const img = game.image_url ? normalizeImageUrl(game.image_url) ?? game.image_url : null
  return (
    <Link
      to={`/game/${game.slug}`}
      className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden hover:border-white/15 hover:-translate-y-0.5 transition-all"
    >
      <div className="aspect-[4/3] bg-white/[0.03] flex items-center justify-center overflow-hidden">
        {img ? (
          <img
            src={img}
            alt={game.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <Gamepad2 size={32} className="text-white/15" />
        )}
      </div>
      <div className="p-3.5">
        <div className="text-sm font-medium text-white truncate">{game.name}</div>
        <div className="text-xs text-white/40 mt-0.5 group-hover:text-white/60 transition-colors">
          {game.type === 'service' ? 'Услуги' : 'Донат'} →
        </div>
      </div>
    </Link>
  )
}
