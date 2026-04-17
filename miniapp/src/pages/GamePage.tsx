// src/pages/GamePage.tsx
import { useState, useRef, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Clock, Plus, Minus, Heart } from 'lucide-react'
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
}

function LotRow({ lot, disabled, cartQty, onAdd, onRemove }: LotRowProps) {
  const hasDiscount = !!lot.original_price && lot.original_price > lot.price
  const discountPct = hasDiscount
    ? Math.round((1 - lot.price / lot.original_price!) * 100)
    : 0

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

      {/* Qty pill — fixed width, transforms from [+] to [− qty +] */}
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-full overflow-hidden transition-all duration-200"
        style={{
          width: cartQty > 0 ? 84 : 34,
          height: 34,
          background: disabled
            ? 'rgba(239,68,68,0.08)'
            : 'rgba(45,88,173,0.14)',
          border: disabled
            ? '1px solid rgba(239,68,68,0.18)'
            : '1px solid rgba(45,88,173,0.30)',
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {cartQty > 0 ? (
            <motion.div
              key="qty"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="flex items-center w-full"
            >
              <button
                type="button"
                onClick={onRemove}
                className="flex items-center justify-center w-[28px] h-[34px] active:scale-90 transition-transform"
                style={{ color: '#f87171' }}
              >
                <Minus size={13} />
              </button>
              <span
                className="flex-1 text-center text-xs font-bold select-none"
                style={{ color: '#6b9de8' }}
              >
                {cartQty}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={onAdd}
                className="flex items-center justify-center w-[28px] h-[34px] active:scale-90 transition-transform"
                style={{ color: '#6b9de8' }}
              >
                <Plus size={13} />
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="add"
              type="button"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              disabled={disabled}
              onClick={onAdd}
              className="flex items-center justify-center w-full h-full active:scale-90 transition-transform"
              style={{ color: disabled ? '#f87171' : '#6b9de8' }}
            >
              <Plus size={15} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── ProductSection — товар с лотами, всегда развёрнут ────────────────────────

interface ProductSectionProps {
  product: Product
  cartQtyMap: Map<string, number>
  isFavorite: boolean
  onAdd: (product: Product, lot?: Lot, inputData?: Record<string, string>) => void
  onRemove: (product: Product, lot?: Lot) => void
  onFavoriteToggle: (productId: string, added: boolean) => void
}

function ProductSection({ product, cartQtyMap, isFavorite, onAdd, onRemove, onFavoriteToggle }: ProductSectionProps) {
  const lots = product.lots ?? []
  const inputFields = product.input_fields ?? []
  const isOutOfStock = product.stock !== null && product.stock === 0
  const hasLots = lots.length > 0
  const isAuto = product.delivery_type === 'auto'

  const [inputData, setInputData] = useState<Record<string, string>>({})
  const [showInputs, setShowInputs] = useState(false)
  const hasInputs = inputFields.length > 0
  const [favPending, setFavPending] = useState(false)

  const handleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (favPending) return
    setFavPending(true)
    try {
      const res = await catalogApi.toggleFavorite(product.id)
      onFavoriteToggle(product.id, res.added)
    } catch {
      // silent
    } finally {
      setFavPending(false)
    }
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--bg2)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Product header — не кнопка, просто заголовок */}
      <div className="px-3.5 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
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
          {/* Favourite button */}
          <button
            type="button"
            onClick={handleFavorite}
            disabled={favPending}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full active:scale-90 transition-transform"
            style={{ color: isFavorite ? '#f87171' : 'rgba(255,255,255,0.3)' }}
          >
            <Heart size={15} fill={isFavorite ? '#f87171' : 'none'} />
          </button>
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
            type="button"
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
                  onAdd={() => onAdd(product, lot, inputData)}
                  onRemove={() => onRemove(product, lot)}
                />
              )
            })
          }
        </div>
      ) : (
        /* Single product without lots — pill style */
        <div className="px-3.5 py-2.5 flex justify-center">
          {(() => {
            const key = product.id
            const qty = cartQtyMap.get(key) ?? 0
            return (
              <div
                className="flex items-center justify-center rounded-full overflow-hidden transition-all duration-200"
                style={{
                  width: qty > 0 ? 110 : 'auto',
                  minWidth: qty > 0 ? 110 : undefined,
                  height: 38,
                  background: isOutOfStock ? 'rgba(239,68,68,0.08)' : 'rgba(45,88,173,0.14)',
                  border: isOutOfStock ? '1px solid rgba(239,68,68,0.18)' : '1px solid rgba(45,88,173,0.30)',
                }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {qty > 0 ? (
                    <motion.div
                      key="qty"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center w-full"
                    >
                      <button type="button" onClick={() => onRemove(product)}
                        className="flex items-center justify-center w-[36px] h-[38px] active:scale-90 transition-transform"
                        style={{ color: '#f87171' }}>
                        <Minus size={14} />
                      </button>
                      <span className="flex-1 text-center text-sm font-bold" style={{ color: '#6b9de8' }}>
                        {qty}
                      </span>
                      <button type="button" disabled={isOutOfStock} onClick={() => onAdd(product, undefined, inputData)}
                        className="flex items-center justify-center w-[36px] h-[38px] active:scale-90 transition-transform"
                        style={{ color: '#6b9de8' }}>
                        <Plus size={14} />
                      </button>
                    </motion.div>
                  ) : (
                    <motion.button
                      key="add"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      disabled={isOutOfStock}
                      onClick={() => onAdd(product, undefined, inputData)}
                      className="flex items-center justify-center gap-2 px-5 h-full text-sm font-semibold active:scale-95 transition-transform"
                      style={{ color: isOutOfStock ? '#f87171' : '#6b9de8' }}
                    >
                      {isOutOfStock ? 'Нет в наличии' : <Plus size={15} />}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
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
  const [searchParams] = useSearchParams()
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)
  const catFromUrlApplied = useRef(false)
  const { haptic } = useTelegram()
  const { increment, decrement } = useCartStore()
  const qc = useQueryClient()

  // Optimistic local qty overrides: key → delta from server qty
  const [optimisticDeltas, setOptimisticDeltas] = useState<Map<string, number>>(new Map())
  // Per-key lock to prevent double-taps from firing multiple API calls
  const pendingKeys = useRef(new Set<string>())

  const { data: games = [] } = useQuery({
    queryKey: ['games'],
    queryFn: () => catalogApi.getGames(),
    staleTime: 5 * 60 * 1000,
  })

  const { data: categories = [], isLoading: catsLoading, isError: catsError, refetch: refetchCats } = useQuery({
    queryKey: ['categories', slug],
    queryFn: () => catalogApi.getCategories(slug!),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  })

  // Применить ?cat= из URL один раз после загрузки категорий
  useEffect(() => {
    if (catFromUrlApplied.current || categories.length === 0) return
    const catParam = searchParams.get('cat')
    if (!catParam) return
    catFromUrlApplied.current = true
    if (categories.find(c => c.id === catParam)) setSelectedCatId(catParam)
  }, [categories.length, searchParams])

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

  // Favorites for heart buttons
  const { data: favorites = [] } = useQuery({
    queryKey: ['favorites'],
    queryFn: catalogApi.getFavorites,
    staleTime: 60_000,
  })
  const favoriteIds = new Set(favorites.map(f => f.id))

  const handleFavoriteToggle = (productId: string, added: boolean) => {
    qc.setQueryData<Product[]>(['favorites'], prev => {
      if (!prev) return prev
      if (added) {
        const product = products.find(p => p.id === productId)
        return product ? [...prev, product] : prev
      }
      return prev.filter(p => p.id !== productId)
    })
  }

  // Build cart qty map with optimistic deltas applied
  const cartQtyMap = new Map<string, number>()
  if (cart?.items) {
    for (const item of cart.items) {
      const key = item.lot_id ? `${item.product_id}:${item.lot_id}` : item.product_id
      cartQtyMap.set(key, (cartQtyMap.get(key) ?? 0) + item.quantity)
    }
  }
  for (const [key, delta] of optimisticDeltas) {
    cartQtyMap.set(key, Math.max(0, (cartQtyMap.get(key) ?? 0) + delta))
  }

  const gameFromApi = games.find(g => g.slug === slug)
  const gameName = gameFromApi?.name ?? slug?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? ''
  const rootCats = (cats: Category[]) => cats.filter(c => !c.parent_id)

  // Optimistic add to cart
  const handleAdd = async (product: Product, lot?: Lot, inputData?: Record<string, string>) => {
    const key = lot ? `${product.id}:${lot.id}` : product.id
    if (pendingKeys.current.has(key)) return
    pendingKeys.current.add(key)

    // Instant UI update
    setOptimisticDeltas(prev => {
      const next = new Map(prev)
      next.set(key, (next.get(key) ?? 0) + 1)
      return next
    })
    increment()
    haptic.impact('light')

    try {
      await cartApi.addItem({
        product_id: product.id,
        lot_id: lot?.id,
        quantity: 1,
        input_data: inputData ?? {},
      })
      // Wait for fresh cart data before clearing delta
      await qc.refetchQueries({ queryKey: ['cart'] })
    } catch (e: any) {
      decrement()
      haptic.error()
      toast.error(e?.response?.data?.detail ?? 'Ошибка')
    } finally {
      setOptimisticDeltas(prev => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      pendingKeys.current.delete(key)
    }
  }

  // Optimistic remove from cart
  const handleRemove = async (product: Product, lot?: Lot) => {
    if (!cart?.items) return
    const key = lot ? `${product.id}:${lot.id}` : product.id
    if (pendingKeys.current.has(key)) return
    pendingKeys.current.add(key)

    const cartItem = cart.items.find(i =>
      i.product_id === product.id && (lot ? i.lot_id === lot.id : !i.lot_id)
    )
    if (!cartItem) { pendingKeys.current.delete(key); return }

    const currentQty = cartQtyMap.get(key) ?? 0
    if (currentQty <= 0) { pendingKeys.current.delete(key); return }

    // Instant UI update
    setOptimisticDeltas(prev => {
      const next = new Map(prev)
      next.set(key, (next.get(key) ?? 0) - 1)
      return next
    })
    if (currentQty <= 1) decrement()
    haptic.impact('light')

    try {
      await cartApi.updateItem(cartItem.id, cartItem.quantity - 1)
      await qc.refetchQueries({ queryKey: ['cart'] })
    } catch (e: any) {
      if (currentQty <= 1) increment()
      haptic.error()
      toast.error(e?.response?.data?.detail ?? 'Ошибка')
    } finally {
      setOptimisticDeltas(prev => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      pendingKeys.current.delete(key)
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
                isFavorite={favoriteIds.has(product.id)}
                onAdd={(p, l, data) => handleAdd(p, l, data)}
                onRemove={handleRemove}
                onFavoriteToggle={handleFavoriteToggle}
              />
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  )
}
