/**
 * src/web/components/GameCard.tsx
 * Карточка игры для сайта (не miniapp): подложка с обложкой, название, тип и
 * отклик на наведение. Ведёт на /game/:slug.
 */

import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { prefetchGame } from '@/web/prefetch'
import { Gamepad2, ChevronRight } from '@/components/ui/icons'
import type { Game } from '@/api'
import { normalizeImageUrl } from '@/utils/imageUrl'
import { onThumbError, thumbSrcSet, thumbUrl } from '@/utils/thumb'

export default function GameCard({ game }: { game: Game }) {
  const img = game.image_url ? normalizeImageUrl(game.image_url) ?? game.image_url : null
  const qc = useQueryClient()
  const warm = () => prefetchGame(qc, game.slug)
  return (
    <Link
      to={`/game/${game.slug}`}
      onMouseEnter={warm}
      onFocus={warm}
      onTouchStart={warm}
      className="group flex flex-col h-full p-2.5 rounded-2xl bg-[var(--bg2)] hover:bg-[var(--bg3)] transition-colors duration-200"
    >
      <div
        className="aspect-square rounded-xl bg-[var(--bg3)] flex items-center justify-center overflow-hidden"
        style={{ boxShadow: 'inset 0 0 0 1px var(--border)' }}
      >
        {img ? (
          <img
            src={thumbUrl(img, 320) ?? img}
            srcSet={thumbSrcSet(img)}
            sizes="(min-width: 1024px) 220px, 45vw"
            onError={onThumbError(img)}
            alt={game.name}
            loading="lazy"
            decoding="async"
            width={240}
            height={240}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
          />
        ) : (
          <Gamepad2 size={32} className="text-[var(--hint)]" />
        )}
      </div>
      <div className="flex items-end justify-between gap-2 px-1 pt-3 pb-1 flex-1">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-snug text-[var(--text)] line-clamp-2">{game.name}</p>
          <p className="text-xs text-[var(--hint)] mt-1">{game.type === 'service' ? 'Сервис' : 'Игра'}</p>
        </div>
        <ChevronRight
          size={18}
          className="shrink-0 text-[var(--hint)] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
        />
      </div>
    </Link>
  )
}
