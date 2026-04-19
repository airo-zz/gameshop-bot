// src/pages/CartPage.tsx
import { useState, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Plus, Minus, Tag, ShoppingBag } from 'lucide-react'
import toast from 'react-hot-toast'
import { cartApi, profileApi, type CartItem } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'
import { useCartStore } from '@/store'
import { disintegrateAll } from '@/hooks/useDisintegrate'
import { fmtPrice } from '@/utils/format'

export default function CartPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { haptic, showConfirm } = useTelegram()
  const { setItemsCount } = useCartStore()

  async function handleCheckout() {
    await Promise.all([
      import('@/pages/CheckoutPage'),
      queryClient.prefetchQuery({ queryKey: ['profile'], queryFn: profileApi.get, staleTime: 60_000 }),
    ])
    navigate('/checkout')
  }

  const [promoInput, setPromoInput] = useState('')
  const [promoApplying, setPromoApplying] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [showEmpty, setShowEmpty] = useState(false)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data: cart, isLoading, isError, refetch } = useQuery({
    queryKey: ['cart'],
    queryFn: cartApi.get,
    staleTime: 30_000,
    retry: 1,
  })

  const refreshCart = useCallback(async () => {
    const updated = await refetch()
    if (updated.data) {
      setItemsCount(updated.data.items_count)
    }
  }, [refetch, setItemsCount])

  const handleQtyChange = async (item: CartItem, delta: number) => {
    const newQty = item.quantity + delta
    if (newQty < 0) return
    setUpdatingId(item.id)
    haptic.impact('light')
    try {
      await cartApi.updateItem(item.id, newQty)
      await refreshCart()
    } catch {
      toast.error('Ошибка обновления')
    } finally {
      setUpdatingId(null)
    }
  }

  const handleRemove = async (item: CartItem) => {
    haptic.impact('medium')
    setUpdatingId(item.id)
    try {
      await cartApi.updateItem(item.id, 0)
      await refreshCart()
      toast.success('Удалено из корзины')
    } catch {
      toast.error('Ошибка')
    } finally {
      setUpdatingId(null)
    }
  }

  const handleClear = useCallback(async () => {
    const ok = await showConfirm('Очистить корзину?')
    if (!ok) return
    haptic.impact('heavy')
    setClearing(true)

    // Collect cart item refs + bottom section
    const elements = (cart?.items ?? [])
      .map(item => itemRefs.current.get(item.id))
      .filter((el): el is HTMLDivElement => el != null)
    if (bottomRef.current) elements.push(bottomRef.current)

    // Fire API in parallel with animation
    const clearPromise = cartApi.clear().then(() => refreshCart()).catch(() => toast.error('Ошибка'))

    // Run disintegration, then show empty state
    disintegrateAll(elements, 60, async () => {
      await clearPromise
      setShowEmpty(true)
      setClearing(false)
    })
  }, [cart?.items, haptic, showConfirm, refreshCart])

  const handleApplyPromo = async () => {
    if (!promoInput.trim()) return
    setPromoApplying(true)
    try {
      const res = await cartApi.applyPromo(promoInput.trim())
      if (res.valid) {
        toast.success(res.message)
        haptic.success()
        await refreshCart()
      } else {
        toast.error(res.message)
        haptic.error()
      }
    } catch {
      toast.error('Ошибка применения промокода')
    } finally {
      setPromoApplying(false)
    }
  }

  if (isLoading) return null

  // Показываем "Корзина пуста" если: нет данных/ошибка, или корзина пуста, или после анимации рассыпания
  if (!clearing && (showEmpty || isError || !cart || cart.items.length === 0)) return (
    <div
      className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center pt-16"
      style={showEmpty ? { animation: 'slideUp 0.5s ease-out both' } : undefined}
    >
      <div
        className="w-24 h-24 rounded-3xl flex items-center justify-center"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
      >
        <ShoppingBag size={40} style={{ color: 'var(--hint)' }} />
      </div>
      <div>
        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text)' }}>Корзина пуста</h2>
        <p style={{ color: 'var(--hint)' }} className="text-sm">Перейди в каталог и добавь товары</p>
      </div>
      <Link to="/catalog" className="btn-primary" style={{ maxWidth: 200 }}>
        В каталог
      </Link>
    </div>
  )

  if (!cart || cart.items.length === 0) return null

  return (
    <div className="px-4 pt-5 pb-6 space-y-4">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>🛒 Корзина</h1>
      </div>

      {/* Позиции */}
      <div className="space-y-2">
        {cart.items.map(item => (
          <div
            key={item.id}
            ref={el => { if (el) itemRefs.current.set(item.id, el); else itemRefs.current.delete(item.id) }}
            className="flex gap-3 p-3 rounded-2xl transition-opacity"
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              opacity: updatingId === item.id ? 0.5 : 1,
            }}
          >
            <div
              className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0"
              style={{ background: 'var(--bg3)' }}
            >
              {item.product_image
                ? <img src={item.product_image} alt={item.product_name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <rect x="2" y="7" width="20" height="12" rx="4" stroke="var(--hint)" strokeWidth="1.5"/>
                      <path d="M8 11v4M6 13h4" stroke="var(--hint)" strokeWidth="1.5" strokeLinecap="round"/>
                      <circle cx="16" cy="12" r="1" fill="var(--hint)"/>
                      <circle cx="18" cy="14" r="1" fill="var(--hint)"/>
                      <path d="M9 4l1.5 3M15 4l-1.5 3" stroke="var(--hint)" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
              }
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                {item.product_name}
              </p>
              {item.lot_name && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>{item.lot_name}</p>
              )}
              {Object.keys(item.input_data).length > 0 && (
                <div className="mt-1">
                  {Object.entries(item.input_data).map(([k, v]) => (
                    <span key={k} className="text-xs mr-2" style={{ color: 'var(--hint)' }}>
                      {k}: <b style={{ color: 'var(--text)' }}>{v}</b>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mt-2">
                <p className="font-bold text-sm" style={{ color: '#60a5fa' }}>
                  {fmtPrice(item.subtotal)} ₽
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleQtyChange(item, -1)}
                    className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                    style={{ background: 'var(--bg3)', color: 'var(--text)' }}
                    disabled={!!updatingId}
                  >
                    {item.quantity === 1
                      ? <Trash2 size={13} style={{ color: '#f87171' }} />
                      : <Minus size={13} />
                    }
                  </button>
                  <span className="text-sm font-bold w-5 text-center" style={{ color: 'var(--text)' }}>
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleQtyChange(item, 1)}
                    className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                    style={{ background: 'var(--bg3)', color: 'var(--text)' }}
                    disabled={!!updatingId}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Промокод + итоги + кнопки — рассыпаются вместе */}
      <div ref={bottomRef} className="space-y-4">
        {/* Промокод */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Tag size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--hint)' }} />
            <input
              type="text"
              className="input pl-10 uppercase tracking-widest"
              placeholder="Промокод"
              value={promoInput}
              onChange={e => setPromoInput(e.target.value.toUpperCase())}
            />
          </div>
          <button
            type="button"
            onClick={handleApplyPromo}
            disabled={!promoInput.trim() || promoApplying}
            className="px-4 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg, #2563eb, #2d58ad)',
              color: '#fff',
            }}
          >
            {promoApplying ? '...' : 'Применить'}
          </button>
        </div>

        {/* Применённый промокод */}
        {cart.promo_code && (
          <div
            className="flex items-center justify-between px-3 py-2 rounded-xl"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <span className="text-sm font-medium" style={{ color: '#34d399' }}>🏷 {cart.promo_code}</span>
            <span className="text-sm font-bold" style={{ color: '#34d399' }}>
              -{fmtPrice(cart.promo_discount ?? 0)} ₽
            </span>
          </div>
        )}

        {/* Итоги */}
        <div className="card space-y-2">
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--hint)' }}>Сумма</span>
            <span style={{ color: 'var(--text)' }}>{fmtPrice(cart.subtotal)} ₽</span>
          </div>
          {cart.discount_amount > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--hint)' }}>Скидка</span>
              <span style={{ color: '#34d399' }}>-{fmtPrice(cart.discount_amount)} ₽</span>
            </div>
          )}
          <div className="divider" />
          <div className="flex justify-between font-bold text-base">
            <span style={{ color: 'var(--text)' }}>Итого</span>
            <span style={{ color: '#60a5fa' }}>{fmtPrice(cart.total)} ₽</span>
          </div>
        </div>

        <button type="button" className="btn-primary" onClick={handleCheckout}>
          Оформить заказ
        </button>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleClear}
            disabled={clearing}
            style={{
              background: 'none',
              border: 'none',
              color: '#666',
              fontSize: 13,
              cursor: 'pointer',
              padding: '4px 0',
              opacity: clearing ? 0.4 : 1,
            }}
          >
            Очистить корзину
          </button>
        </div>
      </div>

    </div>
  )
}
