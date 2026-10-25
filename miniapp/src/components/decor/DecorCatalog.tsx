/**
 * src/components/decor/DecorCatalog.tsx
 * Каталог украшений Discord — общий для сайта и Mini App.
 * Устройство как у discordcatalog.net (поиск, тип, коллекция, цветовые варианты,
 * панель выбранного), оформление — дизайн-система reDonate.
 *
 * Каждый цветовой вариант — отдельный товар; карточка объединяет варианты одного
 * украшения, кружки цвета переключают вариант. Корзину ведёт обёртка (onAdd/onRemove).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, Minus, Check, X } from '@/components/ui/icons'
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
}

function DecorCard({ card, qty, onAdd, onRemove }: {
  card: Card
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
    <div className="flex flex-col gap-2 min-w-0">
      <div
        className="relative aspect-square rounded-xl flex items-center justify-center overflow-hidden"
        style={{ background: 'var(--bg3)', outline: n > 0 ? '2px solid var(--accent)' : 'none', outlineOffset: -2 }}
      >
        {v.img ? (
          <img src={v.img} alt={card.name} loading="lazy" decoding="async" className="w-full h-full object-contain p-2.5" />
        ) : (
          <span className="text-xs text-[var(--hint)] px-3 text-center">{card.name}</span>
        )}
        {n > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[22px] h-[22px] px-1.5 rounded-lg text-[12px] font-semibold text-white flex items-center justify-center num" style={{ background: 'var(--accent)' }}>
            {n}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-[13px] leading-snug text-[var(--text)] line-clamp-2" title={card.en && card.en !== card.name ? card.en : undefined}>
          {card.name}
        </p>
        {multi && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5" role="radiogroup" aria-label="Цвет">
            {card.variants.map((x, i) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={i === vi}
                title={x.color}
                onClick={() => setVi(i)}
                className="w-[18px] h-[18px] rounded-full shrink-0"
                style={{
                  background: x.hex ? `#${x.hex}` : 'var(--bg3)',
                  boxShadow: i === vi ? '0 0 0 2px var(--bg), 0 0 0 4px var(--accent)' : 'inset 0 0 0 1px rgba(255,255,255,0.12)',
                }}
              />
            ))}
          </div>
        )}
        {multi && v.color && <p className="text-[11px] text-[var(--hint)] mt-1 truncate">{v.color}</p>}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="text-[15px] font-semibold text-[var(--text)] num">{rub(v.price)}</span>
        {v.out ? (
          <span className="text-[11px] text-[var(--hint)]">Нет в продаже</span>
        ) : n === 0 ? (
          <button
            type="button"
            onClick={() => onAdd(v)}
            aria-label={`Добавить ${card.name}`}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] active:scale-[0.96] transition-transform"
          >
            <Plus size={18} />
          </button>
        ) : (
          <div className="flex items-center h-9 rounded-xl bg-[var(--bg3)]">
            <button type="button" onClick={() => onRemove(v)} aria-label="Убрать одно" className="w-8 h-9 flex items-center justify-center text-[var(--text-2)]">
              <Minus size={15} />
            </button>
            <button type="button" onClick={() => onAdd(v)} aria-label="Добавить ещё" className="w-8 h-9 flex items-center justify-center text-[var(--text-2)]">
              <Plus size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DecorCatalog({ data, qty, onAdd, onRemove, cart, onCheckout, checkoutLabel, bottomOffset = 0 }: Props) {
  const [q, setQ] = useState('')
  const [type, setType] = useState(-1)
  const [coll, setColl] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement>(null)

  const collName = useMemo(() => new Map(data.collections.map((c) => [c.id, c.name])), [data.collections])

  const cards = useMemo(() => {
    const map = new Map<string, Card>()
    for (const it of data.items) {
      const key = `${it.c}|${it.name}`
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
  const grouped = !q.trim() && !coll
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
      <div className="space-y-3 mb-5">
        <div className="relative">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--hint)] pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Название, код или цвет"
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
              {t.charAt(0).toUpperCase() + t.slice(1)}
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

      <div className="space-y-7">
        {sections.map((sec) => (
          <section key={sec.id || 'all'}>
            {grouped && (
              <h2 className="sticky z-10 py-2 text-[17px] font-semibold text-[var(--text)]" style={{ top: 'var(--decor-sticky-top, 0px)', background: 'var(--bg)' }}>
                {collName.get(sec.id)}
              </h2>
            )}
            <div className="grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-3 gap-y-5">
              {sec.cards.map((card) => (
                <DecorCard key={card.key} card={card} qty={qty} onAdd={onAdd} onRemove={onRemove} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {limit < filtered.length && <div ref={sentinel} className="h-10" />}

      {cart.count > 0 && (
        <div className="fixed left-0 right-0 z-30 px-4" style={{ bottom: bottomOffset + 12 }}>
          <div className="max-w-xl mx-auto flex items-center gap-3 rounded-2xl p-2 pl-4" style={{ background: 'var(--bg2)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
            <Check size={18} className="text-[var(--link)] shrink-0" />
            <p className="flex-1 min-w-0 text-sm text-[var(--text)] truncate">
              {cart.count} {decorWord(cart.count)} на <span className="font-semibold num">{rub(cart.total)}</span>
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
