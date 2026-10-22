/**
 * src/web/pages/WebCartPage.tsx
 * Корзина на сайте: позиции, количество, промокод, итог, переход к оформлению.
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Minus, Trash2, ShoppingCart, Tag } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { useWebCart } from '@/web/cart/useWebCart'

function money(v: number) {
  return Number(v).toLocaleString('ru-RU') + ' ₽'
}

export default function WebCartPage() {
  const { cart, isLoading, setQty, applyPromo } = useWebCart()
  const navigate = useNavigate()
  const [promo, setPromo] = useState('')
  const [applyingPromo, setApplyingPromo] = useState(false)

  async function changeQty(itemId: string, q: number) {
    try {
      await setQty(itemId, q)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Ошибка')
    }
  }

  async function handlePromo() {
    if (!promo.trim()) return
    setApplyingPromo(true)
    try {
      const res = await applyPromo(promo.trim())
      if (res.valid) toast.success(res.message || 'Промокод применён')
      else toast.error(res.message || 'Промокод недействителен')
    } catch {
      toast.error('Не удалось применить промокод')
    } finally {
      setApplyingPromo(false)
    }
  }

  if (isLoading) {
    return <div className="web-container py-16 text-center text-sm text-[var(--hint)]">Загрузка...</div>
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="web-container py-24 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[var(--bg2)] flex items-center justify-center mx-auto mb-5 text-[var(--hint)]">
          <ShoppingCart size={24} />
        </div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Корзина пуста</h1>
        <p className="text-sm text-[var(--hint)] mt-2 mb-6">Добавьте товары из каталога.</p>
        <Link to="/catalog" className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-[var(--text)]" style={{ background: 'var(--gradient-primary)' }}>
          В каталог
        </Link>
      </div>
    )
  }

  return (
    <div className="web-container py-8 md:py-12 max-w-3xl">
      <h1 className="text-2xl md:text-3xl font-semibold text-[var(--text)] mb-6">Корзина</h1>

      <div className="space-y-2.5">
        {cart.items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg2)] p-3.5">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[var(--text)] truncate">{item.product_name}</div>
              <div className="text-xs text-[var(--hint)] mt-0.5">{money(item.price_snapshot)} × {item.quantity}</div>
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg2)] px-1.5 py-1">
              <button onClick={() => changeQty(item.id, item.quantity - 1)} className="p-1.5 rounded-lg text-[var(--text-2)] hover:bg-[var(--bg3)]" aria-label="Меньше">
                <Minus size={14} />
              </button>
              <span className="w-6 text-center text-sm font-semibold text-[var(--text)]">{item.quantity}</span>
              <button onClick={() => changeQty(item.id, item.quantity + 1)} className="p-1.5 rounded-lg text-[var(--text-2)] hover:bg-[var(--bg3)]" aria-label="Больше">
                <Plus size={14} />
              </button>
            </div>

            <div className="w-20 text-right text-sm font-semibold text-[var(--text)] shrink-0">{money(item.subtotal)}</div>

            <button onClick={() => changeQty(item.id, 0)} className="p-2 rounded-lg text-[var(--hint)] hover:text-red-400 hover:bg-red-500/10 transition-colors" aria-label="Удалить">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Промокод */}
      <div className="mt-5 flex gap-2">
        <div className="flex-1 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg2)] px-3">
          <Tag size={15} className="text-[var(--hint)] shrink-0" />
          <input
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePromo()}
            placeholder="Промокод"
            className="flex-1 bg-transparent py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none"
          />
        </div>
        <button
          onClick={handlePromo}
          disabled={applyingPromo || !promo.trim()}
          className="px-4 rounded-xl bg-[var(--bg3)] border border-[var(--border)] text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg3)] disabled:opacity-40 transition-all"
        >
          Применить
        </button>
      </div>

      {/* Итоги */}
      <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--bg2)] p-5 space-y-2">
        <div className="flex justify-between text-sm text-[var(--text-2)]">
          <span>Сумма</span>
          <span>{money(cart.subtotal)}</span>
        </div>
        {cart.discount_amount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-2)]">Скидка</span>
            <span style={{ color: '#34d399' }}>−{money(cart.discount_amount)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold pt-2 border-t border-[var(--border)]">
          <span className="text-[var(--text)]">Итого</span>
          <span style={{ color: 'var(--link)' }}>{money(cart.total)}</span>
        </div>
      </div>

      <button
        onClick={() => navigate('/checkout')}
        className="mt-5 w-full py-3.5 rounded-xl text-sm font-semibold text-[var(--text)] transition-all active:scale-[0.97] hover:brightness-110"
        style={{ background: 'var(--gradient-primary)' }}
      >
        Оформить заказ
      </button>
    </div>
  )
}
