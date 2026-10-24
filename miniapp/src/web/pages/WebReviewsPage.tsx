/**
 * src/web/pages/WebReviewsPage.tsx
 * Все отзывы о магазине: с сайта, из Telegram и с GGSEL. ?game=<slug> — по одной игре.
 */

import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft } from '@/components/ui/icons'
import { catalogApi } from '@/api'
import { ReviewsFeed } from '@/components/reviews/Reviews'
import { usePageMeta } from '@/web/seo'

const gameHref = (slug: string) => `/game/${slug}`

export default function WebReviewsPage() {
  const [params] = useSearchParams()
  const game = params.get('game') || undefined
  const { data: games = [] } = useQuery({
    queryKey: ['web', 'games', 'all'],
    queryFn: () => catalogApi.getGames(),
    staleTime: 5 * 60_000,
    enabled: !!game,
  })
  const gameName = game ? games.find((g) => g.slug === game)?.name : undefined

  usePageMeta({
    title: gameName ? `Отзывы: ${gameName}` : 'Отзывы покупателей',
    description: 'Отзывы покупателей reDonate о пополнении игр и сервисов: с сайта, из Telegram и с GGSEL.',
  })

  return (
    <div className="web-container py-10 md:py-14">
      {game && (
        <Link to="/reviews" className="inline-flex items-center gap-1 text-sm text-[var(--hint)] hover:text-[var(--text)] transition-colors mb-4">
          <ChevronLeft size={16} /> Все отзывы
        </Link>
      )}
      <h1 className="text-3xl md:text-[2.5rem] leading-tight text-[var(--text)]" style={{ margin: 0 }}>
        {gameName ? `Отзывы: ${gameName}` : 'Отзывы покупателей'}
      </h1>
      <p className="mt-3 mb-8 text-[var(--text-2)] leading-relaxed max-w-xl">
        Что пишут о нас покупатели на сайте, в Telegram и на маркетплейсе GGSEL.
      </p>
      <ReviewsFeed game={game} gameHref={gameHref} columns={2} />
    </div>
  )
}
