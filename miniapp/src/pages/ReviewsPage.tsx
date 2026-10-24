// src/pages/ReviewsPage.tsx — все отзывы о магазине (?game=<slug> — по одной игре)
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from '@/components/ui/icons'
import { catalogApi } from '@/api'
import { ReviewsFeed } from '@/components/reviews/Reviews'

const gameHref = (slug: string) => `/catalog/${slug}`

export default function ReviewsPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const game = params.get('game') || undefined
  const { data: games = [] } = useQuery({
    queryKey: ['games'],
    queryFn: () => catalogApi.getGames(),
    staleTime: 5 * 60_000,
    enabled: !!game,
  })
  const gameName = game ? games.find((g) => g.slug === game)?.name : undefined

  return (
    <div className="px-4 pt-5 pb-6 space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Назад"
          onClick={() => navigate(-1)}
          className="flex items-center justify-center w-10 h-10 rounded-xl active:opacity-70 flex-shrink-0"
          style={{ background: 'var(--bg2)' }}
        >
          <ArrowLeft size={20} style={{ color: 'var(--text)' }} />
        </button>
        <h1 className="truncate" style={{ margin: 0, fontSize: 20, color: 'var(--text)' }}>
          {gameName ? `Отзывы: ${gameName}` : 'Отзывы'}
        </h1>
      </div>
      <ReviewsFeed game={game} gameHref={gameHref} columns={1} />
    </div>
  )
}
