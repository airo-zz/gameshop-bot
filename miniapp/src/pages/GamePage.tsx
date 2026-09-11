// src/pages/GamePage.tsx
import { useState, useRef, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Clock, Plus, Minus, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import { catalogApi, cartApi, type Category, type Product, type InputField } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'
import { useDragScroll } from '@/hooks/useDragScroll'
import { useCartStore } from '@/store'
import clsx from 'clsx'

// ── ProductRow — строка товара с ценой и кнопкой +/- ─────────────────────────

interface ProductRowProps {
  product: Product
  cartQty: number
  onAdd: (inputData?: Record<string, string>, qty?: number) => void
  onRemove: () => void
}

function ProductRow({ product, cartQty, onAdd, onRemove }: ProductRowProps) {
  const hasDiscount = !!product.original_price && Number(product.original_price) > Number(product.price)
  const discountPct = hasDiscount
    ? Math.round((1 - Number(product.price) / Number(product.original_price!)) * 100)
    : 0

  const isOutOfStock = product.is_out_of_stock || (product.stock !== null && product.stock === 0)

  // T19: товар с переменным количеством (напр. Telegram Stars). Цена — за 1 единицу,
  // покупатель вводит количество (≥ min). Итог = цена × количество.
  const qtyField = product.input_fields?.find((f) => f.type === 'quantity')
  const minQty = Math.max(1, Number(qtyField?.min ?? 1))
  const [qty, setQty] = useState<string>(String(minQty))
  if (qtyField && !isOutOfStock) {
    const n = Math.max(minQty, Math.floor(Number(qty) || 0))
    const total = Number(product.price) * n
    const unit = qtyField.unit || 'шт'
    return (
      <div style={{
        background: 'var(--bg2)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16, padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 500, lineHeight: 1.35, color: 'var(--text)', wordBreak: 'break-word' }}>
          {product.name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="text" inputMode="numeric" pattern="[0-9]*" value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
            onBlur={() => setQty(String(Math.max(minQty, Math.floor(Number(qty) || 0))))}
            style={{
              width: 96, height: 40, textAlign: 'center', borderRadius: 12,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--text)', fontSize: '0.95rem', fontWeight: 600,
            }}
          />
          <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)' }}>{unit}</span>
          <span style={{ marginLeft: 'auto', fontSize: '1.05rem', fontWeight: 700, color: '#6b9de8' }}>
            {total.toLocaleString('ru')} ₽
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          Минимум {minQty.toLocaleString('ru')} {unit} · {Number(product.price).toLocaleString('ru')} ₽ за 1 {unit}
        </div>
        <button
          type="button" onClick={() => onAdd({}, n)}
          style={{
            height: 42, borderRadius: 12, border: '1px solid rgba(45,88,173,0.60)',
            background: 'linear-gradient(135deg, #2563eb, #2d58ad)', color: '#fff',
            fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Plus size={18} strokeWidth={2.6} /> В корзину
        </button>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16, padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Name (на всю ширину, перенос) + бейдж */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span style={{
          flex: 1, minWidth: 0,
          fontSize: '0.9rem', fontWeight: 500, lineHeight: 1.35,
          color: isOutOfStock ? 'rgba(255,255,255,0.4)' : 'var(--text)',
          wordBreak: 'break-word',
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
        {isOutOfStock && (
          <span style={{
            flexShrink: 0, fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 20,
            background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)',
          }}>
            Нет в наличии
          </span>
        )}
      </div>

      {/* Нижняя строка: цена слева + кнопка/счётчик справа */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
          {hasDiscount && (
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', textDecoration: 'line-through' }}>
              {Number(product.original_price).toLocaleString('ru')} ₽
            </span>
          )}
          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: isOutOfStock ? 'rgba(255,255,255,0.25)' : '#6b9de8' }}>
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
          width: cartQty > 0 ? 104 : 38, height: 38,
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
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 38, background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }}>
                  <Minus size={15} />
                </button>
                <span style={{ flex: 1, textAlign: 'center', fontSize: '0.85rem', fontWeight: 700, color: '#93b8f0', userSelect: 'none' }}>
                  {cartQty}
                </span>
                <button type="button" disabled={isOutOfStock} onClick={() => onAdd()}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 38, background: 'none', border: 'none', cursor: 'pointer', color: isOutOfStock ? 'rgba(255,255,255,0.2)' : '#93b8f0' }}>
                  <Plus size={15} />
                </button>
              </motion.div>
            ) : (
              <motion.button key="add" type="button"
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }}
                disabled={isOutOfStock} onClick={() => onAdd()}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: 'none', border: 'none', cursor: isOutOfStock ? 'not-allowed' : 'pointer', color: isOutOfStock ? '#f87171' : '#fff' }}
              >
                <Plus size={20} strokeWidth={2.6} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
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
  const tabsRef = useDragScroll<HTMLDivElement>()
  const subRef = useDragScroll<HTMLDivElement>()

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

  // Telegram-подраздел (авто-выдача): поля покупателя (@username) вводятся ЗДЕСЬ,
  // на экране подраздела, а не на оплате. Берём поля категории, иначе — игры.
  const activeCategory = categories.find(c => c.id === activeCatId)
    ?? categories.flatMap(c => c.children ?? []).find(c => c.id === activeCatId)
  const isTgAuto = !!activeCategory?.auto_engine
  const tgFieldDefs: InputField[] = isTgAuto
    ? ((activeCategory?.input_fields?.length ? activeCategory.input_fields : gameFromApi?.input_fields) ?? [])
    : []
  const [tgFields, setTgFields] = useState<Record<string, string>>({})
  // Сбрасываем введённые поля при смене подраздела.
  useEffect(() => { setTgFields({}) }, [activeCatId])

  const handleAdd = async (product: Product, inputData?: Record<string, string>, qty: number = 1) => {
    const key = product.id
    if (pendingKeys.current.has(key)) return
    pendingKeys.current.add(key)

    setOptimisticDeltas(prev => {
      const next = new Map(prev)
      next.set(key, (next.get(key) ?? 0) + qty)
      return next
    })
    increment()
    haptic.impact('light')

    try {
      await cartApi.addItem({
        product_id: product.id,
        quantity: qty,
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

  // Добавление с учётом Telegram-полей подраздела: валидируем обязательные и
  // прикрепляем @username к позиции корзины (на оплате их уже не спрашиваем).
  const addWithTg = (product: Product, inputData?: Record<string, string>, qty: number = 1) => {
    if (isTgAuto && tgFieldDefs.length) {
      for (const f of tgFieldDefs) {
        if (f.required && !(tgFields[f.key] ?? '').trim()) {
          haptic.error()
          toast.error(`Заполните: ${f.label}`)
          return
        }
      }
      handleAdd(product, { ...tgFields, ...(inputData ?? {}) }, qty)
    } else {
      handleAdd(product, inputData, qty)
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
      <div ref={tabsRef} className="flex gap-2 px-4 pt-3 overflow-x-auto pb-2 no-scrollbar">
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
          <div ref={subRef} className="flex gap-2 px-4 overflow-x-auto pb-2 no-scrollbar">
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

      {/* Описание категории (или общее по игре) */}
      {activeCatId && (() => {
        const activeCat = categories.find(c => c.id === activeCatId)
          ?? categories.flatMap(c => c.children ?? []).find(c => c.id === activeCatId)
        const desc = (activeCat?.description || gameFromApi?.description || '').trim()
        if (!desc) return null
        return (
          <p className="px-4 pt-2 text-sm" style={{ color: 'var(--hint)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
            {desc}
          </p>
        )
      })()}

      {/* Delivery type badge for active category */}
      {activeCatId && (() => {
        const activeCat = categories.find(c => c.id === activeCatId)
          ?? categories.flatMap(c => c.children ?? []).find(c => c.id === activeCatId)
        const dt = activeCat?.delivery_type
        if (!dt || dt === 'mixed') return null
        const isAuto = dt === 'auto'
        return (
          <div className="px-4 pb-1" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isAuto ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
                background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)',
              }}>
                <Zap size={10} fill="#34d399" stroke="none" />Автовыдача
              </span>
            ) : (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20,
                background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <Clock size={10} />Вручную
              </span>
            )}
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
          <div className="space-y-2">
            {isTgAuto && tgFieldDefs.length > 0 && (
              <div style={{
                background: 'var(--bg2)', border: '1px solid rgba(45,88,173,0.3)',
                borderRadius: 16, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b9de8' }}>
                  Данные получателя
                </span>
                {tgFieldDefs.map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--hint)', display: 'block', marginBottom: 4 }}>
                      {f.label}{f.required && <span style={{ color: '#f87171' }}> *</span>}
                    </label>
                    {f.type === 'select' ? (
                      <select
                        value={tgFields[f.key] ?? ''}
                        onChange={(e) => setTgFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                        style={{
                          width: '100%', height: 40, borderRadius: 12, padding: '0 12px',
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                          color: 'var(--text)', fontSize: '0.9rem',
                        }}
                      >
                        <option value="">— выберите —</option>
                        {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        value={tgFields[f.key] ?? ''}
                        onChange={(e) => setTgFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder || ''}
                        style={{
                          width: '100%', height: 40, borderRadius: 12, padding: '0 12px',
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                          color: 'var(--text)', fontSize: '0.9rem',
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
            {products.map(product => (
                <ProductRow
                  key={product.id}
                  product={product}
                  cartQty={cartQtyMap.get(product.id) ?? 0}
                  onAdd={(inputData, qty) => addWithTg(product, inputData, qty)}
                  onRemove={() => handleRemove(product)}
                />
              ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
