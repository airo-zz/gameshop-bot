/**
 * src/pages/DecorPage.tsx
 * «Украшения Discord» в Mini App: общий каталог DecorCatalog + корзина Mini App.
 * Открывается вместо обычной страницы игры для игры с признаком decor_catalog.
 */

import { useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { cartApi, catalogApi } from '@/api'
import type { DecorItem, Game } from '@/api'
import DecorCatalog from '@/components/decor/DecorCatalog'
import { NAV_HEIGHT } from '@/components/layout/Layout'
import { useTelegram } from '@/hooks/useTelegram'
import { useCartStore } from '@/store'

export default function DecorPage({ game }: { game: Game }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { haptic } = useTelegram()
  const { increment, decrement } = useCartStore()
  const pending = useRef(new Set<string>())

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['decor'],
    queryFn: catalogApi.getDecor,
    staleTime: 2 * 60_000,
  })
  const { data: cart } = useQuery({ queryKey: ['cart'], queryFn: cartApi.get, staleTime: 30_000 })

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

  const run = async (id: string, fn: () => Promise<unknown>) => {
    if (pending.current.has(id)) return
    pending.current.add(id)
    try {
      await fn()
      await qc.refetchQueries({ queryKey: ['cart'] })
    } catch (e: any) {
      haptic.error()
      toast.error(e?.response?.data?.detail ?? 'Не удалось изменить корзину')
    } finally {
      pending.current.delete(id)
    }
  }

  const onAdd = (item: DecorItem) => run(item.id, async () => {
    haptic.impact('light')
    const isNew = !(qty.get(item.id) ?? 0)
    await cartApi.addItem({ product_id: item.id, quantity: 1, input_data: {} })
    if (isNew) increment()
  })
  const onRemove = (item: DecorItem) => run(item.id, async () => {
    const row = cart?.items.find((i) => i.product_id === item.id)
    if (!row) return
    haptic.impact('light')
    await cartApi.updateItem(row.id, row.quantity - 1)
    if (row.quantity <= 1) decrement()
  })

  return (
    <div className="px-4 pt-5" style={{ ['--decor-sticky-top' as string]: '0px' }}>
      <h1 className="text-xl font-extrabold tracking-tight text-[var(--text)]">{game.name}</h1>
      <p className="text-[13px] text-[var(--hint)] mt-1 mb-4">
        Подарком на ваш Discord, Nitro не нужен. После оплаты придёт ссылка на подарок.
      </p>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-square rounded-xl bg-[var(--bg2)] animate-pulse" />)}
        </div>
      ) : isError || !data ? (
        <div className="text-center py-16">
          <p className="text-sm text-[var(--hint)] mb-4">Не удалось загрузить каталог</p>
          <button onClick={() => refetch()} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-[var(--bg2)] text-[var(--link)]">
            Повторить
          </button>
        </div>
      ) : (
        <DecorCatalog
          data={data}
          qty={qty}
          onAdd={onAdd}
          onRemove={onRemove}
          cart={inCart}
          onCheckout={() => navigate('/cart')}
          checkoutLabel="В корзину"
          bottomOffset={NAV_HEIGHT}
        />
      )}
    </div>
  )
}
