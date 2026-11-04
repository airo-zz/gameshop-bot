/**
 * src/web/cart/useWebCart.ts
 * Корзина на сайте. Обёртка над cartApi + React Query.
 * Требует авторизации (cart-эндпоинты работают по JWT).
 *
 * Добавление и изменение количества — оптимистичные: корзина на экране меняется
 * сразу, запрос уходит следом. Ответ сервера подтягивается в фоне (refresh);
 * если сервер отказал — корзина откатывается, ошибка уходит вызывающему.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cartApi, type Cart, type CartItem } from '@/api'
import { hasStoredToken } from '@/api/client'
import { trackAdd, trackRemove } from '@/web/seo'

const CART_KEY = ['web', 'cart'] as const

/** Что знаем о товаре до ответа сервера — для временной строки корзины. */
export interface CartProductHint {
  name: string
  price: number | string
}

function withTotals(cart: Cart, items: CartItem[]): Cart {
  const subtotal = items.reduce((s, i) => s + Number(i.subtotal), 0)
  const delta = subtotal - Number(cart.subtotal)
  return {
    ...cart,
    items,
    items_count: items.reduce((s, i) => s + i.quantity, 0),
    subtotal,
    total: Math.max(0, Number(cart.total) + delta),
  }
}

export function useWebCart() {
  const qc = useQueryClient()

  const { data: cart, isLoading } = useQuery<Cart>({
    queryKey: CART_KEY,
    queryFn: cartApi.get,
    enabled: hasStoredToken(),
    staleTime: 30_000,
  })

  const refresh = () => qc.invalidateQueries({ queryKey: CART_KEY })

  /** Меняет корзину в кэше сразу; возвращает функцию отката. */
  async function optimistic(change: (c: Cart) => Cart): Promise<() => void> {
    await qc.cancelQueries({ queryKey: CART_KEY })
    const prev = qc.getQueryData<Cart>(CART_KEY)
    if (prev) qc.setQueryData<Cart>(CART_KEY, change(prev))
    return () => { if (prev) qc.setQueryData(CART_KEY, prev) }
  }

  async function add(productId: string, inputData?: Record<string, string>, quantity = 1, hint?: CartProductHint) {
    const rollback = await optimistic((c) => {
      const existing = c.items.find((i) => i.product_id === productId)
      if (existing) {
        const q = existing.quantity + quantity
        return withTotals(c, c.items.map((i) =>
          i.id === existing.id ? { ...i, quantity: q, subtotal: Number(i.price_snapshot) * q } : i))
      }
      if (!hint) return c
      const price = Number(hint.price)
      return withTotals(c, [...c.items, {
        id: `tmp-${productId}`, product_id: productId, quantity,
        price_snapshot: price, subtotal: price * quantity,
        input_data: inputData ?? {}, product_name: hint.name, product_image: null,
      }])
    })
    try {
      await cartApi.addItem({ product_id: productId, quantity, input_data: inputData ?? {} })
    } catch (e) {
      rollback()
      throw e
    } finally {
      refresh()
    }
    const item = qc.getQueryData<Cart>(CART_KEY)?.items.find((i) => i.product_id === productId)
    const name = item?.product_name ?? hint?.name
    const price = item?.price_snapshot ?? hint?.price
    if (name && price != null) trackAdd({ id: productId, name, price: Number(price), quantity })
  }

  async function setQty(itemId: string, quantity: number) {
    if (itemId.startsWith('tmp-')) {
      // строка ещё временная (сервер не ответил на добавление) — берём настоящий id
      const productId = itemId.slice(4)
      const fresh = await qc.fetchQuery<Cart>({ queryKey: CART_KEY, queryFn: cartApi.get, staleTime: 0 })
      const real = fresh.items.find((i) => i.product_id === productId)
      if (!real) return
      itemId = real.id
    }
    const before = qc.getQueryData<Cart>(CART_KEY)?.items.find((i) => i.id === itemId)
    const rollback = await optimistic((c) => withTotals(c, quantity <= 0
      ? c.items.filter((i) => i.id !== itemId)
      : c.items.map((i) => i.id === itemId ? { ...i, quantity, subtotal: Number(i.price_snapshot) * quantity } : i)))
    try {
      await cartApi.updateItem(itemId, quantity)
    } catch (e) {
      rollback()
      throw e
    } finally {
      refresh()
    }
    if (before && quantity !== before.quantity) {
      const p = { id: before.product_id, name: before.product_name, price: before.price_snapshot, quantity: Math.abs(quantity - before.quantity) }
      if (quantity > before.quantity) trackAdd(p)
      else trackRemove(p)
    }
  }

  async function clear() {
    await cartApi.clear()
    await refresh()
  }

  async function applyPromo(code: string) {
    const res = await cartApi.applyPromo(code)
    await refresh()
    return res
  }

  const qtyByProduct = new Map<string, number>()
  cart?.items.forEach((i) => qtyByProduct.set(i.product_id, (qtyByProduct.get(i.product_id) ?? 0) + i.quantity))

  return {
    cart,
    count: cart?.items_count ?? 0,
    isLoading,
    qtyByProduct,
    add,
    setQty,
    clear,
    applyPromo,
    refresh,
  }
}
