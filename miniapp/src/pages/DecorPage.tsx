/**
 * src/pages/DecorPage.tsx
 * «Украшения Discord» в Mini App: общий каталог DecorCatalog + корзина Mini App.
 * Открывается вместо обычной страницы игры для игры с признаком decor_catalog.
 *
 * Корзина — оптимистично (useOptimisticQty): счётчик, сумма и бейдж навбара
 * меняются сразу, запрос уходит в фоне, как на обычных страницах игр.
 */

import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { cartApi, catalogApi } from '@/api'
import type { Cart, DecorItem, Game } from '@/api'
import DecorCatalog from '@/components/decor/DecorCatalog'
import { useOptimisticQty } from '@/components/decor/useOptimisticQty'
import { NAV_HEIGHT } from '@/components/layout/Layout'
import { useTelegram } from '@/hooks/useTelegram'
import { useCartStore } from '@/store'

export default function DecorPage({ game }: { game: Game }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { haptic } = useTelegram()
  const { increment, decrement, setItemsCount } = useCartStore()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['decor'],
    queryFn: catalogApi.getDecor,
    staleTime: 2 * 60_000,
  })
  const { data: cart } = useQuery({ queryKey: ['cart'], queryFn: cartApi.get, staleTime: 30_000 })

  const byId = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i])), [data])
  const server = useMemo(() => {
    const m = new Map<string, number>()
    cart?.items.forEach((i) => { if (byId.has(i.product_id)) m.set(i.product_id, (m.get(i.product_id) ?? 0) + i.quantity) })
    return m
  }, [cart, byId])

  const commit = useCallback(async (id: string, target: number) => {
    const fresh = qc.getQueryData<Cart>(['cart'])
    const row = fresh?.items.find((i) => i.product_id === id)
    if (row) await cartApi.updateItem(row.id, target)
    else if (target > 0) await cartApi.addItem({ product_id: id, quantity: target, input_data: {} })
  }, [qc])
  const settle = useCallback(async () => {
    await qc.refetchQueries({ queryKey: ['cart'] })
    const c = qc.getQueryData<Cart>(['cart'])
    if (c) setItemsCount(c.items_count)          // бейдж навбара — по факту сервера
  }, [qc, setItemsCount])
  const onError = useCallback((e: any) => {
    haptic.error()
    toast.error(e?.response?.data?.detail ?? 'Не удалось изменить корзину')
    settle().catch(() => undefined)
  }, [haptic, settle])
  const { qty, change } = useOptimisticQty(server, commit, settle, onError)

  const inCart = useMemo(() => {
    let count = 0, total = 0
    qty.forEach((n, id) => { const it = byId.get(id); if (it && n > 0) { count += n; total += n * it.price } })
    return { count, total }
  }, [qty, byId])

  const onAdd = (item: DecorItem) => {
    haptic.impact('light')
    if (!(qty.get(item.id) ?? 0)) increment()       // новая позиция — бейдж сразу
    change(item.id, 1)
  }
  const onRemove = (item: DecorItem) => {
    haptic.impact('light')
    if ((qty.get(item.id) ?? 0) === 1) decrement()
    change(item.id, -1)
  }

  return (
    <div className="px-4 pt-5" style={{ ['--decor-sticky-top' as string]: '0px' }}>
      <h1 className="text-xl font-extrabold tracking-tight text-[var(--text)]">{game.name}</h1>
      <p className="text-[13px] text-[var(--hint)] mt-1 mb-4">
        Подарком на ваш Discord, Nitro не нужен. После оплаты придёт ссылка на подарок.
      </p>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-square rounded-2xl bg-[var(--bg2)] animate-pulse" />)}
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
