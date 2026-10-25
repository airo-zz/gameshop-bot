/**
 * src/components/decor/DecorCatalog.tsx
 * Каталог украшений Discord — общий для сайта и Mini App.
 * Устройство как у discordcatalog.net (поиск, тип, коллекция, цветовые варианты,
 * панель выбранного), оформление — дизайн-система reDonate.
 *
 * Карточка = один товар Discord: коллекция + номер товара в ней (как в магазине
 * Discord). Цветовые варианты одного украшения — кружки на карточке; разные типы
 * с одинаковым названием (украшение аватара «Jack Skellington» и бейджик) —
 * отдельные карточки. Каждый вариант — отдельный товар reDonate. Корзину ведёт
 * обёртка (onAdd/onRemove).
 *
 * Анимации — CSS-классы anim-pop / anim-press / anim-rise (index.css), без JS.
 */

import Bump from '@/components/ui/Bump'
import { useEffect, useMemo, useRef, useState } from 'react'
import { pressBtn as press } from '@/utils/pressAnim'
import { Search, Plus, Minus, ShoppingCart, X } from '@/components/ui/icons'
import type { DecorCatalogData, DecorItem } from '@/api'

const PAGE = 48

function rub(v: number) {
  return Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽'
}

export function decorWord(n: number) {
  const a = n % 10, b = n % 100
  if (a === 1 && b !== 11) return 'украшение'
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return 'украшения'
  return 'украшений'
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е')
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)


interface Card {
  key: string
  c: string
  name: string
  en: string
  t: number
  variants: DecorItem[]
}

interface Props {
  data: DecorCatalogData
  qty: Map<string, number>
  onAdd: (item: DecorItem) => void
  onRemove: (item: DecorItem) => void
  cart: { count: number; total: number }
  onCheckout: () => void
  checkoutLabel: string
  /** Отступ панели снизу (нижняя навигация Mini App) */
  bottomOffset?: number
  /** Коллекция, выбранная заранее (ссылка на коллекцию) */
  initialColl?: string
}

function DecorCard({ card, typeLabel, qty, onAdd, onRemove }: {
  card: Card
  typeLabel: string
  qty: Map<string, number>
  onAdd: (i: DecorItem) => void
  onRemove: (i: DecorItem) => void
}) {
  // Вариант по умолчанию — уже лежащий в корзине, иначе первый
  const [vi, setVi] = useState(() => Math.max(0, card.variants.findIndex((v) => (qty.get(v.id) ?? 0) > 0)))
  const v = card.variants[Math.min(vi, card.variants.length - 1)]
  const n = qty.get(v.id) ?? 0
  const multi = card.variants.length > 1

  return (
    <div
      className="flex flex-col gap-2.5 min-w-0 rounded-2xl p-2 pb-2.5 transition-shadow"
      style={{ background: 'var(--bg2)', boxShadow: n > 0 ? 'inset 0 0 0 2px var(--accent)' : 'none' }}
    >
      <div className="relative aspect-square rounded-xl flex items-center justify-center overflow-hidden" style={{ background: 'var(--bg3)' }}>
        {v.img ? (
          <img src={v.img} alt={card.name} loading="lazy" decoding="async" className="w-full h-full object-contain p-2.5" />
        ) : (
          <span className="text-xs text-[var(--hint)] px-3 text-center">{card.name}</span>
        )}
        {n > 0 && (
          <Bump
            value={n}
            className="absolute top-1.5 right-1.5 min-w-[22px] h-[22px] px-1.5 rounded-lg text-[12px] font-semibold text-white text-center leading-[22px] num"
            style={{ background: 'var(--accent)' }}
          >
            {n}
          </Bump>
        )}
      </div>

      <div className="min-w-0 px-0.5">
        <p className="text-[13px] leading-snug text-[var(--text)] line-clamp-2" title={card.en && card.en !== card.name ? card.en : undefined}>
          {card.name}
        </p>
        <p className="text-[11px] text-[var(--hint)] mt-0.5 truncate">
          {typeLabel}{multi && v.color ? `, ${v.color}` : ''}
        </p>
        {multi && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2" role="radiogroup" aria-label="Цвет">
            {card.variants.map((x, i) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={i === vi}
                aria-label={x.color || `Вариант ${i + 1}`}
                title={x.color}
                onClick={() => setVi(i)}
                className="w-[18px] h-[18px] rounded-full shrink-0 transition-shadow"
                style={{
                  background: x.hex ? `#${x.hex}` : 'var(--bg3)',
                  boxShadow: i === vi ? '0 0 0 2px var(--bg2), 0 0 0 4px var(--accent)' : 'inset 0 0 0 1px rgba(255,255,255,0.14)',
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 px-0.5">
        <span className="text-[15px] font-semibold text-[var(--text)] num">{rub(v.price)}</span>
        {v.out ? (
          <span className="text-[11px] text-[var(--hint)]">Нет в продаже</span>
        ) : n === 0 ? (
          <button
            type="button"
            onClick={(e) => { press(e); onAdd(v) }}
            aria-label={`Добавить в корзину: ${card.name}`}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors"
          >
            <Plus size={18} />
          </button>
        ) : (
          <div className="flex items-center h-9 rounded-xl bg-[var(--bg3)]">
            <button type="button" onClick={(e) => { press(e); onRemove(v) }} aria-label="Убрать одно" className="w-8 h-9 flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text)]">
              <Minus size={15} />
            </button>
            <button type="button" onClick={(e) => { press(e); onAdd(v) }} aria-label="Добавить ещё" className="w-8 h-9 flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text)]">
              <Plus size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DecorCatalog({ data, qty, onAdd, onRemove, cart, onCheckout, checkoutLabel, bottomOffset = 0, initialColl }: Props) {
  const [q, setQ] = useState('')
  const [type, setType] = useState(-1)
  const [coll, setColl] = useState(initialColl ?? '')
  const [limit, setLimit] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement>(null)

  const collName = useMemo(() => new Map(data.collections.map((c) => [c.id, c.name])), [data.collections])

  const cards = useMemo(() => {
    const map = new Map<string, Card>()
    for (const it of data.items) {
      // Один товар Discord = коллекция + номер в ней (цвета делят номер);
      // без номера — по названию и типу, чтобы разные типы не склеились
      const key = it.i != null ? `${it.c}|${it.i}` : `${it.c}|${it.t}|${it.name}`
      const card = map.get(key)
      if (card) card.variants.push(it)
      else map.set(key, { key, c: it.c, name: it.name, en: it.en, t: it.t, variants: [it] })
    }
    const order = new Map(data.collections.map((c, i) => [c.id, i]))
    return [...map.values()].sort((a, b) => (order.get(a.c) ?? 0) - (order.get(b.c) ?? 0))
  }, [data])

  const filtered = useMemo(() => {
    const words = norm(q.trim()).split(/\s+/).filter(Boolean)
    return cards.filter((card) => {
      if (type >= 0 && card.t !== type) return false
      if (coll && card.c !== coll) return false
      if (!words.length) return true
      const hay = norm([card.name, card.en, collName.get(card.c) ?? '', ...card.variants.flatMap((v) => [v.code, v.color])].join(' '))
      return words.every((w) => hay.includes(w))
    })
  }, [cards, q, type, coll, collName])

  const countByColl = useMemo(() => {
    const m = new Map<string, number>()
    filtered.forEach((c) => m.set(c.c, (m.get(c.c) ?? 0) + 1))
    return m
  }, [filtered])

  useEffect(() => { setLimit(PAGE) }, [q, type, coll])

  // Догружаем карточки по мере прокрутки
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) setLimit((l) => l + PAGE) }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [filtered.length])

  const visible = filtered.slice(0, limit)
  const grouped = !q.trim()
  const sections: { id: string; cards: Card[] }[] = []
  if (grouped) {
    for (const card of visible) {
      const last = sections[sections.length - 1]
      if (last && last.id === card.c) last.cards.push(card)
      else sections.push({ id: card.c, cards: [card] })
    }
  } else {
    sections.push({ id: '', cards: visible })
  }

  const chip = (active: boolean) =>
    'shrink-0 h-9 px-3.5 rounded-xl text-sm font-medium transition-colors ' +
    (active ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg2)] text-[var(--text-2)] hover:text-[var(--text)]')

  return (
    <div className="pb-28">
      <div className="space-y-3 mb-6">
        <div className="relative">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--hint)] pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Название или цвет"
            aria-label="Поиск украшений"
            className="w-full h-11 rounded-xl bg-[var(--bg2)] pl-10 pr-10 text-[15px] text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Очистить поиск" className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-[var(--hint)]">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1" style={{ scrollbarWidth: 'none' }}>
          <button type="button" className={chip(type === -1)} onClick={() => setType(-1)}>Все</button>
          {data.types.map((t, i) => (
            <button key={t} type="button" className={chip(type === i)} onClick={() => setType(i)}>
              {cap(t)}
            </button>
          ))}
        </div>

        <select
          value={coll}
          onChange={(e) => setColl(e.target.value)}
          aria-label="Коллекция"
          className="w-full sm:w-80 h-10 rounded-xl bg-[var(--bg2)] px-3 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        >
          <option value="">Все коллекции ({data.collections.length})</option>
          {data.collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {!grouped && (
        <p className="text-sm text-[var(--hint)] mb-3">
          {filtered.length ? `Найдено: ${filtered.length}` : 'Ничего не нашлось — попробуйте другое название или английское имя украшения.'}
        </p>
      )}

      <div>
        {sections.map((sec, si) => (
          <section key={sec.id || 'all'} className={si > 0 ? 'mt-10' : ''}>
            {grouped && (
              <div
                className="sticky z-10 -mx-1 px-1 pt-3 pb-3 mb-1 flex items-baseline gap-2.5"
                style={{ top: 'var(--decor-sticky-top, 0px)', background: 'var(--bg)', borderTop: si > 0 ? '1px solid var(--border)' : 'none' }}
              >
                <h2 className="text-[19px] md:text-[21px] font-semibold tracking-[-0.01em] text-[var(--text)] leading-tight">
                  {collName.get(sec.id)}
                </h2>
                <span className="text-sm text-[var(--hint)] num">{countByColl.get(sec.id) ?? sec.cards.length}</span>
              </div>
            )}
            <div className="grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 md:gap-3">
              {sec.cards.map((card) => (
                <DecorCard
                  key={card.key}
                  card={card}
                  typeLabel={cap(data.types[card.t] ?? '')}
                  qty={qty}
                  onAdd={onAdd}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      {limit < filtered.length && <div ref={sentinel} className="h-10" />}

      {cart.count > 0 && (
        <div className="fixed left-0 right-0 z-30 px-4 anim-rise" style={{ bottom: bottomOffset + 12 }}>
          <div className="max-w-xl mx-auto flex items-center gap-3 rounded-2xl p-2 pl-4" style={{ background: 'var(--bg3)', boxShadow: '0 10px 28px rgba(0,0,0,0.5)' }}>
            <ShoppingCart size={18} className="text-[var(--link)] shrink-0" />
            <p className="flex-1 min-w-0 text-sm text-[var(--text)] truncate">
              <Bump value={cart.count} className="font-semibold num">{cart.count}</Bump> {decorWord(cart.count)} на{' '}
              <Bump value={cart.total} className="font-semibold num">{rub(cart.total)}</Bump>
            </p>
            <button
              type="button"
              onClick={onCheckout}
              className="h-10 px-4 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] shrink-0"
            >
              {checkoutLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
