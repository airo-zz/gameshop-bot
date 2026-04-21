// src/pages/GamePage.tsx
import { useState, useRef, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Clock, Plus, Minus } from 'lucide-react'
import toast from 'react-hot-toast'
import { catalogApi, cartApi, type Category, type Product, type InputField } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'
import { useCartStore } from '@/store'
import clsx from 'clsx'

// ── ProductRow — строка товара с ценой и кнопкой +/- ─────────────────────────

interface ProductRowProps {
  product: Product
  cartQty: number
  onAdd: (inputData?: Record<string, string>) => void
  onRemove: () => void
}

function ProductRow({ product, cartQty, onAdd, onRemove }: ProductRowProps) {
  const hasDiscount = !!product.original_price && Number(product.original_price) > Number(product.price)
  const discountPct = hasDiscount
    ? Math.round((1 - Number(product.price) / Number(product.original_price!)) * 100)
    : 0

  const isAuto = product.delivery_type === 'auto'
  const isOutOfStock = product.is_out_of_stock || (product.stock !== null && product.stock === 0)
  const inputFields = product.input_fields ?? []
  const hasInputs = inputFields.length > 0

  const [inputData, setInputData] = useState<Record<string, string>>({})
  const [showInputs, setShowInputs] = useState(false)

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'nowrap',
        gap: 8, padding: '10px 14px', minWidth: 0,
      }}>
        {/* Name + badge + delivery */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: '0.875rem', fontWeight: 500, color: isOutOfStock ? 'rgba(255,255,255,0.35)' : 'var(--text)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            flex: 1, minWidth: 0,
          }}>
            {product.name}
          </span>
          {product.badge && !isOutOfStock && (
            <span style={{
              flexShrink: 0,
              background: 'linear-gradient(135deg,#f59e0b,#ef4444)', color: '#fff',
              fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
            }}>
              {product.badge}
            </span>
          )}
          {isOutOfStock ? (
            <span style={{
              flexShrink: 0, fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 20,
              background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)',
            }}>
              Нет в наличии
            </span>
          ) : isAuto ? (
            <span style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 20,
              background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)',
            }}>
              <Zap size={8} fill="#34d399" stroke="none" />Авто
            </span>
          ) : (
            <span style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 9, padding: '2px 6px', borderRadius: 20,
              background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <Clock size={8} />Вручную
            </span>
          )}
        </div>

        {/* Price */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {hasDiscount && (
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', textDecoration: 'line-through' }}>
              {Number(product.original_price).toLocaleString('ru')} ₽
            </span>
          )}
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: isOutOfStock ? 'rgba(255,255,255,0.25)' : '#6b9de8' }}>
            {Number(product.price).toLocaleString('ru')} ₽
          </span>
          {hasDiscount && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 4px', borderRadius: 999,
              background: 'rgba(16,185,129,0.18)', color: '#34d399',
            }}>
              -{discountPct}%
            </span>
          )}
        </div>

        {/* Add/remove pill */}
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 9999, overflow: 'hidden', transition: 'width 0.2s, background 0.2s',
          width: cartQty > 0 ? 96 : 34, height: 34,
          background: isOutOfStock
            ? 'rgba(239,68,68,0.10)'
            : cartQty > 0
              ? 'rgba(45,88,173,0.16)'
              : 'linear-gradient(135deg, #2563eb, #2d58ad)',
          border: isOutOfStock
            ? '1px solid rgba(239,68,68,0.22)'
            : cartQty > 0
              ? '1px solid rgba(45,88,173,0.32)'
              : '1px solid rgba(45,88,173,0.60)',
          boxShadow: isOutOfStock || cartQty > 0 ? 'none' : '0 2px 10px rgba(37,99,235,0.35)',
          opacity: isOutOfStock ? 0.6 : 1,
        }}>
          <AnimatePresence mode="wait" initial={false}>
            {cartQty > 0 ? (
              <motion.div key="qty"
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }}
                style={{ display: 'flex', alignItems: 'center', width: '100%' }}
              >
                <button type="button" onClick={onRemove}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 34, background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }}>
                  <Minus size={14} />
                </button>
                <span style={{ flex: 1, textAlign: 'center', fontSize: '0.8125rem', fontWeight: 700, color: '#93b8f0', userSelect: 'none' }}>
                  {cartQty}
                </span>
                <button type="button" disabled={isOutOfStock} onClick={() => onAdd(inputData)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 34, background: 'none', border: 'none', cursor: 'pointer', color: isOutOfStock ? 'rgba(255,255,255,0.2)' : '#93b8f0' }}>
                  <Plus size={14} />
                </button>
              </motion.div>
            ) : (
              <motion.button key="add" type="button"
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }}
                disabled={isOutOfStock} onClick={() => onAdd(hasInputs && Object.keys(inputData).length > 0 ? inputData : undefined)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: 'none', border: 'none', cursor: isOutOfStock ? 'not-allowed' : 'pointer', color: isOutOfStock ? '#f87171' : '#fff' }}
              >
                <Plus size={18} strokeWidth={2.6} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Input fields (collapsible) */}
      {hasInputs && !isOutOfStock && (
        <div style={{ padding: '0 14px 8px' }}>
          <button
            type="button"
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#6b9de8', marginBottom: showInputs ? 8 : 0 }}
            onClick={() => setShowInputs(!showInputs)}
          >
            Данные для заказа
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{ transform: showInputs ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          {showInputs && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {inputFields.map((field: InputField) => (
                <div key={field.key}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
                    {field.label}
                  </label>
                  {field.type === 'select' ? (
                    <select className="input" style={{ fontSize: 13, padding: '8px 12px', borderRadius: 12 }}
                      value={inputData[field.key] ?? ''}
                      onChange={e => setInputData(prev => ({ ...prev, [field.key]: e.target.value }))}>
                      <option value="">Выбери...</option>
                      {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <input type={field.type === 'number' ? 'number' : 'text'} className="input"
                      style={{ fontSize: 13, padding: '8px 12px', borderRadius: 12 }}
                      placeholder={field.placeholder ?? `Введи ${field.label.toLowerCase()}`}
                      value={inputData[field.key] ?? ''}
                      onChange={e => setInputData(prev => ({ ...prev, [field.key]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
          )}
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
  const switchingCat = useRef(false)
  const { haptic } = useTelegram()
  const { increment, decrement } = useCartStore()
  const qc = useQueryClient()

  // Optimistic local qty overrides: productId → delta from server qty
  const [optimisticDeltas, setOptimisticDeltas] = useState<Map<string, number>>(new Map())
  const pendingKeys = useRef(new Set<string>())

  const { data: games = [] } = useQuery({
    queryKey: ['games'],
    queryFn: () => catalogApi.getGames(),
    staleTime: 5 * 60 * 1000,
  })

  const { data: categories = [], isError: catsError, refetch: refetchCats } = useQuery({
    queryKey: ['categories', slug],
    queryFn: () => catalogApi.getCategories(slug!),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (catFromUrlApplied.current || categories.length === 0) return
    const catParam = searchParams.get('cat')
    if (!catParam) return
    catFromUrlApplied.current = true
    if (categories.find(c => c.id === catParam)) setSelectedCatId(catParam)
  }, [categories.length, searchParams])

  const activeCatId = selectedCatId ?? categories[0]?.id ?? null

  async function handleCatClick(catId: string) {
    if (switchingCat.current || catId === activeCatId) return
    if (qc.getQueryData(['products', catId])) { setSelectedCatId(catId); return }
    switchingCat.current = true
    try {
      await qc.prefetchQuery({ queryKey: ['products', catId], queryFn: () => catalogApi.getProducts(catId), staleTime: 2 * 60_000 })
      setSelectedCatId(catId)
    } finally {
      switchingCat.current = false
    }
  }

  const { data: products = [], isError: productsError, refetch: refetchProducts } = useQuery({
    queryKey: ['products', activeCatId],
    queryFn: () => catalogApi.getProducts(activeCatId!),
    enabled: !!activeCatId,
    staleTime: 2 * 60 * 1000,
    initialData: () => activeCatId ? qc.getQueryData<Product[]>(['products', activeCatId]) : undefined,
  })

  const { data: cart } = useQuery({
    queryKey: ['cart'],
    queryFn: cartApi.get,
    staleTime: 30_000,
  })

  // Build cart qty map (product_id → qty) with optimistic deltas applied
  const cartQtyMap = new Map<string, number>()
  if (cart?.items) {
    for (const item of cart.items) {
      cartQtyMap.set(item.product_id, (cartQtyMap.get(item.product_id) ?? 0) + item.quantity)
    }
  }
  for (const [key, delta] of optimisticDeltas) {
    cartQtyMap.set(key, Math.max(0, (cartQtyMap.get(key) ?? 0) + delta))
  }

  const gameFromApi = games.find(g => g.slug === slug)
  const gameName = gameFromApi?.name ?? slug?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? ''
  const rootCats = (cats: Category[]) => cats.filter(c => !c.parent_id)

  const handleAdd = async (product: Product, inputData?: Record<string, string>) => {
    const key = product.id
    if (pendingKeys.current.has(key)) return
    pendingKeys.current.add(key)

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
        quantity: 1,
        input_data: inputData ?? {},
      })
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

  const handleRemove = async (product: Product) => {
    if (!cart?.items) return
    const key = product.id
    if (pendingKeys.current.has(key)) return
    pendingKeys.current.add(key)

    const cartItem = cart.items.find(i => i.product_id === product.id)
    if (!cartItem) { pendingKeys.current.delete(key); return }

    const currentQty = cartQtyMap.get(key) ?? 0
    if (currentQty <= 0) { pendingKeys.current.delete(key); return }

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
        {rootCats(categories).map(cat => (
          <button
            key={cat.id}
            onClick={() => handleCatClick(cat.id)}
            className={clsx('pill', activeCatId === cat.id && 'pill-active')}
          >
            {cat.name}
          </button>
        ))}
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
                onClick={() => handleCatClick(sub.id)}
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
        ) : products.length === 0 ? (
          <div className="text-center py-20">
            <p style={{ color: 'var(--hint)' }}>Товары скоро появятся</p>
          </div>
        ) : (
          <div style={{
            borderRadius: 18, overflow: 'hidden',
            background: 'var(--bg2)', border: '1px solid rgba(255,255,255,0.07)',
          }}>
            {products.map(product => (
                <ProductRow
                  key={product.id}
                  product={product}
                  cartQty={cartQtyMap.get(product.id) ?? 0}
                  onAdd={(inputData) => handleAdd(product, inputData)}
                  onRemove={() => handleRemove(product)}
                />
              ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
