// src/pages/GamePage.tsx
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingCart, Check, Zap, Clock, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { catalogApi, cartApi, type Category, type Product, type Lot, type InputField } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'
import { useCartStore } from '@/store'
import PageLoader from '@/components/ui/PageLoader'
import clsx from 'clsx'

// ── Inline LotRow — строка лота с ценой и кнопкой ────────────────────────────

interface LotRowProps {
  lot: Lot
  disabled: boolean
  onAdd: () => void
  adding: boolean
  added: boolean
}

function LotRow({ lot, disabled, onAdd, adding, added }: LotRowProps) {
  const hasDiscount = !!lot.original_price && lot.original_price > lot.price
  const discountPct = hasDiscount
    ? Math.round((1 - lot.price / lot.original_price!) * 100)
    : 0

  return (
    <div
      className="flex items-center gap-2 py-2.5 px-3"
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {/* Lot name + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            {lot.name}
          </span>
          {lot.badge && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                color: '#fff',
              }}
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

      {/* Cart button */}
      <button
        disabled={disabled || adding}
        onClick={onAdd}
        className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-150 active:scale-90"
        style={{
          background: added
            ? 'rgba(16,185,129,0.2)'
            : disabled
              ? 'rgba(239,68,68,0.1)'
              : 'rgba(45,88,173,0.18)',
          border: added
            ? '1px solid rgba(16,185,129,0.4)'
            : disabled
              ? '1px solid rgba(239,68,68,0.2)'
              : '1px solid rgba(45,88,173,0.35)',
          color: added ? '#34d399' : disabled ? '#f87171' : '#6b9de8',
        }}
      >
        <AnimatePresence mode="wait">
          {added ? (
            <motion.span key="ok" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
              <Check size={14} />
            </motion.span>
          ) : adding ? (
            <motion.span key="spin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="w-3.5 h-3.5 rounded-full border-2"
              style={{ borderColor: 'rgba(107,157,232,0.25)', borderTopColor: '#6b9de8', animation: 'spin 0.6s linear infinite' }}
            />
          ) : (
            <motion.span key="cart" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <ShoppingCart size={14} />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </div>
  )
}

// ── ProductSection — товар с его лотами/ценой ────────────────────────────────

interface ProductSectionProps {
  product: Product
  onAddLot: (product: Product, lot: Lot) => Promise<void>
  onAddSimple: (product: Product) => Promise<void>
  addingKey: string | null
  addedKey: string | null
}

function ProductSection({ product, onAddLot, onAddSimple, addingKey, addedKey }: ProductSectionProps) {
  const [expanded, setExpanded] = useState(true)
  const lots = product.lots ?? []
  const inputFields = product.input_fields ?? []
  const isOutOfStock = product.stock !== null && product.stock === 0
  const hasLots = lots.length > 0
  const isAuto = product.delivery_type === 'auto'

  // Input fields state (for products requiring user input)
  const [inputData, setInputData] = useState<Record<string, string>>({})
  const [showInputs, setShowInputs] = useState(false)
  const hasInputs = inputFields.length > 0

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--bg2)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Product header */}
      <button
        className="w-full flex items-center gap-3 p-3.5 text-left transition-colors"
        onClick={() => setExpanded(!expanded)}
        style={{ background: 'transparent' }}
      >
        <div className="flex-1 min-w-0">
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
                style={{ background: 'var(--bg3, rgba(255,255,255,0.05))', color: 'var(--hint)', border: '1px solid var(--border)' }}
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

        {/* Price preview (min) + chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasLots && (
            <span className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>
              от {Math.min(...lots.map(l => l.price)).toLocaleString('ru')} ₽
            </span>
          )}
          {!hasLots && !isOutOfStock && (
            <span className="text-sm font-bold" style={{ color: '#6b9de8' }}>
              {Number(product.price).toLocaleString('ru')} ₽
            </span>
          )}
          <ChevronDown
            size={16}
            style={{
              color: 'var(--hint)',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          />
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            {/* Divider */}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

            {/* Input fields (if any) */}
            {hasInputs && (
              <div className="px-3.5 pt-2.5 pb-1">
                <button
                  className="text-xs font-medium mb-2 flex items-center gap-1"
                  style={{ color: '#6b9de8' }}
                  onClick={(e) => { e.stopPropagation(); setShowInputs(!showInputs) }}
                >
                  Данные для заказа
                  <ChevronDown
                    size={12}
                    style={{
                      transform: showInputs ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}
                  />
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

            {/* Lots list */}
            {hasLots ? (
              <div>
                {lots
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order || a.price - b.price)
                  .map(lot => (
                    <LotRow
                      key={lot.id}
                      lot={lot}
                      disabled={isOutOfStock}
                      onAdd={() => onAddLot(product, lot)}
                      adding={addingKey === `${product.id}:${lot.id}`}
                      added={addedKey === `${product.id}:${lot.id}`}
                    />
                  ))
                }
              </div>
            ) : (
              /* Single product without lots */
              <div className="px-3.5 py-2.5">
                <button
                  disabled={isOutOfStock || addingKey === product.id}
                  onClick={() => onAddSimple(product)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-95"
                  style={{
                    background: addedKey === product.id
                      ? 'rgba(16,185,129,0.2)'
                      : isOutOfStock
                        ? 'rgba(239,68,68,0.1)'
                        : 'rgba(45,88,173,0.18)',
                    border: addedKey === product.id
                      ? '1px solid rgba(16,185,129,0.4)'
                      : isOutOfStock
                        ? '1px solid rgba(239,68,68,0.2)'
                        : '1px solid rgba(45,88,173,0.35)',
                    color: addedKey === product.id ? '#34d399' : isOutOfStock ? '#f87171' : '#6b9de8',
                  }}
                >
                  {addedKey === product.id ? (
                    <><Check size={14} /> Добавлено</>
                  ) : addingKey === product.id ? (
                    <span className="w-4 h-4 rounded-full border-2"
                      style={{ borderColor: 'rgba(107,157,232,0.25)', borderTopColor: '#6b9de8', animation: 'spin 0.6s linear infinite' }} />
                  ) : isOutOfStock ? (
                    'Нет в наличии'
                  ) : (
                    <><ShoppingCart size={14} /> В корзину</>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── GamePage ─────────────────────────────────────────────────────────────────

export default function GamePage() {
  const { slug } = useParams<{ slug: string }>()
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)
  const { haptic } = useTelegram()
  const { increment } = useCartStore()
  const qc = useQueryClient()

  // Adding state: "productId:lotId" or "productId" for simple products
  const [addingKey, setAddingKey] = useState<string | null>(null)
  const [addedKey, setAddedKey] = useState<string | null>(null)

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

  const gameFromApi = games.find(g => g.slug === slug)
  const gameName = gameFromApi?.name ?? slug?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? ''

  const rootCats = (cats: Category[]) => cats.filter(c => !c.parent_id)

  // Add lot to cart
  const handleAddLot = async (product: Product, lot: Lot) => {
    const key = `${product.id}:${lot.id}`
    if (addingKey) return
    setAddingKey(key)
    haptic.impact('medium')
    try {
      await cartApi.addItem({
        product_id: product.id,
        lot_id: lot.id,
        quantity: 1,
        input_data: {},
      })
      increment()
      qc.invalidateQueries({ queryKey: ['cart'] })
      haptic.success()
      toast.success('Добавлено в корзину!')
      setAddedKey(key)
      setTimeout(() => setAddedKey(null), 1800)
    } catch (e: any) {
      haptic.error()
      toast.error(e?.response?.data?.detail ?? 'Ошибка')
    } finally {
      setAddingKey(null)
    }
  }

  // Add simple product (no lots) to cart
  const handleAddSimple = async (product: Product) => {
    if (addingKey) return
    setAddingKey(product.id)
    haptic.impact('medium')
    try {
      await cartApi.addItem({
        product_id: product.id,
        quantity: 1,
        input_data: {},
      })
      increment()
      qc.invalidateQueries({ queryKey: ['cart'] })
      haptic.success()
      toast.success('Добавлено в корзину!')
      setAddedKey(product.id)
      setTimeout(() => setAddedKey(null), 1800)
    } catch (e: any) {
      haptic.error()
      toast.error(e?.response?.data?.detail ?? 'Ошибка')
    } finally {
      setAddingKey(null)
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
      <div
        className="px-4 pt-5 pb-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
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
                  flexShrink: 0,
                  fontSize: '12px',
                  padding: '4px 12px',
                  borderRadius: 999,
                  border: selectedCatId === sub.id
                    ? '1px solid rgba(45,88,173,0.55)'
                    : '1px solid var(--border)',
                  background: selectedCatId === sub.id
                    ? 'rgba(45,88,173,0.22)'
                    : 'var(--bg2)',
                  color: selectedCatId === sub.id
                    ? '#93b8f0'
                    : 'var(--hint)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontWeight: 500,
                  transition: 'all 0.15s',
                  boxShadow: selectedCatId === sub.id ? '0 0 10px rgba(45,88,173,0.2)' : 'none',
                }}
              >
                {sub.name}
              </button>
            ))}
          </div>
        )
      })()}

      {/* Products with lots */}
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
                onAddLot={handleAddLot}
                onAddSimple={handleAddSimple}
                addingKey={addingKey}
                addedKey={addedKey}
              />
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  )
}
