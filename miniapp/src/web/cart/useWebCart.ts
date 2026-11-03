/**
 * src/web/cart/useWebCart.ts
 * Корзина на сайте. Обёртка над cartApi + React Query.
 * Требует авторизации (cart-эндпоинты работают по JWT).
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cartApi, type Cart } from '@/api'
import { hasStoredToken } from '@/api/client'
import { trackAdd, trackRemove } from '@/web/seo'

const CART_KEY = ['web', 'cart'] as const

export function useWebCart() {
  const qc = useQueryClient()

  const { data: cart, isLoading } = useQuery<Cart>({
    queryKey: CART_KEY,
    queryFn: cartApi.get,
    enabled: hasStoredToken(),
    staleTime: 30_000,
  })

  const refresh = () => qc.invalidateQueries({ queryKey: CART_KEY })

  async function add(productId: string, inputData?: Record<string, string>, quantity = 1) {
    await cartApi.addItem({ product_id: productId, quantity, input_data: inputData ?? {} })
    await refresh()
    const item = qc.getQueryData<Cart>(CART_KEY)?.items.find((i) => i.product_id === productId)
    if (item) trackAdd({ id: productId, name: item.product_name, price: item.price_snapshot, quantity })
  }

  async function setQty(itemId: string, quantity: number) {
    const before = qc.getQueryData<Cart>(CART_KEY)?.items.find((i) => i.id === itemId)
    await cartApi.updateItem(itemId, quantity)
    await refresh()
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
