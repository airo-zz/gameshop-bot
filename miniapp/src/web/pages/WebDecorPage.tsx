/**
 * src/web/pages/WebDecorPage.tsx
 * «Украшения Discord» на сайте: каталог (общий компонент DecorCatalog) +
 * корзина сайта. Открывается со страницы игры с признаком decor_catalog.
 */

import { useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ChevronRight } from '@/components/ui/icons'
import { catalogApi } from '@/api'
import type { DecorItem, Game } from '@/api'
import DecorCatalog from '@/components/decor/DecorCatalog'
import { useWebAuth } from '@/web/auth/useWebAuth'
import { useWebCart } from '@/web/cart/useWebCart'
import { usePageMeta } from '@/web/seo'

export default function WebDecorPage({ game }: { game: Game }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated } = useWebAuth()
  const { cart, add, setQty } = useWebCart()

  usePageMeta({
    title: 'Купить украшения Discord — декорации аватара, эффекты и рамки профиля',
    description: 'Украшения Discord подарком на ваш аккаунт: наборы, декорации аватара, эффекты и рамки профиля, бейджики. Nitro не нужен.',
    exact: true,
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['web', 'decor'],
    queryFn: catalogApi.getDecor,
    staleTime: 2 * 60_000,
  })

  const ids = useMemo(() => new Set((data?.items ?? []).map((i) => i.id)), [data])
  const qty = useMemo(() => {
    const m = new Map<string, number>()
    cart?.items.forEach((i) => { if (ids.has(i.product_id)) m.set(i.product_id, (m.get(i.product_id) ?? 0) + i.quantity) })
    return m
  }, [cart, ids])
  const inCart = useMemo(() => {
    const items = (cart?.items ?? []).filter((i) => ids.has(i.product_id))
    return { count: items.reduce((s, i) => s + i.quantity, 0), total: items.reduce((s, i) => s + Number(i.subtotal), 0) }
  }, [cart, ids])

  const onAdd = async (item: DecorItem) => {
    if (!isAuthenticated) { navigate('/login', { state: { from: location.pathname } }); return }
    try {
      await add(item.id)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Не удалось добавить')
    }
  }
  const onRemove = async (item: DecorItem) => {
    const row = cart?.items.find((i) => i.product_id === item.id)
    if (!row) return
    try {
      await setQty(row.id, row.quantity - 1)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Не удалось изменить корзину')
    }
  }

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
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-square rounded-xl bg-[var(--bg2)] animate-pulse" />)}
        </div>
      ) : isError || !data ? (
        <p className="text-sm text-[var(--hint)] py-16 text-center">Каталог украшений сейчас недоступен. Обновите страницу через минуту.</p>
      ) : (
        <DecorCatalog
          data={data}
          qty={qty}
          onAdd={onAdd}
          onRemove={onRemove}
          cart={inCart}
          onCheckout={() => navigate('/cart')}
          checkoutLabel="Оформить"
        />
      )}
    </div>
  )
}
