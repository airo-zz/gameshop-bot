// src/pages/ProductPage.tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingCart, Zap, Clock, ChevronLeft, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { catalogApi, cartApi, type Lot, type InputField } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'
import { useCartStore, useHistoryStore } from '@/store'
import PageLoader from '@/components/ui/PageLoader'
import ImageWithSkeleton from '@/components/ui/ImageWithSkeleton'

// ── LotCard — карточка одного лота с кнопкой "В корзину" ─────────────────────

interface LotCardProps {
  lot: Lot
  isOutOfStock: boolean
  inputData: Record<string, string>
  inputFields: InputField[]
  onAdd: (lot: Lot) => Promise<void>
  adding: string | null   // id лота который сейчас добавляется
  added: string | null    // id лота который только что добавили (для анимации)
}

function LotCard({ lot, isOutOfStock, inputData, inputFields, onAdd, adding, added }: LotCardProps) {
  const isAdding = adding === lot.id
  const isAdded = added === lot.id
  const hasDiscount = !!lot.original_price && lot.original_price > lot.price
  const discountPct = hasDiscount
    ? Math.round((1 - lot.price / lot.original_price!) * 100)
    : 0

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--bg2)',
        border: isAdded
          ? '1.5px solid rgba(16,185,129,0.55)'
          : '1.5px solid var(--border)',
        transition: 'border-color 0.25s',
      }}
    >
      <div className="p-3.5 flex items-center gap-3">
        {/* Левая часть — название и цены */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold leading-snug" style={{ color: 'var(--text)' }}>
              {lot.name}
            </span>
            {lot.badge && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
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
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{ background: 'rgba(16,185,129,0.18)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}
              >
                -{discountPct}%
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-extrabold" style={{ color: '#6b9de8' }}>
              {Number(lot.price).toLocaleString('ru')} ₽
            </span>
            {hasDiscount && (
              <span className="text-xs line-through" style={{ color: 'var(--hint)' }}>
                {Number(lot.original_price).toLocaleString('ru')} ₽
              </span>
            )}
          </div>
        </div>

        {/* Правая часть — кнопка */}
        <button
          disabled={isOutOfStock || isAdding}
          onClick={() => onAdd(lot)}
          className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold text-sm transition-all duration-150 active:scale-90"
          style={{
            background: isAdded
              ? 'rgba(16,185,129,0.2)'
              : isOutOfStock
                ? 'rgba(239,68,68,0.1)'
                : 'rgba(45,88,173,0.22)',
            border: isAdded
              ? '1px solid rgba(16,185,129,0.4)'
              : isOutOfStock
                ? '1px solid rgba(239,68,68,0.25)'
                : '1px solid rgba(45,88,173,0.45)',
            color: isAdded
              ? '#34d399'
              : isOutOfStock
                ? '#f87171'
                : '#6b9de8',
            minWidth: 48,
            minHeight: 36,
            justifyContent: 'center',
          }}
        >
          <AnimatePresence mode="wait">
            {isAdded ? (
              <motion.span
                key="check"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <Check size={16} />
              </motion.span>
            ) : isAdding ? (
              <motion.span
                key="spinner"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-4 h-4 rounded-full border-2"
                style={{
                  borderColor: 'rgba(107,157,232,0.25)',
                  borderTopColor: '#6b9de8',
                  animation: 'spin 0.6s linear infinite',
                }}
              />
            ) : isOutOfStock ? (
              <motion.span key="no" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>Нет</motion.span>
            ) : (
              <motion.span key="cart" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <ShoppingCart size={15} />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.div>
  )
}

// ── ProductPage ───────────────────────────────────────────────────────────────

export default function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { haptic, showBackButton, hideBackButton } = useTelegram()
  const { increment } = useCartStore()
  const { addRecentlyViewed } = useHistoryStore()
  const queryClient = useQueryClient()

  const [inputData, setInputData] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState<string | null>(null)   // lot.id который добавляется
  const [added, setAdded] = useState<string | null>(null)     // lot.id для анимации "добавлено"
  const [imgIdx, setImgIdx] = useState(0)

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => catalogApi.getProduct(id!),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  })

  // Фиксируем просмотр
  useEffect(() => {
    if (product) addRecentlyViewed(product)
  }, [product?.id])

  useEffect(() => {
    const handler = () => navigate(-1)
    showBackButton(handler)
    return () => hideBackButton(handler)
  }, [navigate, showBackButton, hideBackButton])

  // Добавление конкретного лота (или товара без лотов) в корзину
  const handleAddLot = async (lot: Lot) => {
    if (!product || adding) return
    setAdding(lot.id)
    haptic.impact('medium')
    try {
      await cartApi.addItem({
        product_id: product.id,
        lot_id: lot.id,
        quantity: 1,
        input_data: inputData,
      })
      increment()
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      haptic.success()
      toast.success('Добавлено в корзину!')
      setAdded(lot.id)
      setTimeout(() => setAdded(null), 1800)
    } catch (e: any) {
      haptic.error()
      toast.error(e?.response?.data?.detail ?? 'Ошибка')
    } finally {
      setAdding(null)
    }
  }

  // Добавление товара без лотов (один вариант)
  const handleAddSimple = async () => {
    if (!product || adding) return
    const syntheticId = 'simple'
    setAdding(syntheticId)
    haptic.impact('medium')
    try {
      await cartApi.addItem({
        product_id: product.id,
        lot_id: undefined,
        quantity: 1,
        input_data: inputData,
      })
      increment()
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      haptic.success()
      toast.success('Добавлено в корзину!')
      setAdded(syntheticId)
      setTimeout(() => setAdded(null), 1800)
    } catch (e: any) {
      haptic.error()
      toast.error(e?.response?.data?.detail ?? 'Ошибка')
    } finally {
      setAdding(null)
    }
  }

  if (isLoading) return <PageLoader />
  if (!product) return (
    <div className="p-8 text-center" style={{ color: 'var(--hint)' }}>Товар не найден</div>
  )

  const isOutOfStock = product.stock !== null && product.stock === 0
  const hasLots = product.lots.length > 0

  return (
    <motion.div
      className="pb-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {/* ── Галерея ───────────────────────────────────────────────────────── */}
      <div className="relative">
        <div className="aspect-[4/3] overflow-hidden" style={{ background: 'var(--bg3)' }}>
          {product.images.length > 0 ? (
            <ImageWithSkeleton
              src={product.images[imgIdx]}
              alt={product.name}
              aspectRatio="4 / 3"
              objectFit="cover"
              loading="eager"
              style={{ width: '100%' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-7xl">🎮</div>
          )}
        </div>

        {/* Назад */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-3 left-3 w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90 z-10"
          style={{ background: 'rgba(10,15,30,0.7)', backdropFilter: 'blur(8px)' }}
        >
          <ChevronLeft size={20} color="white" />
        </button>

        {/* Индикаторы слайдера */}
        {product.images.length > 1 && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
            {product.images.map((_, i) => (
              <button
                key={i}
                onClick={() => setImgIdx(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === imgIdx ? 20 : 6,
                  height: 6,
                  background: i === imgIdx ? '#2d58ad' : 'rgba(255,255,255,0.3)',
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pt-4 space-y-5">

        {/* ── Заголовок ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl font-extrabold leading-snug flex-1" style={{ color: 'var(--text)' }}>
              {product.name}
            </h1>
            {isOutOfStock && (
              <span
                className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                Нет в наличии
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {product.delivery_type === 'auto' ? (
              <span
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}
              >
                <Zap size={12} fill="#34d399" stroke="none" />
                Мгновенная выдача
              </span>
            ) : (
              <span
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                style={{ background: 'var(--bg2)', color: 'var(--hint)', border: '1px solid var(--border)' }}
              >
                <Clock size={12} />
                Вручную · до 24ч
              </span>
            )}

            {!hasLots && !isOutOfStock && (
              <span className="text-base font-extrabold" style={{ color: '#6b9de8' }}>
                {Number(product.price).toLocaleString('ru')} ₽
              </span>
            )}
          </div>
        </div>

        {/* ── Описание ──────────────────────────────────────────────────── */}
        {product.description && (
          <p className="text-sm leading-relaxed" style={{ color: 'var(--hint)' }}>
            {product.description}
          </p>
        )}

        {/* ── Поля ввода (показываем ДО лотов, чтобы данные были заполнены) */}
        {product.input_fields.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--hint)' }}>
              Данные для заказа
            </h3>
            <div className="space-y-2">
              {product.input_fields.map((field: InputField) => (
                <div key={field.key}>
                  <label className="text-xs mb-1.5 block font-medium" style={{ color: 'var(--hint)' }}>
                    {field.label}
                  </label>
                  {field.type === 'select' ? (
                    <select
                      className="input"
                      value={inputData[field.key] ?? ''}
                      onChange={e => setInputData(prev => ({ ...prev, [field.key]: e.target.value }))}
                    >
                      <option value="">Выбери...</option>
                      {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : 'text'}
                      className="input"
                      placeholder={field.placeholder ?? `Введи ${field.label.toLowerCase()}`}
                      value={inputData[field.key] ?? ''}
                      onChange={e => setInputData(prev => ({ ...prev, [field.key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Лоты — каждый с кнопкой В корзину ────────────────────────── */}
        {hasLots && (
          <section>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--hint)' }}>
              Выбери пакет
            </h3>
            <div className="space-y-2">
              {product.lots
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order || a.price - b.price)
                .map((lot, i) => (
                  <motion.div
                    key={lot.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.2 }}
                  >
                    <LotCard
                      lot={lot}
                      isOutOfStock={isOutOfStock}
                      inputData={inputData}
                      inputFields={product.input_fields}
                      onAdd={handleAddLot}
                      adding={adding}
                      added={added}
                    />
                  </motion.div>
                ))}
            </div>
          </section>
        )}

        {/* ── Товар без лотов — единственная кнопка ─────────────────────── */}
        {!hasLots && (
          <button
            className="btn-primary gap-2"
            disabled={isOutOfStock || !!adding}
            onClick={handleAddSimple}
          >
            <AnimatePresence mode="wait">
              {added === 'simple' ? (
                <motion.span key="ok" className="flex items-center gap-2"
                  initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}>
                  <Check size={18} /> Добавлено!
                </motion.span>
              ) : adding === 'simple' ? (
                <motion.span key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  Добавляем...
                </motion.span>
              ) : isOutOfStock ? (
                <motion.span key="no" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  Нет в наличии
                </motion.span>
              ) : (
                <motion.span key="add" className="flex items-center gap-2"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <ShoppingCart size={18} />
                  В корзину · {Number(product.price).toLocaleString('ru')} ₽
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        )}

        {/* ── Инструкция ────────────────────────────────────────────────── */}
        {product.instruction && (
          <div
            className="p-4 rounded-2xl"
            style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            <p className="text-xs font-semibold mb-1.5" style={{ color: '#93b8f0' }}>ℹ️ Инструкция</p>
            <p className="text-sm" style={{ color: 'var(--hint)' }}>{product.instruction}</p>
          </div>
        )}

      </div>
    </motion.div>
  )
}
