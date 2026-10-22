/**
 * src/web/pages/WebGamePage.tsx
 * Страница игры на сайте: табы категорий + сетка товаров с добавлением в корзину.
 * Покупка требует авторизации (Telegram Login Widget). Оформление — на /checkout.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Zap, Clock, Plus, Minus, ShoppingCart, MessageSquarePlus } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { catalogApi } from '@/api'
import type { Category, Product, InputField } from '@/api'
import { useWebAuth } from '@/web/auth/useWebAuth'
import { useWebCart } from '@/web/cart/useWebCart'
import { money } from '@/web/format'
import { MINIAPP_URL } from '@/config/appTarget'

// ── Карточка товара ───────────────────────────────────────────────────────────

interface ProductCardProps {
  product: Product
  qty: number
  isAuthenticated: boolean
  onAdd: (product: Product, inputData?: Record<string, string>) => void
  onDec: (product: Product) => void
  onRequireLogin: () => void
  singleAdd?: boolean // Telegram Premium — максимум 1 шт
}

function ProductCard({ product, qty, isAuthenticated, onAdd, onDec, onRequireLogin, singleAdd }: ProductCardProps) {
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
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg2)] p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <h3 className={'text-sm font-medium flex-1 ' + (outOfStock ? 'text-[var(--hint)]' : 'text-[var(--text)]')}>
          {product.name}
        </h3>
        {product.badge && !outOfStock && (
          <span className="shrink-0 text-[10px] font-semibold text-[var(--text)] px-1.5 py-0.5 rounded-full" style={{ background: '#EF4444' }}>
            {product.badge}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        {hasDiscount && <span className="text-xs text-[var(--hint)] line-through">{money(product.original_price!)}</span>}
        <span className={'text-lg font-bold ' + (outOfStock ? 'text-[var(--hint)]' : '')} style={outOfStock ? {} : { color: 'var(--link)' }}>
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
              <label className="block text-[11px] text-[var(--hint)] mb-1">
                {field.label}{field.required && <span className="text-amber-400"> *</span>}
              </label>
              {field.type === 'select' ? (
                <select
                  value={inputData[field.key] ?? ''}
                  onChange={(e) => setInputData((p) => ({ ...p, [field.key]: e.target.value }))}
                  className="w-full bg-[var(--bg3)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--border)]"
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
                  className="w-full bg-[var(--bg3)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none focus:border-[var(--border)]"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Действие */}
      <div className="mt-auto">
        {outOfStock ? (
          <div className="text-xs text-center py-2.5 rounded-xl bg-[var(--bg2)] text-[var(--hint)] border border-[var(--border)]">
            Нет в наличии
          </div>
        ) : qty > 0 ? (
          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg2)] px-2 py-1.5">
            <button onClick={() => onDec(product)} className="p-1.5 rounded-lg text-[var(--text-2)] hover:bg-[var(--bg3)]" aria-label="Убрать">
              <Minus size={16} />
            </button>
            <span className="text-sm font-semibold text-[var(--text)]">{qty}</span>
            <button
              onClick={() => onAdd(product, hasInputs ? inputData : undefined)}
              disabled={singleAdd}
              className="p-1.5 rounded-lg text-[var(--text-2)] hover:bg-[var(--bg3)] disabled:opacity-25 disabled:hover:bg-transparent"
              aria-label="Добавить"
            >
              <Plus size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleBuy}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-[var(--text)] transition-all active:scale-[0.97] hover:brightness-110"
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

  // Telegram-подраздел (Stars/Premium, автовыдача): данные получателя (@username)
  // вводятся здесь и прикрепляются к позиции корзины — на чекауте их не спрашивают.
  const isTgAuto = !!currentCat?.auto_engine
  const isPremium = currentCat?.auto_engine === 'telegram_premium'
  const tgFieldDefs: InputField[] = isTgAuto
    ? ((currentCat?.input_fields?.length ? currentCat.input_fields : game?.input_fields) ?? [])
    : []
  const [tgFields, setTgFields] = useState<Record<string, string>>({})
  useEffect(() => { setTgFields({}) }, [currentCatId])

  const handleAdd = async (product: Product, inputData?: Record<string, string>) => {
    if (isPremium && products.some((p) => p.id !== product.id && (qtyByProduct.get(p.id) ?? 0) > 0)) {
      toast.error('В корзине уже есть вариант Telegram Premium — сначала удалите его')
      return
    }
    let data = inputData
    if (isTgAuto && tgFieldDefs.length) {
      const missing = tgFieldDefs.find((f) => f.required && !(tgFields[f.key] ?? '').trim())
      if (missing) {
        toast.error(`Заполните: ${missing.label}`)
        document.getElementById('tg-recipient')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      data = { ...tgFields, ...(inputData ?? {}) }
    }
    try {
      await add(product.id, data)
      toast.success('Добавлено в корзину')
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
      <Link to="/catalog" className="inline-flex items-center gap-1.5 text-sm text-[var(--hint)] hover:text-[var(--text)] transition-colors mb-6">
        <ChevronLeft size={16} />
        Каталог
      </Link>

      <div className="flex items-center gap-4 mb-8">
        {game?.image_url && (
          <img src={game.image_url} alt={gameName} className="w-16 h-16 rounded-2xl object-cover border border-[var(--border)]" />
        )}
        <h1 className="text-2xl md:text-4xl font-semibold text-[var(--text)] flex-1 min-w-0">{gameName}</h1>
        {game?.custom_order_enabled && (
          <a
            href={MINIAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Индивидуальный заказ оформляется в Telegram — оператор соберёт лот под вас"
            className="hidden sm:inline-flex items-center gap-1.5 shrink-0 text-sm font-semibold px-3.5 py-2 rounded-xl"
            style={{ background: 'rgba(37,99,235,0.14)', color: 'var(--text)', border: '1px solid transparent' }}
          >
            <MessageSquarePlus size={15} /> Индивидуальный заказ
          </a>
        )}
      </div>

      {catsError ? (
        <p className="text-sm text-[var(--hint)] py-16 text-center">Не удалось загрузить категории</p>
      ) : catsLoading ? (
        <p className="text-sm text-[var(--hint)] py-16 text-center">Загрузка...</p>
      ) : rootCats.length === 0 ? (
        <p className="text-sm text-[var(--hint)] py-16 text-center">Категории скоро появятся</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {rootCats.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCatId(cat.id)}
                className={
                  'px-4 py-2 rounded-xl text-sm font-medium transition-all ' +
                  (currentCatId === cat.id ? 'text-[var(--text)]' : 'text-[var(--hint)] bg-[var(--bg2)] border border-[var(--border)] hover:text-[var(--text-2)]')
                }
                style={currentCatId === cat.id ? { background: 'rgba(37,99,235,0.22)', border: '1px solid transparent' } : {}}
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
                  className={
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all ' +
                    (currentCatId === sub.id ? 'text-[var(--text)]' : 'text-[var(--hint)] bg-[var(--bg2)] border border-[var(--border)] hover:text-[var(--text-2)]')
                  }
                  style={currentCatId === sub.id ? { background: 'rgba(37,99,235,0.22)', border: '1px solid transparent' } : {}}
                >
                  {sub.name}
                </button>
              ))}
            </div>
          ) : null}

          {currentCat?.delivery_type && currentCat.delivery_type !== 'mixed' && (
            <div className="mb-5">
              {currentCat.delivery_type === 'auto' ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid transparent' }}>
                  <Zap size={11} fill="#34d399" stroke="none" /> Автовыдача
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full text-[var(--hint)] bg-[var(--bg2)] border border-[var(--border)]">
                  <Clock size={11} /> Вручную
                </span>
              )}
            </div>
          )}

          {prodLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-40 rounded-2xl border border-[var(--border)] bg-[var(--bg2)] animate-pulse" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <p className="text-sm text-[var(--hint)] py-16 text-center">Товары скоро появятся</p>
          ) : (
            <>
            {isTgAuto && tgFieldDefs.length > 0 && (
              <div id="tg-recipient" className="rounded-2xl p-4 mb-4 max-w-xl" style={{ background: 'var(--bg2)', border: '1px solid transparent' }}>
                <p className="text-sm font-semibold mb-3" style={{ color: 'var(--link)' }}>Данные получателя</p>
                <div className="space-y-3">
                  {tgFieldDefs.map((f) => (
                    <div key={f.key}>
                      <label className="block text-xs text-[var(--hint)] mb-1.5">
                        {f.label}{f.required && <span className="text-amber-400"> *</span>}
                      </label>
                      {f.type === 'select' ? (
                        <select
                          value={tgFields[f.key] ?? ''}
                          onChange={(e) => setTgFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                          className="w-full bg-[var(--bg3)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--border)]"
                        >
                          <option value="">Выберите...</option>
                          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          value={tgFields[f.key] ?? ''}
                          onChange={(e) => setTgFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                          placeholder={f.placeholder || f.label}
                          className="w-full bg-[var(--bg3)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none focus:border-[var(--border)]"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                  singleAdd={isPremium}
                />
              ))}
            </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
