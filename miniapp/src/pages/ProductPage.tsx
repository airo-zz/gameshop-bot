// src/pages/ProductPage.tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ShoppingCart, Star, Zap, Clock, ChevronLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { catalogApi, cartApi, type Lot, type InputField } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'
import { useCartStore } from '@/store'
import clsx from 'clsx'

export default function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showMainButton, hideMainButton, haptic, showBackButton, hideBackButton } = useTelegram()
  const { increment } = useCartStore()

  const [selectedLot, setSelectedLot] = useState<Lot | null>(null)
  const [inputData, setInputData] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState(false)
  const [imgIdx, setImgIdx] = useState(0)

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => catalogApi.getProduct(id!),
    enabled: !!id,
  })

  // Авто-выбор первого лота
  useEffect(() => {
    if (product?.lots?.length && !selectedLot) {
      setSelectedLot(product.lots[0])
    }
  }, [product, selectedLot])

  // Telegram Back Button
  useEffect(() => {
    const handler = () => navigate(-1)
    showBackButton(handler)
    return () => hideBackButton(handler)
  }, [navigate, showBackButton, hideBackButton])

  // Telegram Main Button — «В корзину»
  const canAdd = !!(
    product &&
    product.stock !== 0 &&
    (product.lots.length === 0 || selectedLot) &&
    product.input_fields.every(f => !f.required || inputData[f.key])
  )

  useEffect(() => {
    if (!product) return
    const handler = () => handleAddToCart()
    if (canAdd) {
      const price = selectedLot ? selectedLot.price : product.price
      showMainButton(`Добавить в корзину · ${price.toLocaleString('ru')} ₽`, handler)
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
      haptic.success()
      toast.success('Добавлено в корзину!')
    } catch (e: any) {
      haptic.error()
      toast.error(e?.response?.data?.detail ?? 'Ошибка')
    } finally {
      setAdding(false)
    }
  }

  if (isLoading) return <ProductSkeleton />
  if (!product)  return <div className="p-8 text-center" style={{ color: 'var(--hint)' }}>Товар не найден</div>

  const isOutOfStock = product.stock !== null && product.stock === 0
  const currentPrice = selectedLot ? selectedLot.price : product.price

  return (
    <div className="pb-6 animate-slide-up">
      {/* Изображения */}
      <div className="relative">
        <div className="aspect-video overflow-hidden bg-black/5">
          {product.images.length > 0 ? (
            <img
              src={product.images[imgIdx]}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-6xl">🎮</div>
          )}
        </div>

        {/* Стрелка назад (fallback если нет кнопки Telegram) */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-3 left-3 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.4)' }}
        >
          <ChevronLeft size={20} color="white" />
        </button>

        {/* Точки навигации по фото */}
        {product.images.length > 1 && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
            {product.images.map((_, i) => (
              <button
                key={i}
                onClick={() => setImgIdx(i)}
                className="w-2 h-2 rounded-full transition-all"
                style={{ background: i === imgIdx ? 'white' : 'rgba(255,255,255,0.4)' }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Заголовок */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl font-bold leading-snug flex-1" style={{ color: 'var(--text)' }}>
              {product.name}
            </h1>
            {isOutOfStock && (
              <span className="badge badge-danger flex-shrink-0">Нет</span>
            )}
          </div>

          {/* Рейтинг */}
          {product.avg_rating && (
            <div className="flex items-center gap-1 mt-1">
              <Star size={14} fill="#f59e0b" stroke="#f59e0b" />
              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                {product.avg_rating.toFixed(1)}
              </span>
              <span className="text-xs" style={{ color: 'var(--hint)' }}>
                ({product.reviews_count} отзывов)
              </span>
            </div>
          )}

          {/* Тип доставки */}
          <div className="flex items-center gap-1.5 mt-2">
            {product.delivery_type === 'auto'
              ? <><Zap size={14} style={{ color: 'var(--btn)' }} /><span className="text-xs font-medium" style={{ color: 'var(--btn)' }}>Мгновенная выдача</span></>
              : <><Clock size={14} style={{ color: 'var(--hint)' }} /><span className="text-xs" style={{ color: 'var(--hint)' }}>Выдача вручную (до 24ч)</span></>
            }
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
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>
              Выбери пакет
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {product.lots.map(lot => (
                <button
                  key={lot.id}
                  onClick={() => { setSelectedLot(lot); haptic.select() }}
                  className={clsx(
                    'p-3 rounded-2xl text-left transition-all duration-150 active:scale-95',
                    'border-2',
                  )}
                  style={{
                    background: selectedLot?.id === lot.id ? 'var(--btn)' : 'var(--bg2)',
                    borderColor: selectedLot?.id === lot.id ? 'var(--btn)' : 'transparent',
                    color: selectedLot?.id === lot.id ? 'var(--btn-text)' : 'var(--text)',
                  }}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-sm font-semibold leading-tight">{lot.name}</span>
                    {lot.badge && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1 flex-shrink-0"
                        style={{
                          background: selectedLot?.id === lot.id ? 'rgba(255,255,255,0.25)' : 'var(--btn)',
                          color: selectedLot?.id === lot.id ? 'white' : 'var(--btn-text)',
                        }}
                      >
                        {lot.badge}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5">
                    {lot.original_price && (
                      <span className="text-xs line-through opacity-60 mr-1">
                        {lot.original_price.toLocaleString('ru')} ₽
                      </span>
                    )}
                    <span className="text-base font-bold">
                      {lot.price.toLocaleString('ru')} ₽
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Поля ввода от пользователя */}
        {product.input_fields.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>
              Данные для заказа
            </h3>
            <div className="space-y-2">
              {product.input_fields.map((field: InputField) => (
                <div key={field.key}>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--hint)' }}>
                    {field.label}{field.required && <span style={{ color: 'var(--destructive)' }}>*</span>}
                  </label>
                  {field.type === 'select' ? (
                    <select
                      className="input"
                      value={inputData[field.key] ?? ''}
                      onChange={e => setInputData(prev => ({ ...prev, [field.key]: e.target.value }))}
                      style={{ background: 'var(--bg2)', color: 'var(--text)' }}
                    >
                      <option value="">Выбери...</option>
                      {field.options?.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
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
          <div className="p-3 rounded-2xl" style={{ background: 'var(--bg2)' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--hint)' }}>ℹ️ Инструкция</p>
            <p className="text-sm" style={{ color: 'var(--text)' }}>{product.instruction}</p>
          </div>
        )}

        {/* Кнопка (fallback без Telegram MainButton) */}
        <button
          className="btn-primary"
          disabled={!canAdd || adding || isOutOfStock}
          onClick={handleAddToCart}
        >
          {adding
            ? 'Добавляем...'
            : isOutOfStock
            ? '😔 Нет в наличии'
            : `В корзину · ${currentPrice.toLocaleString('ru')} ₽`
          }
        </button>
      </div>
    </div>
  )
}

function ProductSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="skeleton aspect-video w-full" />
      <div className="px-4 pt-4 space-y-3">
        <div className="skeleton h-7 w-3/4 rounded-xl" />
        <div className="skeleton h-4 w-1/2 rounded-xl" />
        <div className="grid grid-cols-2 gap-2">
          {Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
        </div>
      </div>
    </div>
  )
}
