/**
 * src/web/cart/useWebCart.ts
 * Корзина на сайте. Обёртка над cartApi + React Query.
 * Требует авторизации (cart-эндпоинты работают по JWT).
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cartApi, type Cart } from '@/api'
import { hasStoredToken } from '@/api/client'

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

  async function add(productId: string, inputData?: Record<string, string>) {
    await cartApi.addItem({ product_id: productId, quantity: 1, input_data: inputData ?? {} })
    await refresh()
  }

  async function setQty(itemId: string, quantity: number) {
    await cartApi.updateItem(itemId, quantity)
    await refresh()
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
