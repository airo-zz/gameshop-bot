// src/pages/GamePage.tsx
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingCart, Check, Zap, Clock, Plus, Minus } from 'lucide-react'
import toast from 'react-hot-toast'
import { catalogApi, cartApi, type Category, type Product, type Lot, type InputField } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'
import { useCartStore } from '@/store'
import PageLoader from '@/components/ui/PageLoader'
import clsx from 'clsx'

// ── LotRow — строка лота с ценой и кнопкой +/- ──────────────────────────────

interface LotRowProps {
  lot: Lot
  disabled: boolean
  cartQty: number
  onAdd: () => void
  onRemove: () => void
  adding: boolean
  removing: boolean
}

function LotRow({ lot, disabled, cartQty, onAdd, onRemove, adding, removing }: LotRowProps) {
  const hasDiscount = !!lot.original_price && lot.original_price > lot.price
  const discountPct = hasDiscount
    ? Math.round((1 - lot.price / lot.original_price!) * 100)
    : 0
  const busy = adding || removing

  return (
    <div
      className="flex items-center gap-2 py-2.5 px-3.5"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      {/* Name + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            {lot.name}
          </span>
          {lot.badge && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: '#fff' }}
            >
              {lot.badge}
            </span>
          )}
          {hasDiscount && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(16,185,129,0.18)', color: '#34d399' }}
            >
              -{discountPct}%
            </span>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="flex items-baseline gap-1.5 flex-shrink-0">
        <span className="text-sm font-bold" style={{ color: '#6b9de8' }}>
          {Number(lot.price).toLocaleString('ru')} ₽
        </span>
        {hasDiscount && (
          <span className="text-[11px] line-through" style={{ color: 'var(--hint)' }}>
            {Number(lot.original_price).toLocaleString('ru')} ₽
          </span>
        )}
      </div>

      {/* Qty controls */}
      {cartQty > 0 ? (
        <div className="flex items-center gap-0 flex-shrink-0">
          <button
            disabled={busy}
            onClick={onRemove}
            className="flex items-center justify-center w-8 h-8 rounded-l-xl transition-all active:scale-90"
            style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRight: 'none',
              color: '#f87171',
            }}
          >
            <Minus size={13} />
          </button>
          <div
            className="flex items-center justify-center h-8 min-w-[28px] text-xs font-bold"
            style={{
              background: 'rgba(45,88,173,0.12)',
              borderTop: '1px solid rgba(45,88,173,0.25)',
              borderBottom: '1px solid rgba(45,88,173,0.25)',
              color: '#6b9de8',
            }}
          >
            {busy ? (
              <span className="w-3 h-3 rounded-full border-2"
                style={{ borderColor: 'rgba(107,157,232,0.25)', borderTopColor: '#6b9de8', animation: 'spin 0.6s linear infinite' }} />
            ) : cartQty}
          </div>
          <button
            disabled={busy || disabled}
            onClick={onAdd}
            className="flex items-center justify-center w-8 h-8 rounded-r-xl transition-all active:scale-90"
            style={{
              background: 'rgba(45,88,173,0.18)',
              border: '1px solid rgba(45,88,173,0.35)',
              borderLeft: 'none',
              color: '#6b9de8',
            }}
          >
            <Plus size={13} />
          </button>
        </div>
      ) : (
        <button
          disabled={disabled || busy}
          onClick={onAdd}
          className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-150 active:scale-90"
          style={{
            background: disabled ? 'rgba(239,68,68,0.1)' : 'rgba(45,88,173,0.18)',
            border: disabled ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(45,88,173,0.35)',
            color: disabled ? '#f87171' : '#6b9de8',
          }}
        >
          {adding ? (
            <span className="w-3.5 h-3.5 rounded-full border-2"
              style={{ borderColor: 'rgba(107,157,232,0.25)', borderTopColor: '#6b9de8', animation: 'spin 0.6s linear infinite' }} />
          ) : (
            <ShoppingCart size={14} />
          )}
        </button>
      )}
    </div>
  )
}

// ── ProductSection — товар с лотами, всегда развёрнут ────────────────────────

interface ProductSectionProps {
  product: Product
  cartQtyMap: Map<string, number> // key: "productId:lotId" or "productId" → qty
  onAdd: (product: Product, lot?: Lot) => Promise<void>
  onRemove: (product: Product, lot?: Lot) => Promise<void>
  busyKey: string | null
  busyAction: 'add' | 'remove' | null
}

function ProductSection({ product, cartQtyMap, onAdd, onRemove, busyKey, busyAction }: ProductSectionProps) {
  const lots = product.lots ?? []
  const inputFields = product.input_fields ?? []
  const isOutOfStock = product.stock !== null && product.stock === 0
  const hasLots = lots.length > 0
  const isAuto = product.delivery_type === 'auto'

  const [inputData, setInputData] = useState<Record<string, string>>({})
  const [showInputs, setShowInputs] = useState(false)
  const hasInputs = inputFields.length > 0

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--bg2)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Product header — не кнопка, просто заголовок */}
      <div className="px-3.5 pt-3 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>
            {product.name}
          </span>
          {isAuto && !isOutOfStock && (
            <span
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}
            >
              <Zap size={9} fill="#34d399" stroke="none" />
              Авто
            </span>
          )}
          {!isAuto && !isOutOfStock && (
            <span
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--hint)', border: '1px solid var(--border)' }}
            >
              <Clock size={9} />
              Вручную
            </span>
          )}
          {isOutOfStock && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              Нет в наличии
            </span>
          )}
        </div>
        {product.short_description && (
          <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--hint)' }}>
            {product.short_description}
          </p>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

      {/* Input fields */}
      {hasInputs && (
        <div className="px-3.5 pt-2.5 pb-1">
          <button
            className="text-xs font-medium mb-2 flex items-center gap-1"
            style={{ color: '#6b9de8' }}
            onClick={() => setShowInputs(!showInputs)}
          >
            Данные для заказа
            <motion.span
              animate={{ rotate: showInputs ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'inline-flex' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
            </motion.span>
          </button>
          {showInputs && (
            <div className="space-y-2 mb-2">
              {inputFields.map((field: InputField) => (
                <div key={field.key}>
                  <label className="text-[11px] mb-1 block font-medium" style={{ color: 'var(--hint)' }}>
                    {field.label}
                  </label>
                  {field.type === 'select' ? (
                    <select
                      className="input text-sm"
                      style={{ padding: '8px 12px', borderRadius: 12 }}
                      value={inputData[field.key] ?? ''}
                      onChange={e => setInputData(prev => ({ ...prev, [field.key]: e.target.value }))}
                    >
                      <option value="">Выбери...</option>
                      {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : 'text'}
                      className="input text-sm"
                      style={{ padding: '8px 12px', borderRadius: 12 }}
                      placeholder={field.placeholder ?? `Введи ${field.label.toLowerCase()}`}
                      value={inputData[field.key] ?? ''}
                      onChange={e => setInputData(prev => ({ ...prev, [field.key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lots */}
      {hasLots ? (
        <div>
          {lots
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order || a.price - b.price)
            .map(lot => {
              const key = `${product.id}:${lot.id}`
              return (
                <LotRow
                  key={lot.id}
                  lot={lot}
                  disabled={isOutOfStock}
                  cartQty={cartQtyMap.get(key) ?? 0}
                  onAdd={() => onAdd(product, lot)}
                  onRemove={() => onRemove(product, lot)}
                  adding={busyKey === key && busyAction === 'add'}
                  removing={busyKey === key && busyAction === 'remove'}
                />
              )
            })
          }
        </div>
      ) : (
        /* Single product without lots */
        <div className="px-3.5 py-2.5">
          {(() => {
            const key = product.id
            const qty = cartQtyMap.get(key) ?? 0
            const isBusy = busyKey === key
            return qty > 0 ? (
              <div className="flex items-center justify-center gap-0">
                <button
                  disabled={isBusy}
                  onClick={() => onRemove(product)}
                  className="flex items-center justify-center w-10 h-9 rounded-l-xl transition-all active:scale-90"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRight: 'none', color: '#f87171' }}
                >
                  <Minus size={14} />
                </button>
                <div
                  className="flex items-center justify-center h-9 min-w-[36px] text-sm font-bold"
                  style={{ background: 'rgba(45,88,173,0.12)', borderTop: '1px solid rgba(45,88,173,0.25)', borderBottom: '1px solid rgba(45,88,173,0.25)', color: '#6b9de8' }}
                >
                  {isBusy ? (
                    <span className="w-3.5 h-3.5 rounded-full border-2"
                      style={{ borderColor: 'rgba(107,157,232,0.25)', borderTopColor: '#6b9de8', animation: 'spin 0.6s linear infinite' }} />
                  ) : qty}
                </div>
                <button
                  disabled={isBusy || isOutOfStock}
                  onClick={() => onAdd(product)}
                  className="flex items-center justify-center w-10 h-9 rounded-r-xl transition-all active:scale-90"
                  style={{ background: 'rgba(45,88,173,0.18)', border: '1px solid rgba(45,88,173,0.35)', borderLeft: 'none', color: '#6b9de8' }}
                >
                  <Plus size={14} />
                </button>
              </div>
            ) : (
              <button
                disabled={isOutOfStock || isBusy}
                onClick={() => onAdd(product)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-95"
                style={{
                  background: isOutOfStock ? 'rgba(239,68,68,0.1)' : 'rgba(45,88,173,0.18)',
                  border: isOutOfStock ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(45,88,173,0.35)',
                  color: isOutOfStock ? '#f87171' : '#6b9de8',
                }}
              >
                {isBusy ? (
                  <span className="w-4 h-4 rounded-full border-2"
                    style={{ borderColor: 'rgba(107,157,232,0.25)', borderTopColor: '#6b9de8', animation: 'spin 0.6s linear infinite' }} />
                ) : isOutOfStock ? (
                  'Нет в наличии'
                ) : (
                  <><ShoppingCart size={14} /> В корзину · {Number(product.price).toLocaleString('ru')} ₽</>
                )}
              </button>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ── GamePage ─────────────────────────────────────────────────────────────────

export default function GamePage() {
  const { slug } = useParams<{ slug: string }>()
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)
  const { haptic } = useTelegram()
  const { increment, decrement } = useCartStore()
  const qc = useQueryClient()

  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'add' | 'remove' | null>(null)

  const { data: games = [] } = useQuery({
    queryKey: ['games'],
    queryFn: catalogApi.getGames,
    staleTime: 5 * 60 * 1000,
  })

  const { data: categories = [], isLoading: catsLoading, isError: catsError, refetch: refetchCats } = useQuery({
    queryKey: ['categories', slug],
    queryFn: () => catalogApi.getCategories(slug!),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  })

  const activeCatId = selectedCatId ?? categories[0]?.id ?? null

  const { data: products = [], isLoading: productsLoading, isError: productsError, refetch: refetchProducts } = useQuery({
    queryKey: ['products', activeCatId],
    queryFn: () => catalogApi.getProducts(activeCatId!),
    enabled: !!activeCatId,
    staleTime: 2 * 60 * 1000,
  })

  // Cart data for qty display
  const { data: cart } = useQuery({
    queryKey: ['cart'],
    queryFn: cartApi.get,
    staleTime: 30_000,
  })

  // Build cart qty map: "productId:lotId" → qty, "productId" → qty (no lot)
  const cartQtyMap = new Map<string, number>()
  if (cart?.items) {
    for (const item of cart.items) {
      const key = item.lot_id ? `${item.product_id}:${item.lot_id}` : item.product_id
      cartQtyMap.set(key, (cartQtyMap.get(key) ?? 0) + item.quantity)
    }
  }

  const gameFromApi = games.find(g => g.slug === slug)
  const gameName = gameFromApi?.name ?? slug?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? ''
  const rootCats = (cats: Category[]) => cats.filter(c => !c.parent_id)

  // Add to cart
  const handleAdd = async (product: Product, lot?: Lot) => {
    const key = lot ? `${product.id}:${lot.id}` : product.id
    if (busyKey) return
    setBusyKey(key)
    setBusyAction('add')
    haptic.impact('light')
    try {
      await cartApi.addItem({
        product_id: product.id,
        lot_id: lot?.id,
        quantity: 1,
        input_data: {},
      })
      increment()
      qc.invalidateQueries({ queryKey: ['cart'] })
    } catch (e: any) {
      haptic.error()
      toast.error(e?.response?.data?.detail ?? 'Ошибка')
    } finally {
      setBusyKey(null)
      setBusyAction(null)
    }
  }

  // Remove from cart (decrease qty)
  const handleRemove = async (product: Product, lot?: Lot) => {
    if (!cart?.items) return
    const key = lot ? `${product.id}:${lot.id}` : product.id
    if (busyKey) return

    // Find cart item
    const cartItem = cart.items.find(i =>
      i.product_id === product.id && (lot ? i.lot_id === lot.id : !i.lot_id)
    )
    if (!cartItem) return

    setBusyKey(key)
    setBusyAction('remove')
    haptic.impact('light')
    try {
      const newQty = cartItem.quantity - 1
      await cartApi.updateItem(cartItem.id, newQty)
      if (newQty <= 0) decrement()
      qc.invalidateQueries({ queryKey: ['cart'] })
    } catch (e: any) {
      haptic.error()
      toast.error(e?.response?.data?.detail ?? 'Ошибка')
    } finally {
      setBusyKey(null)
      setBusyAction(null)
    }
  }

  if (catsError) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p className="text-5xl mb-4">:(</p>
      <p className="text-sm mb-4" style={{ color: 'var(--hint)' }}>Не удалось загрузить данные</p>
      <button
        onClick={() => refetchCats()}
        className="px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-95"
        style={{ background: 'rgba(45,88,173,0.16)', border: '1px solid rgba(45,88,173,0.38)', color: '#6b9de8' }}
      >
        Повторить
      </button>
    </div>
  )

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {/* Header */}
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h1 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
          {gameName}
        </h1>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 px-4 pt-3 overflow-x-auto pb-2 no-scrollbar">
        {catsLoading
          ? <PageLoader />
          : rootCats(categories).map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCatId(cat.id)}
                className={clsx('pill', activeCatId === cat.id && 'pill-active')}
              >
                {cat.name}
              </button>
            ))
        }
      </div>

      {/* Subcategories */}
      {activeCatId && (() => {
        const parent = categories.find(c => c.id === activeCatId)
        if (!parent?.children?.length) return null
        return (
          <div className="flex gap-2 px-4 overflow-x-auto pb-2 no-scrollbar">
            {parent.children.map(sub => (
              <button
                key={sub.id}
                onClick={() => setSelectedCatId(sub.id)}
                style={{
                  flexShrink: 0, fontSize: '12px', padding: '4px 12px', borderRadius: 999,
                  border: selectedCatId === sub.id ? '1px solid rgba(45,88,173,0.55)' : '1px solid var(--border)',
                  background: selectedCatId === sub.id ? 'rgba(45,88,173,0.22)' : 'var(--bg2)',
                  color: selectedCatId === sub.id ? '#93b8f0' : 'var(--hint)',
                  cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 500, transition: 'all 0.15s',
                  boxShadow: selectedCatId === sub.id ? '0 0 10px rgba(45,88,173,0.2)' : 'none',
                }}
              >
                {sub.name}
              </button>
            ))}
          </div>
        )
      })()}

      {/* Products */}
      <div className="px-4 pt-3 pb-4 space-y-3">
        {productsError ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p className="text-sm mb-3" style={{ color: 'var(--hint)' }}>Не удалось загрузить товары</p>
            <button
              onClick={() => refetchProducts()}
              className="px-5 py-2 rounded-2xl text-sm font-semibold transition-all active:scale-95"
              style={{ background: 'rgba(45,88,173,0.16)', border: '1px solid rgba(45,88,173,0.38)', color: '#6b9de8' }}
            >
              Повторить
            </button>
          </div>
        ) : productsLoading ? (
          <PageLoader />
        ) : products.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-3">...</p>
            <p style={{ color: 'var(--hint)' }}>Товары скоро появятся</p>
          </div>
        ) : (
          products.map((product, i) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.2 }}
            >
              <ProductSection
                product={product}
                cartQtyMap={cartQtyMap}
                onAdd={handleAdd}
                onRemove={handleRemove}
                busyKey={busyKey}
                busyAction={busyAction}
              />
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  )
}
