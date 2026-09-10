/**
 * src/web/pages/WebCatalogPage.tsx
 * Полный каталог сайта: игры и услуги отдельными секциями.
 */

import { useQuery } from '@tanstack/react-query'
import { catalogApi } from '@/api'
import type { Game } from '@/api'
import GameCard from '@/web/components/GameCard'

function Grid({ title, items }: { title: string; items: Game[] }) {
  if (!items.length) return null
  return (
    <div className="mb-12">
      <h2 className="text-xl md:text-2xl font-bold text-white mb-5">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </div>
    </div>
  )
}

export default function WebCatalogPage() {
  const { data: all, isLoading, isError } = useQuery({
    queryKey: ['web', 'games', 'all'],
    queryFn: () => catalogApi.getGames(),
    staleTime: 5 * 60_000,
  })

  const games = (all ?? []).filter((g) => g.type !== 'service')
  const services = (all ?? []).filter((g) => g.type === 'service')

  return (
    <div className="web-container py-10 md:py-14">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-extrabold text-white">Каталог</h1>
        <p className="text-sm text-white/45 mt-2">Выберите игру или услугу.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <div className="aspect-[4/3] animate-pulse bg-white/[0.04]" />
              <div className="p-3.5 space-y-2">
                <div className="h-3.5 w-2/3 rounded animate-pulse bg-white/[0.06]" />
                <div className="h-2.5 w-1/3 rounded animate-pulse bg-white/[0.04]" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-white/40 py-16 text-center">Не удалось загрузить каталог</p>
      ) : (games.length + services.length) === 0 ? (
        <p className="text-sm text-white/40 py-16 text-center">Каталог пока пуст</p>
      ) : (
        <>
          <Grid title="Игры" items={games} />
          <Grid title="Услуги" items={services} />
        </>
      )}
    </div>
  )
}
