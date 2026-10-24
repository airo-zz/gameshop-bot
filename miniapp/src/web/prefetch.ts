/**
 * src/web/prefetch.ts
 * Предзагрузка на сайте: при наведении/фокусе на ссылку игры заранее тянем
 * чанк страницы игры, категории и товары первой категории — к клику всё в кэше,
 * переход мгновенный. Ключи совпадают с useQuery в WebGamePage.
 */
import type { QueryClient } from '@tanstack/react-query'
import { catalogApi } from '@/api'

const done = new Set<string>()

export function prefetchGame(qc: QueryClient, slug: string) {
  if (done.has(slug)) return
  done.add(slug)
  void import('./pages/WebGamePage')
  void qc
    .fetchQuery({
      queryKey: ['web', 'categories', slug],
      queryFn: () => catalogApi.getCategories(slug),
      staleTime: 5 * 60_000,
    })
    .then((cats) => {
      const first = cats.find((c) => !c.parent_id)
      if (!first) return
      return qc.prefetchQuery({
        queryKey: ['web', 'products', first.id],
        queryFn: () => catalogApi.getProducts(first.id),
        staleTime: 2 * 60_000,
      })
    })
    .catch(() => done.delete(slug)) // не получилось — попробуем при следующем наведении
}

/** Подгружает код основных страниц, когда браузер свободен (после первой отрисовки). */
export function preloadRoutesWhenIdle() {
  const run = () => {
    void import('./pages/WebGamePage')
    void import('./pages/WebCatalogPage')
    void import('./pages/WebCashbackPage')
    void import('./pages/WebReviewsPage')
  }
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 })
  else window.setTimeout(run, 2500)
}
