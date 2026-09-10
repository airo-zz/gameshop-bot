/**
 * src/web/pages/WebGamePage.tsx
 * Страница игры на сайте: табы категорий + сетка товаров с добавлением в корзину.
 * Покупка требует авторизации (Telegram Login Widget). Оформление — на /checkout.
 */

import { useMemo, useState } from 'react'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Zap, Clock, Plus, Minus, ShoppingCart } from 'lucide-react'
import toast from 'react-hot-toast'
import { catalogApi } from '@/api'
import type { Category, Product, InputField } from '@/api'
import { useWebAuth } from '@/web/auth/useWebAuth'
import { useWebCart } from '@/web/cart/useWebCart'

function money(v: number) {
  return Number(v).toLocaleString('ru-RU') + ' ₽'
}

// ── Карточка товара ───────────────────────────────────────────────────────────

interface ProductCardProps {
  product: Product
  qty: number
  isAuthenticated: boolean
  onAdd: (product: Product, inputData?: Record<string, string>) => void
  onDec: (product: Product) => void
  onRequireLogin: () => void
}

function ProductCard({ product, qty, isAuthenticated, onAdd, onDec, onRequireLogin }: ProductCardProps) {
  const hasDiscount = !!product.original_price && Number(product.original_price) > Number(product.price)
  const discountPct = hasDiscount
    ? Math.round((1 - Number(product.price) / Number(product.original_price!)) * 100)
    : 0
  const outOfStock = product.is_out_of_stock || (product.stock !== null && product.stock === 0)
  const inputFields: InputField[] = product.input_fields ?? []
  const hasInputs = inputFields.length > 0

  const [inputData, setInputData] = useState<Record<string, string>>({})
  const [showInputs, setShowInputs] = useState(false)

  const missingRequired = inputFields.some((f) => f.required && !(inputData[f.key] ?? '').trim())

  function handleBuy() {
    if (!isAuthenticated) { onRequireLogin(); return }
    if (hasInputs && !showInputs && qty === 0) { setShowInputs(true); return }
    if (missingRequired) { toast.error('Заполните обязательные поля'); return }
    onAdd(product, hasInputs ? inputData : undefined)
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <h3 className={'text-sm font-medium flex-1 ' + (outOfStock ? 'text-white/35' : 'text-white')}>
          {product.name}
        </h3>
        {product.badge && !outOfStock && (
          <span className="shrink-0 text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>
            {product.badge}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        {hasDiscount && <span className="text-xs text-white/30 line-through">{money(product.original_price!)}</span>}
        <span className={'text-lg font-bold ' + (outOfStock ? 'text-white/25' : '')} style={outOfStock ? {} : { color: 'var(--link)' }}>
          {money(product.price)}
        </span>
        {hasDiscount && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.18)', color: '#34d399' }}>
            −{discountPct}%
          </span>
        )}
      </div>

      {/* Поля от покупателя */}
      {hasInputs && showInputs && !outOfStock && (
        <div className="flex flex-col gap-2">
          {inputFields.map((field) => (
            <div key={field.key}>
              <label className="block text-[11px] text-white/45 mb-1">
                {field.label}{field.required && <span className="text-amber-400"> *</span>}
              </label>
              {field.type === 'select' ? (
                <select
                  value={inputData[field.key] ?? ''}
                  onChange={(e) => setInputData((p) => ({ ...p, [field.key]: e.target.value }))}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-white/20"
                >
                  <option value="">Выберите...</option>
                  {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={inputData[field.key] ?? ''}
                  onChange={(e) => setInputData((p) => ({ ...p, [field.key]: e.target.value }))}
                  placeholder={field.placeholder ?? field.label}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Действие */}
      <div className="mt-auto">
        {outOfStock ? (
          <div className="text-xs text-center py-2.5 rounded-xl bg-white/[0.03] text-white/40 border border-white/[0.06]">
            Нет в наличии
          </div>
        ) : qty > 0 ? (
          <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-2 py-1.5">
            <button onClick={() => onDec(product)} className="p-1.5 rounded-lg text-white/70 hover:bg-white/[0.06]" aria-label="Убрать">
              <Minus size={16} />
            </button>
            <span className="text-sm font-bold text-white">{qty}</span>
            <button onClick={() => onAdd(product, hasInputs ? inputData : undefined)} className="p-1.5 rounded-lg text-white/70 hover:bg-white/[0.06]" aria-label="Добавить">
              <Plus size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleBuy}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] hover:brightness-110"
            style={{ background: 'var(--gradient-primary)' }}
          >
            <ShoppingCart size={15} />
            {hasInputs && !showInputs ? 'Купить' : 'В корзину'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Страница ──────────────────────────────────────────────────────────────────

export default function WebGamePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [activeCatId, setActiveCatId] = useState<string | null>(null)

  const { isAuthenticated } = useWebAuth()
  const { cart, qtyByProduct, add, setQty } = useWebCart()

  const { data: games = [] } = useQuery({
    queryKey: ['web', 'games', 'all'],
    queryFn: () => catalogApi.getGames(),
    staleTime: 5 * 60_000,
  })

  const { data: categories = [], isLoading: catsLoading, isError: catsError } = useQuery({
    queryKey: ['web', 'categories', slug],
    queryFn: () => catalogApi.getCategories(slug!),
    enabled: !!slug,
    staleTime: 5 * 60_000,
  })

  const rootCats = useMemo(() => categories.filter((c: Category) => !c.parent_id), [categories])
  const currentCatId = activeCatId ?? rootCats[0]?.id ?? null
  const currentCat =
    categories.find((c) => c.id === currentCatId) ??
    categories.flatMap((c) => c.children ?? []).find((c) => c.id === currentCatId)

  const { data: products = [], isLoading: prodLoading } = useQuery({
    queryKey: ['web', 'products', currentCatId],
    queryFn: () => catalogApi.getProducts(currentCatId!),
    enabled: !!currentCatId,
    staleTime: 2 * 60_000,
  })

  const game = games.find((g) => g.slug === slug)
  const gameName = game?.name ?? slug?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? ''

  const requireLogin = () => navigate('/login', { state: { from: location.pathname } })

  const handleAdd = async (product: Product, inputData?: Record<string, string>) => {
    try {
      await add(product.id, inputData)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Не удалось добавить')
    }
  }

  const handleDec = async (product: Product) => {
    const item = cart?.items.find((i) => i.product_id === product.id)
    if (!item) return
    try {
      await setQty(item.id, item.quantity - 1)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Ошибка')
    }
  }

  return (
    <div className="web-container py-8 md:py-12">
      <Link to="/catalog" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors mb-6">
        <ChevronLeft size={16} />
        Каталог
      </Link>

      <div className="flex items-center gap-4 mb-8">
        {game?.image_url && (
          <img src={game.image_url} alt={gameName} className="w-16 h-16 rounded-2xl object-cover border border-white/10" />
        )}
        <h1 className="text-2xl md:text-4xl font-extrabold text-white">{gameName}</h1>
      </div>

      {catsError ? (
        <p className="text-sm text-white/40 py-16 text-center">Не удалось загрузить категории</p>
      ) : catsLoading ? (
        <p className="text-sm text-white/40 py-16 text-center">Загрузка...</p>
      ) : rootCats.length === 0 ? (
        <p className="text-sm text-white/40 py-16 text-center">Категории скоро появятся</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {rootCats.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCatId(cat.id)}
                className={
                  'px-4 py-2 rounded-xl text-sm font-medium transition-all ' +
                  (currentCatId === cat.id ? 'text-white' : 'text-white/55 bg-white/[0.03] border border-white/[0.06] hover:text-white/80')
                }
                style={currentCatId === cat.id ? { background: 'rgba(45,88,173,0.22)', border: '1px solid rgba(45,88,173,0.5)' } : {}}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {currentCat && rootCats.find((c) => c.id === currentCat.id)?.children?.length ? (
            <div className="flex flex-wrap gap-2 mb-4">
              {rootCats.find((c) => c.id === currentCat.id)!.children.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setActiveCatId(sub.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/55 bg-white/[0.03] border border-white/[0.06] hover:text-white/80 transition-all"
                >
                  {sub.name}
                </button>
              ))}
            </div>
          ) : null}

          {currentCat?.delivery_type && currentCat.delivery_type !== 'mixed' && (
            <div className="mb-5">
              {currentCat.delivery_type === 'auto' ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)' }}>
                  <Zap size={11} fill="#34d399" stroke="none" /> Автовыдача
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full text-white/45 bg-white/[0.04] border border-white/[0.08]">
                  <Clock size={11} /> Вручную
                </span>
              )}
            </div>
          )}

          {prodLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-40 rounded-2xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <p className="text-sm text-white/40 py-16 text-center">Товары скоро появятся</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  qty={qtyByProduct.get(p.id) ?? 0}
                  isAuthenticated={isAuthenticated}
                  onAdd={handleAdd}
                  onDec={handleDec}
                  onRequireLogin={requireLogin}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
