/**
 * src/web/pages/WebGamePage.tsx
 * Страница игры на сайте: шапка игры, вкладки категорий, сетка товаров и
 * закреплённый блок корзины (десктоп) / нижняя панель (мобильный).
 * Покупка требует входа (почта или Telegram). Оформление — на /checkout.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { m } from 'framer-motion'
import { ChevronRight, Zap, Clock, Plus, Minus, ShoppingCart, MessageSquarePlus, ShieldCheck, Headphones } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { catalogApi, reviewsApi } from '@/api'
import { ReviewCard, ReviewSummary, reviewsWord } from '@/components/reviews/Reviews'
import type { Category, Product, InputField, GameSeo } from '@/api'
import { useWebAuth } from '@/web/auth/useWebAuth'
import { useWebCart } from '@/web/cart/useWebCart'
import { money } from '@/web/format'
import { normalizeImageUrl } from '@/utils/imageUrl'
import { onThumbError, thumbSrcSet, thumbUrl } from '@/utils/thumb'
import { EASE, Stagger, StaggerItem } from '@/web/components/Motion'
import { usePageMeta } from '@/web/seo'
import WebDecorPage from '@/web/pages/WebDecorPage'

// ── Карточка товара ───────────────────────────────────────────────────────────

interface ProductCardProps {
  product: Product
  qty: number
  isAuthenticated: boolean
  onAdd: (product: Product, inputData?: Record<string, string>, quantity?: number) => void
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
  const allFields: InputField[] = product.input_fields ?? []
  // Поле «Количество» — товар за единицу (Stars, сумма Steam): цена × количество
  const qtyField = allFields.find((f) => f.type === 'quantity')
  const inputFields = allFields.filter((f) => f.type !== 'quantity')
  const hasInputs = inputFields.length > 0
  const minQty = Math.max(1, Number(qtyField?.min ?? 1))

  const [inputData, setInputData] = useState<Record<string, string>>({})
  const [showInputs, setShowInputs] = useState(false)
  const [units, setUnits] = useState(String(minQty))
  const unitsNum = Math.max(minQty, Math.floor(Number(units) || 0))

  const missingRequired = inputFields.some((f) => f.required && !(inputData[f.key] ?? '').trim())

  function handleBuy() {
    if (!isAuthenticated) { onRequireLogin(); return }
    if (hasInputs && !showInputs && qty === 0) { setShowInputs(true); return }
    if (missingRequired) { toast.error('Заполните обязательные поля'); return }
    if (qtyField && Number(units) < minQty) { toast.error(`Минимум ${minQty} ${qtyField.unit || 'шт'}`); return }
    onAdd(product, hasInputs ? inputData : undefined, qtyField ? unitsNum : 1)
  }

  return (
    <div className={'h-full rounded-2xl bg-[var(--bg2)] p-4 flex flex-col gap-3 transition-colors ' + (qty > 0 ? 'ring-1 ring-[var(--accent)]' : 'hover:bg-[#191B21]')}>
      <div className="flex items-start gap-2">
        <h3 className={'text-[15px] font-medium leading-snug flex-1 ' + (outOfStock ? 'text-[var(--hint)]' : 'text-[var(--text)]')} style={{ margin: 0 }}>
          {product.name}
        </h3>
        {product.badge && !outOfStock && (
          <span className="shrink-0 text-[11px] font-semibold text-white px-1.5 py-0.5 rounded-md" style={{ background: '#EF4444' }}>
            {product.badge}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className={'text-xl font-semibold tracking-tight num ' + (outOfStock ? 'text-[var(--hint)]' : 'text-[var(--text)]')}>
          {money(product.price)}
        </span>
        {hasDiscount && <span className="text-sm text-[var(--hint)] line-through num">{money(product.original_price!)}</span>}
        {hasDiscount && (
          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(16,185,129,0.14)', color: '#34d399' }}>
            −{discountPct}%
          </span>
        )}
      </div>

      {/* Поля от покупателя */}
      {hasInputs && showInputs && !outOfStock && (
        <div className="flex flex-col gap-2">
          {inputFields.map((field) => (
            <div key={field.key}>
              <label className="block text-xs text-[var(--hint)] mb-1">
                {field.label}{field.required && <span className="text-amber-400"> *</span>}
              </label>
              {field.type === 'select' ? (
                <select
                  value={inputData[field.key] ?? ''}
                  onChange={(e) => setInputData((p) => ({ ...p, [field.key]: e.target.value }))}
                  className="w-full h-10 bg-[var(--bg3)] border border-transparent rounded-xl px-3 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
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
                  className="w-full h-10 bg-[var(--bg3)] border border-transparent rounded-xl px-3 text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none focus:border-[var(--accent)]"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Количество для товара «за единицу» */}
      {qtyField && !outOfStock && qty === 0 && (
        <div>
          <label className="block text-xs text-[var(--hint)] mb-1">
            {qtyField.label || 'Количество'} · от {minQty} {qtyField.unit || 'шт'}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text" inputMode="numeric" value={units}
              onChange={(e) => setUnits(e.target.value.replace(/\D/g, ''))}
              onBlur={() => setUnits(String(unitsNum))}
              className="w-28 h-10 bg-[var(--bg3)] border border-transparent rounded-xl px-3 text-sm text-[var(--text)] num focus:outline-none focus:border-[var(--accent)]"
            />
            <span className="text-sm text-[var(--text-2)] num">= {money(Number(product.price) * unitsNum)}</span>
          </div>
        </div>
      )}

      {/* Действие */}
      <div className="mt-auto pt-1">
        {outOfStock ? (
          <div className="text-sm text-center h-10 flex items-center justify-center rounded-xl bg-[var(--bg3)] text-[var(--hint)]">
            Нет в наличии
          </div>
        ) : qty > 0 && qtyField ? (
          <div className="flex items-center justify-between h-10 rounded-xl bg-[var(--bg3)] px-3">
            <span className="text-sm font-semibold text-[var(--text)] num">{qty} {qtyField.unit || 'шт'} в корзине</span>
            <button onClick={() => onDec(product)} className="text-xs text-[var(--hint)] hover:text-[var(--text)]">
              Убрать
            </button>
          </div>
        ) : qty > 0 ? (
          <div className="flex items-center justify-between h-10 rounded-xl bg-[var(--bg3)] px-1">
            <button onClick={() => onDec(product)} className="w-9 h-8 flex items-center justify-center rounded-lg text-[var(--text-2)] hover:bg-[var(--bg2)]" aria-label="Убрать одну штуку">
              <Minus size={16} />
            </button>
            <span className="text-sm font-semibold text-[var(--text)] num">{qty} в корзине</span>
            <button
              onClick={() => onAdd(product, hasInputs ? inputData : undefined)}
              disabled={singleAdd}
              className="w-9 h-8 flex items-center justify-center rounded-lg text-[var(--text-2)] hover:bg-[var(--bg2)] disabled:opacity-25 disabled:hover:bg-transparent"
              aria-label="Добавить ещё одну"
            >
              <Plus size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleBuy}
            className="flex items-center justify-center gap-2 w-full h-10 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors"
          >
            <ShoppingCart size={17} />
            {hasInputs && !showInputs ? 'Выбрать' : 'В корзину'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Блок корзины (справа на десктопе, снизу на телефоне) ─────────────────────

function CartSummary({ count, total }: { count: number; total: number }) {
  return (
    <div className="rounded-2xl bg-[var(--bg2)] p-5">
      <p className="text-sm text-[var(--hint)]">Корзина</p>
      {count > 0 ? (
        <>
          <p className="mt-1 text-2xl font-semibold tracking-tight num text-[var(--text)]">{money(total)}</p>
          <p className="text-sm text-[var(--hint)] mt-0.5">{count} {count === 1 ? 'позиция' : count < 5 ? 'позиции' : 'позиций'}</p>
          <Link to="/checkout" className="mt-4 flex items-center justify-center h-11 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors">
            Оформить заказ
          </Link>
          <Link to="/cart" className="mt-2 flex items-center justify-center h-10 rounded-xl text-sm text-[var(--text-2)] hover:bg-[var(--bg3)] transition-colors">
            Открыть корзину
          </Link>
        </>
      ) : (
        <p className="mt-1 text-sm text-[var(--text-2)]">Добавьте товар, чтобы оформить заказ.</p>
      )}
      <ul className="mt-5 pt-5 border-t border-[var(--border)] space-y-2.5 text-sm text-[var(--text-2)]">
        <li className="flex items-center gap-2"><ShieldCheck size={18} className="text-[var(--hint)]" />Оплата через СБП, картой или криптовалютой</li>
        <li className="flex items-center gap-2"><Headphones size={18} className="text-[var(--hint)]" />Онлайн-чат с оператором</li>
      </ul>
    </div>
  )
}

// ── Вопросы и текст о донате (для людей и поисковиков) ──────────────────────

// ── Отзывы по игре ────────────────────────────────────────────────────────────

function GameReviews({ slug, gameName }: { slug: string; gameName: string }) {
  const { data } = useQuery({
    queryKey: ['reviews', 'game', slug],
    queryFn: () => reviewsApi.list({ game: slug, kind: 'text', limit: 4 }),
    staleTime: 5 * 60_000,
  })
  const total = data?.summary?.total ?? 0
  if (!data || !total) return null
  return (
    <section className="mt-16" aria-labelledby="game-reviews">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <h2 id="game-reviews" className="text-xl md:text-2xl font-semibold tracking-tight text-[var(--text)]">
          Отзывы о покупке {gameName}
        </h2>
        <Link to={`/reviews?game=${slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--link)] hover:text-[var(--text)] transition-colors">
          Все {total} {reviewsWord(total)} <ChevronRight size={16} />
        </Link>
      </div>
      {data.summary && <div className="mb-3"><ReviewSummary summary={data.summary} /></div>}
      {data.items.length > 0 && (
        <div className="grid md:grid-cols-2 gap-3">
          {data.items.map((r) => (
            <ReviewCard key={r.id} review={r} gameHref={(s) => `/game/${s}`} showGame={false} clamp />
          ))}
        </div>
      )}
    </section>
  )
}

// Свой текст о донате из админки и другие названия игры (для поиска) — без блока вопросов
function GameSeoBlock({ seo }: { seo: GameSeo }) {
  if (!seo.text && !seo.aliases.length) return null
  return (
    <section className="mt-16 max-w-3xl">
      {seo.text && <p className="text-sm leading-relaxed text-[var(--hint)] whitespace-pre-line">{seo.text}</p>}
      {seo.aliases.length > 0 && (
        <p className={(seo.text ? 'mt-3 ' : '') + 'text-xs text-[var(--hint)] leading-relaxed'}>Также ищут: {seo.aliases.join(', ')}</p>
      )}
    </section>
  )
}

// ── Страница ──────────────────────────────────────────────────────────────────

export default function WebGamePage() {
  const { slug } = useParams<{ slug: string }>()
  const { data: games = [] } = useQuery({
    queryKey: ['web', 'games', 'all'],
    queryFn: () => catalogApi.getGames(),
    staleTime: 5 * 60_000,
  })
  const game = games.find((g) => g.slug === slug)
  // «Украшения Discord» — своя страница-каталог вместо вкладок категорий
  if (game?.decor_catalog) return <WebDecorPage game={game} />
  return <GamePageContent />
}

function GamePageContent() {
  const { slug, cat: catSlug } = useParams<{ slug: string; cat?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [activeCatId, setActiveCatId] = useState<string | null>(params.get('cat'))

  const { isAuthenticated } = useWebAuth()
  const { cart, count, qtyByProduct, add, setQty } = useWebCart()

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
  const allCats = useMemo(() => [...categories, ...categories.flatMap((c) => c.children ?? [])], [categories])
  // Раздел: выбранный кликом → из адреса /game/<игра>/<раздел> → ?cat= → первый
  const slugCatId = catSlug ? rootCats.find((c) => c.slug === catSlug)?.id ?? null : null
  const currentCatId = (activeCatId && allCats.some((c) => c.id === activeCatId) ? activeCatId : null)
    ?? slugCatId ?? rootCats[0]?.id ?? null
  const currentCat = allCats.find((c) => c.id === currentCatId)
  const currentRoot = rootCats.find((c) => c.id === currentCatId || c.children?.some((s) => s.id === currentCatId))

  const { data: products = [], isLoading: prodLoading } = useQuery({
    queryKey: ['web', 'products', currentCatId],
    queryFn: () => catalogApi.getProducts(currentCatId!),
    enabled: !!currentCatId,
    staleTime: 2 * 60_000,
  })

  const game = games.find((g) => g.slug === slug)
  const gameName = game?.name ?? slug?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? ''
  const cover = game?.image_url ? normalizeImageUrl(game.image_url) ?? game.image_url : null
  const description = (currentCat?.description || game?.description || '').trim()

  // У каждого раздела своя страница: адрес меняется при выборе вкладки
  const selectRoot = (cat: Category) => {
    setActiveCatId(cat.id)
    navigate(`/game/${slug}/${cat.slug}${location.search}`, { replace: true, preventScrollReset: true })
  }

  // Заголовок, описание и вопросы — те же, что у серверной версии страницы
  const { data: seo } = useQuery({
    queryKey: ['web', 'game-seo', slug, catSlug ?? ''],
    queryFn: () => catalogApi.getGameSeo(slug!, catSlug),
    enabled: !!slug,
    staleTime: 10 * 60_000,
    retry: false,
  })
  usePageMeta({ title: seo?.title, description: seo?.description, exact: true })
  // Тот же H1, что даст сервер, — чтобы заголовок не менялся после загрузки текстов
  const fallbackH1 = catSlug && currentRoot
    ? `${currentRoot.name.replace(/^[^\p{L}\p{N}]+/u, '').trim()} ${gameName}`
    : `${game?.type === 'service' ? 'Пополнение' : 'Донат'} ${gameName}`

  const requireLogin = () => navigate('/login', { state: { from: location.pathname } })

  // Telegram-подраздел (автовыдача): данные получателя (@username)
  // вводятся здесь и прикрепляются к позиции корзины — на чекауте их не спрашивают.
  const isTgAuto = !!currentCat?.auto_engine
  const isPremium = currentCat?.auto_engine === 'telegram_premium'
  const tgFieldDefs: InputField[] = isTgAuto
    ? ((currentCat?.input_fields?.length ? currentCat.input_fields : game?.input_fields) ?? [])
    : []
  const [tgFields, setTgFields] = useState<Record<string, string>>({})
  useEffect(() => { setTgFields({}) }, [currentCatId])

  const handleAdd = async (product: Product, inputData?: Record<string, string>, quantity = 1) => {
    if (isPremium && products.some((p) => p.id !== product.id && (qtyByProduct.get(p.id) ?? 0) > 0)) {
      toast.error('В корзине уже есть вариант этой подписки — сначала удалите его')
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
      await add(product.id, data, quantity)
      toast.success('Добавлено в корзину')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Не удалось добавить')
    }
  }

  const handleDec = async (product: Product) => {
    const item = cart?.items.find((i) => i.product_id === product.id)
    if (!item) return
    // Товар «за единицу» (Stars, сумма Steam) — убираем позицию целиком, а не по 1 ед.
    const perUnit = (product.input_fields ?? []).some((f) => f.type === 'quantity')
    try {
      await setQty(item.id, perUnit ? 0 : item.quantity - 1)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Не удалось изменить количество')
    }
  }

  const tabClass = (active: boolean) =>
    'relative h-10 px-4 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ' +
    (active ? 'text-[var(--text)]' : 'text-[var(--hint)] hover:text-[var(--text-2)]')

  return (
    <div className={'web-container py-6 md:py-10 ' + (count > 0 ? 'pb-28 lg:pb-10' : '')}>
      {/* Хлебные крошки */}
      <nav aria-label="Навигация" className="flex items-center gap-1.5 text-sm text-[var(--hint)] mb-6">
        <Link to="/" className="hover:text-[var(--text)] transition-colors">Главная</Link>
        <ChevronRight size={14} />
        <Link to="/catalog" className="hover:text-[var(--text)] transition-colors">Каталог</Link>
        <ChevronRight size={14} />
        {catSlug && currentRoot ? (
          <>
            <Link to={`/game/${slug}`} className="hover:text-[var(--text)] transition-colors truncate">{gameName}</Link>
            <ChevronRight size={14} />
            <span className="text-[var(--text-2)] truncate">{currentRoot.name}</span>
          </>
        ) : (
          <span className="text-[var(--text-2)] truncate">{gameName}</span>
        )}
      </nav>

      {/* Шапка игры */}
      <header className="flex items-start sm:items-center gap-4 sm:gap-5 mb-8">
        {cover ? (
          <img src={thumbUrl(cover, 320) ?? cover} onError={onThumbError(cover)} alt={gameName} width={112} height={112} className="w-16 h-16 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-2xl object-cover shrink-0" style={{ boxShadow: 'inset 0 0 0 1px var(--border)' }} />
        ) : !game ? (
          <div className="w-16 h-16 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-2xl bg-[var(--bg2)] shrink-0" aria-hidden="true" />
        ) : null}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl md:text-[2.5rem] leading-tight text-[var(--text)]" style={{ margin: 0 }}>{seo?.h1 ?? fallbackH1}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 min-h-7">
            {currentCat?.delivery_type === 'auto' && (
              <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
                <Zap size={14} fill="#34d399" /> Автовыдача
              </span>
            )}
            {currentCat?.delivery_type === 'manual' && (
              <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium text-[var(--text-2)] bg-[var(--bg2)]">
                <Clock size={14} /> Выдача оператором
              </span>
            )}
            {game?.custom_order_enabled && (
              <Link
                to={`/request?type=custom_order&game=${encodeURIComponent(gameName)}`}
                title="Оператор соберёт набор под ваш запрос"
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium text-[var(--text-2)] bg-[var(--bg2)] hover:bg-[var(--bg3)] transition-colors"
              >
                <MessageSquarePlus size={14} /> Индивидуальный заказ
              </Link>
            )}
          </div>
          {description && <p className="mt-3 text-sm text-[var(--text-2)] leading-relaxed max-w-2xl whitespace-pre-line">{description}</p>}
        </div>
      </header>

      {catsError ? (
        <p className="text-sm text-[var(--hint)] py-16 text-center">Не удалось загрузить товары — обновите страницу</p>
      ) : catsLoading ? (
        <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start" aria-hidden="true">
          <div>
            <div className="h-12 w-80 max-w-full rounded-2xl bg-[var(--bg2)] animate-pulse mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-40 rounded-2xl bg-[var(--bg2)] animate-pulse" />
              ))}
            </div>
          </div>
          <div className="hidden lg:block h-52 rounded-2xl bg-[var(--bg2)] animate-pulse" />
        </div>
      ) : rootCats.length === 0 ? (
        <p className="text-sm text-[var(--hint)] py-16 text-center">Товары для этой игры скоро появятся</p>
      ) : (
        <>
            {/* Категории: переносятся на новую строку — лента с прокруткой без полосы
                на ПК не листалась мышью, дальние разделы были недоступны. Над сеткой во
                всю ширину: корзина справа начинается вровень с товарами, а не с вкладками */}
            <div className="flex flex-wrap gap-1 p-1 rounded-2xl bg-[var(--bg2)] w-fit max-w-full mb-3">
              {rootCats.map((cat) => {
                const active = currentRoot?.id === cat.id
                return (
                  <button key={cat.id} onClick={() => selectRoot(cat)} className={tabClass(active)}>
                    {active && <m.span layoutId="web-game-tab" className="absolute inset-0 rounded-xl bg-[var(--bg3)]" transition={{ duration: 0.25, ease: EASE }} />}
                    <span className="relative">{cat.name}</span>
                  </button>
                )
              })}
            </div>

            {currentRoot?.children?.length ? (
              <div className="flex flex-wrap gap-2 mb-4">
                {currentRoot.children.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => setActiveCatId(sub.id)}
                    className={
                      'h-8 px-3 rounded-lg text-sm transition-colors ' +
                      (currentCatId === sub.id ? 'bg-[var(--accent-soft)] text-[var(--text)] ring-1 ring-[var(--accent)]' : 'bg-[var(--bg2)] text-[var(--hint)] hover:text-[var(--text-2)]')
                    }
                  >
                    {sub.name}
                  </button>
                ))}
              </div>
            ) : <div className="mb-1" />}

        <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
          <div className="min-w-0">
            {isTgAuto && tgFieldDefs.length > 0 && (
              <div id="tg-recipient" className="rounded-2xl p-5 mb-4 bg-[var(--bg2)]">
                <p className="text-base font-semibold text-[var(--text)] mb-3">Данные получателя</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {tgFieldDefs.map((f) => (
                    <div key={f.key}>
                      <label className="block text-xs text-[var(--hint)] mb-1.5">
                        {f.label}{f.required && <span className="text-amber-400"> *</span>}
                      </label>
                      {f.type === 'select' ? (
                        <select
                          value={tgFields[f.key] ?? ''}
                          onChange={(e) => setTgFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                          className="w-full h-11 bg-[var(--bg3)] border border-transparent rounded-xl px-3 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                        >
                          <option value="">Выберите...</option>
                          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          value={tgFields[f.key] ?? ''}
                          onChange={(e) => setTgFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                          placeholder={f.placeholder || f.label}
                          className="w-full h-11 bg-[var(--bg3)] border border-transparent rounded-xl px-3 text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {prodLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-40 rounded-2xl bg-[var(--bg2)] animate-pulse" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <p className="text-sm text-[var(--hint)] py-16 text-center">В этом разделе пока нет товаров</p>
            ) : (
              <>
              {/* Заголовок раздела для структуры страницы (h1 → h2 → h3 карточек) */}
              <h2 className="sr-only">{currentCat?.name ?? gameName}</h2>
              <Stagger key={currentCatId ?? ''} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {products.map((p) => (
                  <StaggerItem key={p.id} className="h-full">
                    <ProductCard
                      product={p}
                      qty={qtyByProduct.get(p.id) ?? 0}
                      isAuthenticated={isAuthenticated}
                      onAdd={handleAdd}
                      onDec={handleDec}
                      onRequireLogin={requireLogin}
                      singleAdd={isPremium}
                    />
                  </StaggerItem>
                ))}
              </Stagger>
              </>
            )}
          </div>

          {/* Корзина: справа на десктопе */}
          <aside className="hidden lg:block sticky top-24">
            <CartSummary count={count} total={Number(cart?.total ?? 0)} />
          </aside>
        </div>
        </>
      )}

      {slug && <GameReviews slug={slug} gameName={gameName} />}
      {seo && <GameSeoBlock seo={seo} />}

      {/* Корзина: нижняя панель на телефоне */}
      {count > 0 && (
        <div className="lg:hidden fixed left-0 right-0 z-30 border-t border-[var(--border)] bg-[var(--bg)]" style={{ bottom: 'var(--cookie-h, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="web-container flex items-center gap-3 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[var(--hint)]">{count} в корзине</p>
              <p className="text-lg font-semibold num text-[var(--text)]">{money(Number(cart?.total ?? 0))}</p>
            </div>
            <Link to="/checkout" className="h-11 px-5 flex items-center rounded-xl text-sm font-semibold text-white bg-[var(--accent)]">
              Оформить
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
