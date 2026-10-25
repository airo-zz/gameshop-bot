/**
 * src/web/pages/WebDecorPage.tsx
 * «Украшения Discord» на сайте: каталог (общий компонент DecorCatalog) +
 * корзина сайта. Открывается со страницы игры с признаком decor_catalog.
 *
 * Корзина — оптимистично (useOptimisticQty): счётчик и сумма меняются сразу,
 * запрос уходит в фоне. Заголовок/описание — те же, что в серверной версии
 * страницы (GET /catalog/games/{slug}/seo), чтобы робот и человек видели одно.
 */

import { useCallback, useMemo } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ChevronRight } from '@/components/ui/icons'
import { cartApi, catalogApi } from '@/api'
import type { DecorItem, Game } from '@/api'
import DecorCatalog from '@/components/decor/DecorCatalog'
import { useOptimisticQty } from '@/components/decor/useOptimisticQty'
import { useWebAuth } from '@/web/auth/useWebAuth'
import { useWebCart } from '@/web/cart/useWebCart'
import { usePageMeta } from '@/web/seo'

function apiErr(e: unknown, fallback: string) {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === 'string' ? d : fallback
}

export default function WebDecorPage({ game }: { game: Game }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { cat } = useParams<{ cat?: string }>()
  const qc = useQueryClient()
  const { isAuthenticated } = useWebAuth()
  const { cart, refresh } = useWebCart()

  const { data: seo } = useQuery({
    queryKey: ['web', 'game-seo', game.slug, ''],
    queryFn: () => catalogApi.getGameSeo(game.slug),
    staleTime: 10 * 60_000,
  })
  usePageMeta({ title: seo?.title, description: seo?.description, exact: true })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['web', 'decor'],
    queryFn: catalogApi.getDecor,
    staleTime: 2 * 60_000,
  })

  const byId = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i])), [data])
  const server = useMemo(() => {
    const m = new Map<string, number>()
    cart?.items.forEach((i) => { if (byId.has(i.product_id)) m.set(i.product_id, (m.get(i.product_id) ?? 0) + i.quantity) })
    return m
  }, [cart, byId])

  const commit = useCallback(async (id: string, target: number) => {
    const fresh = qc.getQueryData<typeof cart>(['web', 'cart']) ?? cart
    const row = fresh?.items.find((i) => i.product_id === id)
    if (row) await cartApi.updateItem(row.id, target)
    else if (target > 0) await cartApi.addItem({ product_id: id, quantity: target, input_data: {} })
  }, [qc, cart])
  const onError = useCallback((e: unknown) => { toast.error(apiErr(e, 'Не удалось изменить корзину')) }, [])
  const { qty, change } = useOptimisticQty(server, commit, refresh, onError)

  const inCart = useMemo(() => {
    let count = 0, total = 0
    qty.forEach((n, id) => { const it = byId.get(id); if (it && n > 0) { count += n; total += n * it.price } })
    return { count, total }
  }, [qty, byId])

  const guard = () => {
    if (isAuthenticated) return true
    navigate('/login', { state: { from: location.pathname } })
    return false
  }
  const onAdd = (item: DecorItem) => { if (guard()) change(item.id, 1) }
  const onRemove = (item: DecorItem) => { if (guard()) change(item.id, -1) }

  const initialColl = cat ? data?.collections.find((c) => c.slug === cat)?.id : undefined

  return (
    <div className="web-container py-6 md:py-10" style={{ ['--decor-sticky-top' as string]: '64px' }}>
      <nav className="flex items-center gap-1 text-sm text-[var(--hint)] mb-4" aria-label="Навигация">
        <Link to="/catalog" className="hover:text-[var(--text)]">Каталог</Link>
        <ChevronRight size={14} />
        <span className="text-[var(--text-2)]">{game.name}</span>
      </nav>
      <h1 className="font-display text-[28px] md:text-[34px] font-semibold text-[var(--text)] leading-tight">{game.name}</h1>
      <p className="text-[15px] text-[var(--text-2)] mt-2 mb-6 max-w-2xl">
        Подарком на ваш аккаунт Discord: наборы, декорации аватара, эффекты и рамки профиля, бейджики.
        Nitro не нужен — после оплаты придёт ссылка на подарок.
      </p>

      {isLoading ? (
        <div className="grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-square rounded-2xl bg-[var(--bg2)] animate-pulse" />)}
        </div>
      ) : isError || !data ? (
        <p className="text-sm text-[var(--hint)] py-16 text-center">Каталог украшений сейчас недоступен. Обновите страницу через минуту.</p>
      ) : (
        <DecorCatalog
          key={initialColl ?? 'all'}
          data={data}
          qty={qty}
          onAdd={onAdd}
          onRemove={onRemove}
          cart={inCart}
          onCheckout={() => navigate('/cart')}
          checkoutLabel="Оформить"
          initialColl={initialColl}
        />
      )}
    </div>
  )
}
