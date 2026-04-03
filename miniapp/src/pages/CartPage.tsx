// src/pages/CartPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Plus, Minus, Tag, ShoppingBag } from 'lucide-react'
import toast from 'react-hot-toast'
import { cartApi, type CartItem } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'
import { useCartStore } from '@/store'
import { Link } from 'react-router-dom'

export default function CartPage() {
  const navigate = useNavigate()
  const { haptic, showConfirm } = useTelegram()
  const { setItemsCount } = useCartStore()
  const qc = useQueryClient()

  const [promoInput, setPromoInput] = useState('')
  const [promoApplying, setPromoApplying] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const { data: cart, isLoading, refetch } = useQuery({
    queryKey: ['cart'],
    queryFn: cartApi.get,
  })

  const refreshCart = async () => {
    const updated = await refetch()
    if (updated.data) {
      setItemsCount(updated.data.items_count)
      qc.invalidateQueries({ queryKey: ['cart'] })
    }
  }

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

  const handleClear = async () => {
    const ok = await showConfirm('Очистить корзину?')
    if (!ok) return
    haptic.impact('heavy')
    try {
      await cartApi.clear()
      await refreshCart()
    } catch {
      toast.error('Ошибка')
    }
  }

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

  if (isLoading) return (
    <div className="px-4 pt-4 space-y-3">
      {Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
    </div>
  )

  if (!cart || cart.items.length === 0) return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center pt-16">
      <ShoppingBag size={64} style={{ color: 'var(--bg2)' }} />
      <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Корзина пуста</h2>
      <p style={{ color: 'var(--hint)' }} className="text-sm">
        Перейди в каталог и добавь товары
      </p>
      <Link to="/catalog" className="btn-primary mt-4" style={{ maxWidth: 200 }}>
        В каталог
      </Link>
    </div>
  )

  return (
    <div className="px-4 pt-4 pb-6 space-y-4 animate-fade-in">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
          🛒 Корзина
        </h1>
        <button
          onClick={handleClear}
          className="text-sm flex items-center gap-1"
          style={{ color: 'var(--destructive)' }}
        >
          <Trash2 size={14} />
          Очистить
        </button>
      </div>

      {/* Позиции */}
      <div className="space-y-3">
        {cart.items.map(item => (
          <div
            key={item.id}
            className="flex gap-3 p-3 rounded-2xl animate-fade-in"
            style={{
              background: 'var(--bg2)',
              opacity: updatingId === item.id ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {/* Фото */}
            <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-black/5">
              {item.product_image
                ? <img src={item.product_image} alt={item.product_name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-2xl">🎮</div>
              }
            </div>

            {/* Инфо */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                {item.product_name}
              </p>
              {item.lot_name && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>{item.lot_name}</p>
              )}

              {/* Данные (логин и т.д.) */}
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
                {/* Цена */}
                <p className="font-bold text-sm" style={{ color: 'var(--btn)' }}>
                  {item.subtotal.toLocaleString('ru')} ₽
                </p>

                {/* Количество */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleQtyChange(item, -1)}
                    className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                    style={{ background: 'var(--bg)', color: 'var(--text)' }}
                    disabled={!!updatingId}
                  >
                    {item.quantity === 1 ? <Trash2 size={14} style={{ color: 'var(--destructive)' }} /> : <Minus size={14} />}
                  </button>
                  <span className="text-sm font-bold w-5 text-center" style={{ color: 'var(--text)' }}>
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => handleQtyChange(item, 1)}
                    className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                    style={{ background: 'var(--bg)', color: 'var(--text)' }}
                    disabled={!!updatingId}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Промокод */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Tag size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--hint)' }} />
          <input
            type="text"
            className="input pl-9 uppercase"
            placeholder="Промокод"
            value={promoInput}
            onChange={e => setPromoInput(e.target.value.toUpperCase())}
          />
        </div>
        <button
          onClick={handleApplyPromo}
          disabled={!promoInput.trim() || promoApplying}
          className="px-4 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95"
          style={{ background: 'var(--btn)', color: 'var(--btn-text)', opacity: promoApplying ? 0.6 : 1 }}
        >
          {promoApplying ? '...' : 'Применить'}
        </button>
      </div>

      {/* Уже применённый промокод */}
      {cart.promo_code && (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl"
             style={{ background: 'var(--bg2)' }}>
          <span className="text-sm" style={{ color: 'var(--text)' }}>
            🏷 {cart.promo_code}
          </span>
          <span className="text-sm font-bold" style={{ color: '#10b981' }}>
            -{(cart.promo_discount ?? 0).toLocaleString('ru')} ₽
          </span>
        </div>
      )}

      {/* Итоги */}
      <div className="card space-y-2">
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--hint)' }}>Сумма</span>
          <span style={{ color: 'var(--text)' }}>{cart.subtotal.toLocaleString('ru')} ₽</span>
        </div>
        {cart.discount_amount > 0 && (
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--hint)' }}>Скидка</span>
            <span style={{ color: '#10b981' }}>-{cart.discount_amount.toLocaleString('ru')} ₽</span>
          </div>
        )}
        <div className="h-px" style={{ background: 'var(--bg)' }} />
        <div className="flex justify-between font-bold">
          <span style={{ color: 'var(--text)' }}>Итого</span>
          <span style={{ color: 'var(--btn)' }}>{cart.total.toLocaleString('ru')} ₽</span>
        </div>
      </div>

      {/* Кнопка оформления */}
      <button
        className="btn-primary"
        onClick={() => navigate('/checkout')}
      >
        Оформить заказ
      </button>
    </div>
  )
}
