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

  useEffect(() => {
    if (product?.lots?.length && !selectedLot) {
      setSelectedLot(product.lots[0])
    }
  }, [product, selectedLot])

  useEffect(() => {
    const handler = () => navigate(-1)
    showBackButton(handler)
    return () => hideBackButton(handler)
  }, [navigate, showBackButton, hideBackButton])

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
  if (!product) return (
    <div className="p-8 text-center" style={{ color: 'var(--hint)' }}>
      Товар не найден
    </div>
  )

  const isOutOfStock = product.stock !== null && product.stock === 0
  const currentPrice = selectedLot ? selectedLot.price : product.price

  return (
    <div className="pb-6 animate-slide-up">
      {/* Изображения */}
      <div className="relative">
        <div
          className="overflow-hidden"
          style={{ aspectRatio: '16/9', background: 'var(--bg2)' }}
        >
          {product.images.length > 0 ? (
            <img
              src={product.images[imgIdx]}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-6xl">🎮</div>
          )}
          {/* Нижний градиент */}
          <div
            className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
            style={{ background: 'linear-gradient(to top, var(--bg), transparent)' }}
          />
        </div>

        {/* Кнопка назад */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-3 left-3 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90"
          style={{
            background: 'rgba(10,10,15,0.6)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <ChevronLeft size={20} color="white" />
        </button>

        {/* Точки навигации */}
        {product.images.length > 1 && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
            {product.images.map((_, i) => (
              <button
                key={i}
                onClick={() => setImgIdx(i)}
                className="rounded-full transition-all duration-200"
                style={{
                  width: i === imgIdx ? 20 : 6,
                  height: 6,
                  background: i === imgIdx
                    ? 'linear-gradient(135deg, #6366f1, #7c3aed)'
                    : 'rgba(255,255,255,0.3)',
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Заголовок */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <h1
              className="text-xl font-bold leading-snug flex-1 tracking-tight"
              style={{ color: 'var(--text)' }}
            >
              {product.name}
            </h1>
            {isOutOfStock && (
              <span className="badge badge-danger flex-shrink-0">Нет</span>
            )}
          </div>

          {/* Рейтинг */}
          {product.avg_rating && (
            <div className="flex items-center gap-1.5 mt-2">
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map(s => (
                  <Star
                    key={s}
                    size={13}
                    fill={s <= Math.round(product.avg_rating!) ? '#f59e0b' : 'none'}
                    stroke={s <= Math.round(product.avg_rating!) ? '#f59e0b' : 'var(--hint)'}
                  />
                ))}
              </div>
              <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {product.avg_rating.toFixed(1)}
              </span>
              <span className="text-xs" style={{ color: 'var(--hint)' }}>
                ({product.reviews_count})
              </span>
            </div>
          )}

          {/* Тип доставки */}
          <div className="flex items-center gap-1.5 mt-2">
            {product.delivery_type === 'auto' ? (
              <span
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{
                  background: 'rgba(34,197,94,0.12)',
                  border: '1px solid rgba(34,197,94,0.25)',
                  color: '#22c55e',
                }}
              >
                <Zap size={12} />
                Мгновенная выдача
              </span>
            ) : (
              <span
                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
                style={{
                  background: 'rgba(148,163,184,0.1)',
                  border: '1px solid var(--border)',
                  color: 'var(--hint)',
                }}
              >
                <Clock size={12} />
                Выдача вручную (до 24ч)
              </span>
            )}
          </div>
        </div>

        {/* Описание */}
        {product.description && (
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--hint)' }}
          >
            {product.description}
          </p>
        )}

        {/* Лоты */}
        {product.lots.length > 0 && (
          <section>
            <h3
              className="text-sm font-bold mb-3"
              style={{ color: 'var(--text)' }}
            >
              Выбери пакет
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {product.lots.map(lot => {
                const isSelected = selectedLot?.id === lot.id
                return (
                  <button
                    key={lot.id}
                    onClick={() => { setSelectedLot(lot); haptic.select() }}
                    className={clsx(
                      'p-3 rounded-2xl text-left transition-all duration-200 active:scale-95',
                    )}
                    style={
                      isSelected
                        ? {
                            background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
                            border: '1.5px solid rgba(99,102,241,0.6)',
                            boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
                            color: '#fff',
                          }
                        : {
                            background: 'var(--bg2)',
                            border: '1.5px solid var(--border)',
                            color: 'var(--text)',
                          }
                    }
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-sm font-semibold leading-tight">{lot.name}</span>
                      {lot.badge && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1 flex-shrink-0"
                          style={
                            isSelected
                              ? { background: 'rgba(255,255,255,0.2)', color: '#fff' }
                              : {
                                  background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                                  color: '#fff',
                                }
                          }
                        >
                          {lot.badge}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5">
                      {lot.original_price && (
                        <span className="text-xs line-through opacity-55 mr-1">
                          {lot.original_price.toLocaleString('ru')} ₽
                        </span>
                      )}
                      <span className="text-base font-bold">
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
            <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>
              Данные для заказа
            </h3>
            <div className="space-y-3">
              {product.input_fields.map((field: InputField) => (
                <div key={field.key}>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--hint)' }}>
                    {field.label}
                    {field.required && (
                      <span style={{ color: 'var(--destructive)' }}> *</span>
                    )}
                  </label>
                  {field.type === 'select' ? (
                    <select
                      className="input"
                      value={inputData[field.key] ?? ''}
                      onChange={e => setInputData(prev => ({ ...prev, [field.key]: e.target.value }))}
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
          <div
            className="p-4 rounded-2xl"
            style={{
              background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.2)',
            }}
          >
            <p className="text-xs font-bold mb-1.5" style={{ color: 'var(--accent)' }}>
              ℹ️ Инструкция
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
              {product.instruction}
            </p>
          </div>
        )}

        {/* Кнопка */}
        <button
          className="btn-primary"
          disabled={!canAdd || adding || isOutOfStock}
          onClick={handleAddToCart}
        >
          {adding ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Добавляем...
            </>
          ) : isOutOfStock ? (
            'Нет в наличии'
          ) : (
            <>
              <ShoppingCart size={18} />
              В корзину · {currentPrice.toLocaleString('ru')} ₽
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function ProductSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="skeleton w-full" style={{ aspectRatio: '16/9' }} />
      <div className="px-4 pt-4 space-y-4">
        <div className="skeleton h-7 w-3/4 rounded-xl" />
        <div className="skeleton h-4 w-1/3 rounded-xl" />
        <div className="skeleton h-4 w-2/3 rounded-xl" />
        <div className="grid grid-cols-2 gap-2">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-2xl" />
          ))}
        </div>
        <div className="skeleton h-12 rounded-xl" />
      </div>
    </div>
  )
}
