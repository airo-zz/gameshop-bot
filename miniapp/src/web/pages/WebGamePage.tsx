/**
 * src/web/pages/WebGamePage.tsx
 * Страница игры на сайте: табы категорий + сетка товаров.
 * Просмотр публичный. Покупка пока ведёт в Telegram (веб-корзина/чекаут —
 * следующая фаза после Telegram-авторизации).
 */

import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Zap, Clock, Send } from 'lucide-react'
import { catalogApi } from '@/api'
import type { Category, Product } from '@/api'
import { MINIAPP_URL } from '@/config/appTarget'

function money(v: number) {
  return Number(v).toLocaleString('ru-RU') + ' ₽'
}

// ── Карточка товара ───────────────────────────────────────────────────────────

function ProductCard({ product }: { product: Product }) {
  const hasDiscount = !!product.original_price && Number(product.original_price) > Number(product.price)
  const discountPct = hasDiscount
    ? Math.round((1 - Number(product.price) / Number(product.original_price!)) * 100)
    : 0
  const outOfStock = product.is_out_of_stock || (product.stock !== null && product.stock === 0)

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <h3 className={'text-sm font-medium flex-1 ' + (outOfStock ? 'text-white/35' : 'text-white')}>
          {product.name}
        </h3>
        {product.badge && !outOfStock && (
          <span
            className="shrink-0 text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}
          >
            {product.badge}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2 mt-auto">
        {hasDiscount && (
          <span className="text-xs text-white/30 line-through">{money(product.original_price!)}</span>
        )}
        <span className={'text-lg font-bold ' + (outOfStock ? 'text-white/25' : '')} style={outOfStock ? {} : { color: 'var(--link)' }}>
          {money(product.price)}
        </span>
        {hasDiscount && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.18)', color: '#34d399' }}>
            −{discountPct}%
          </span>
        )}
      </div>

      {outOfStock ? (
        <div className="text-xs text-center py-2.5 rounded-xl bg-white/[0.03] text-white/40 border border-white/[0.06]">
          Нет в наличии
        </div>
      ) : (
        <a
          href={MINIAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] hover:brightness-110"
          style={{ background: 'var(--gradient-primary)' }}
        >
          <Send size={15} />
          Купить
        </a>
      )}
    </div>
  )
}

// ── Страница ──────────────────────────────────────────────────────────────────

export default function WebGamePage() {
  const { slug } = useParams<{ slug: string }>()
  const [activeCatId, setActiveCatId] = useState<string | null>(null)

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

  return (
    <div className="web-container py-8 md:py-12">
      <Link to="/catalog" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors mb-6">
        <ChevronLeft size={16} />
        Каталог
      </Link>

      <div className="flex items-center gap-4 mb-8">
        {game?.image_url && (
          <img
            src={game.image_url}
            alt={gameName}
            className="w-16 h-16 rounded-2xl object-cover border border-white/10"
          />
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
          {/* Табы категорий */}
          <div className="flex flex-wrap gap-2 mb-4">
            {rootCats.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCatId(cat.id)}
                className={
                  'px-4 py-2 rounded-xl text-sm font-medium transition-all ' +
                  (currentCatId === cat.id
                    ? 'text-white'
                    : 'text-white/55 bg-white/[0.03] border border-white/[0.06] hover:text-white/80')
                }
                style={currentCatId === cat.id ? { background: 'rgba(45,88,173,0.22)', border: '1px solid rgba(45,88,173,0.5)' } : {}}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Подкатегории */}
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

          {/* Тип доставки */}
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

          {/* Товары */}
          {prodLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-32 rounded-2xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <p className="text-sm text-white/40 py-16 text-center">Товары скоро появятся</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
