// src/pages/ProductPage.tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ShoppingCart, Star, Zap, Clock, ChevronLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { catalogApi, cartApi, type Lot, type InputField } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'
import { useCartStore, useHistoryStore } from '@/store'
import PageLoader from '@/components/ui/PageLoader'

export default function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showMainButton, hideMainButton, haptic, showBackButton, hideBackButton } = useTelegram()
  const { increment } = useCartStore()
  const { addRecentlyViewed } = useHistoryStore()
  const queryClient = useQueryClient()

  const [selectedLot, setSelectedLot] = useState<Lot | null>(null)
  const [inputData, setInputData] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState(false)
  const [imgIdx, setImgIdx] = useState(0)

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => catalogApi.getProduct(id!),
    enabled: !!id,
  })

  useEffect(() => {
    if (product?.lots?.length && !selectedLot) {
      setSelectedLot(product.lots[0])
    }
  }, [product, selectedLot])

  // Фиксируем просмотр товара в историю
  useEffect(() => {
    if (product) {
      addRecentlyViewed(product)
    }
  }, [product?.id])

  useEffect(() => {
    const handler = () => navigate(-1)
    showBackButton(handler)
    return () => hideBackButton(handler)
  }, [navigate, showBackButton, hideBackButton])

  const canAdd = !!(
    product &&
    product.stock !== 0 &&
    (product.lots.length === 0 || selectedLot)
  )

  useEffect(() => {
    if (!product) return
    const handler = () => handleAddToCart()
    if (canAdd) {
      const price = selectedLot ? selectedLot.price : product.price
      showMainButton(`В корзину · ${price.toLocaleString('ru')} ₽`, handler)
    }
    return () => hideMainButton(handler)
  }, [product, selectedLot, canAdd, inputData])

  const handleAddToCart = async () => {
    if (!product || adding) return
    setAdding(true)
    haptic.impact('medium')
    try {
      await cartApi.addItem({
        product_id: product.id,
        lot_id: selectedLot?.id,
        quantity: 1,
        input_data: inputData,
      })
      increment()
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      haptic.success()
      toast.success('Добавлено в корзину!')
    } catch (e: any) {
      haptic.error()
      toast.error(e?.response?.data?.detail ?? 'Ошибка')
    } finally {
      setAdding(false)
    }
  }

  if (isLoading) return <PageLoader />
  if (!product) return (
    <div className="p-8 text-center" style={{ color: 'var(--hint)' }}>Товар не найден</div>
  )

  const isOutOfStock = product.stock !== null && product.stock === 0
  const currentPrice = selectedLot ? selectedLot.price : product.price

  return (
    <motion.div
      className="pb-8"
      initial={{ opacity: 0, filter: 'blur(6px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* Изображения */}
      <div className="relative">
        <div className="aspect-[4/3] overflow-hidden" style={{ background: 'var(--bg3)' }}>
          {product.images.length > 0 ? (
            <img src={product.images[imgIdx]} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-7xl">🎮</div>
          )}
        </div>

        {/* Назад */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-3 left-3 w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
          style={{ background: 'rgba(10,15,30,0.7)', backdropFilter: 'blur(8px)' }}
        >
          <ChevronLeft size={20} color="white" />
        </button>

        {/* Точки */}
        {product.images.length > 1 && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
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
        {/* Заголовок */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl font-extrabold leading-snug flex-1" style={{ color: 'var(--text)' }}>
              {product.name}
            </h1>
            {isOutOfStock && <span className="badge badge-danger flex-shrink-0">Нет</span>}
          </div>

          {product.avg_rating && (
            <div className="flex items-center gap-1 mt-1.5">
              <Star size={13} fill="#f59e0b" stroke="#f59e0b" />
              <span className="text-sm font-semibold" style={{ color: '#fbbf24' }}>
                {product.avg_rating.toFixed(1)}
              </span>
              <span className="text-xs" style={{ color: 'var(--hint)' }}>
                ({product.reviews_count} отзывов)
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 mt-2">
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
                Вручную (до 24ч)
              </span>
            )}
          </div>
        </div>

        {/* Описание */}
        {product.description && (
          <p className="text-sm leading-relaxed" style={{ color: 'var(--hint)' }}>
            {product.description}
          </p>
        )}

        {/* Лоты */}
        {product.lots.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--hint)' }}>
              Выбери пакет
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {product.lots.map(lot => {
                const isSelected = selectedLot?.id === lot.id
                return (
                  <button
                    key={lot.id}
                    onClick={() => { setSelectedLot(lot); haptic.select() }}
                    className="p-3 rounded-2xl text-left transition-all duration-150 active:scale-95"
                    style={{
                      background: isSelected
                        ? 'linear-gradient(135deg, rgba(45,88,173,0.32), rgba(45,88,173,0.3))'
                        : 'var(--bg2)',
                      border: isSelected
                        ? '1.5px solid rgba(45,88,173,0.65)'
                        : '1.5px solid var(--border)',
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-sm font-semibold leading-tight" style={{ color: 'var(--text)' }}>
                        {lot.name}
                      </span>
                      {lot.badge && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1 flex-shrink-0"
                          style={{
                            background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                            color: '#fff',
                          }}
                        >
                          {lot.badge}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5">
                      {lot.original_price && (
                        <span className="text-xs line-through mr-1" style={{ color: 'var(--hint)' }}>
                          {lot.original_price.toLocaleString('ru')} ₽
                        </span>
                      )}
                      <span className="text-base font-bold" style={{ color: '#6b9de8' }}>
                        {lot.price.toLocaleString('ru')} ₽
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Поля ввода */}
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

        {/* Инструкция */}
        {product.instruction && (
          <div
            className="p-4 rounded-2xl"
            style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            <p className="text-xs font-semibold mb-1.5" style={{ color: '#93b8f0' }}>ℹ️ Инструкция</p>
            <p className="text-sm" style={{ color: 'var(--hint)' }}>{product.instruction}</p>
          </div>
        )}

        {/* Кнопка */}
        <button
          className="btn-primary gap-2"
          disabled={!canAdd || adding || isOutOfStock}
          onClick={handleAddToCart}
        >
          {adding ? (
            '⏳ Добавляем...'
          ) : isOutOfStock ? (
            '😔 Нет в наличии'
          ) : (
            <>
              <ShoppingCart size={18} />
              В корзину · {currentPrice.toLocaleString('ru')} ₽
            </>
          )}
        </button>
      </div>
    </motion.div>
  )
}
