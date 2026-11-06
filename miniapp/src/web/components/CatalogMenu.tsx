/**
 * src/web/components/CatalogMenu.tsx
 * Меню «Каталог» в шапке сайта.
 *  • ПК: панель на всю ширину под шапкой — три колонки разделов (донат, ключи игр,
 *    сервисы): иконка, число, подпись и самые продаваемые позиции с обложкой и ценой «от».
 *    Открывается наведением (с задержкой, чтобы не мигало при проходе мышью) и кликом.
 *  • Телефон: CatalogMenuMobile — разделы списком внутри мобильного меню.
 * Данные — тот же запрос, что у страницы каталога (кэш общий).
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { ArrowRight, ChevronDown, ChevronRight, Gamepad2, LayoutGrid } from '@/components/ui/icons'
import { catalogApi, type Game } from '@/api'
import { money } from '@/web/format'
import { normalizeImageUrl } from '@/utils/imageUrl'
import { onThumbError, thumbUrl } from '@/utils/thumb'
import { SECTIONS, catalogHref, sectionOf, type Section } from '@/web/catalogSections'

const TOP_N = 6

function useCatalog() {
  return useQuery({ queryKey: ['web', 'games', 'all'], queryFn: () => catalogApi.getGames(), staleTime: 5 * 60_000 })
}

/** раздел → позиции: сначала самые продаваемые, при равенстве — рекомендованные */
function groups(all: Game[] | undefined) {
  return SECTIONS.map((s) => {
    const items = (all ?? []).filter((g) => sectionOf(g) === s.id)
    const top = [...items].sort((a, b) =>
      (b.sold_count ?? 0) - (a.sold_count ?? 0) || Number(b.is_featured) - Number(a.is_featured)).slice(0, TOP_N)
    return { section: s, count: items.length, top }
  }).filter((g) => g.count > 0)
}

function Cover({ game, size }: { game: Game; size: number }) {
  const img = game.image_url ? normalizeImageUrl(game.image_url) ?? game.image_url : null
  return (
    <span
      className="shrink-0 rounded-lg overflow-hidden bg-[var(--bg3)] flex items-center justify-center"
      style={{ width: size, height: size, boxShadow: 'inset 0 0 0 1px var(--border)' }}
    >
      {img ? (
        <img src={thumbUrl(img, 320) ?? img} onError={onThumbError(img)} alt="" width={size} height={size}
             loading="lazy" decoding="async" className="w-full h-full object-cover" />
      ) : <Gamepad2 size={size * 0.5} className="text-[var(--hint)]" />}
    </span>
  )
}

function SectionColumn({ section, count, top, onPick }: { section: Section; count: number; top: Game[]; onPick: () => void }) {
  const { Icon } = section
  return (
    <div className="min-w-0 flex flex-col">
      <Link to={catalogHref(section.id)} onClick={onPick} className="group flex items-start gap-3 rounded-xl p-2 -m-2 mb-2 hover:bg-[var(--bg3)] transition-colors">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-[var(--link)]"
              style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)' }}>
          <Icon size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold text-[var(--text)]">{section.title}</span>
            <span className="text-xs text-[var(--hint)] num">{count}</span>
          </span>
          <span className="block text-xs text-[var(--hint)] mt-0.5 leading-snug">{section.hint}</span>
        </span>
      </Link>
      <ul className="flex flex-col">
        {top.map((g) => (
          <li key={g.id}>
            <Link to={`/game/${g.slug}`} onClick={onPick}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-[var(--bg3)] transition-colors">
              <Cover game={g} size={32} />
              <span className="min-w-0 flex-1 text-sm text-[var(--text-2)] truncate">{g.name}</span>
              {g.min_price != null && <span className="text-xs text-[var(--hint)] num shrink-0">от {money(g.min_price)}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {count > top.length && (
        <Link to={catalogHref(section.id)} onClick={onPick}
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[var(--link)] hover:text-[var(--text)] transition-colors self-start">
          Все {count} <ArrowRight size={14} />
        </Link>
      )}
    </div>
  )
}

/** Кнопка «Каталог» + выпадающая панель (только ПК) */
export default function CatalogMenu() {
  const [open, setOpen] = useState(false)
  const timer = useRef<number>()
  const { pathname, search } = useLocation()
  const reduce = useReducedMotion()
  const { data: all } = useCatalog()
  const cols = groups(all)

  // новая страница / Esc — закрыть
  useEffect(() => { setOpen(false) }, [pathname, search])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const hover = (v: boolean, ms: number) => (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return   // на тачскрине — только клик
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(v), ms)
  }
  const active = pathname.startsWith('/catalog') || pathname.startsWith('/game/')

  return (
    <div onPointerEnter={hover(true, 90)} onPointerLeave={hover(false, 160)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={'inline-flex items-center gap-1 h-16 text-sm whitespace-nowrap transition-colors '
          + (open || active ? 'text-[var(--text)]' : 'text-[var(--text-2)] hover:text-[var(--text)]')}
      >
        Каталог
        <ChevronDown size={14} className={'transition-transform duration-200 ' + (open ? 'rotate-180' : '')} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* затемнение страницы под панелью — клик закрывает */}
            <m.div
              key="catalog-dim"
              aria-hidden="true"
              className="fixed inset-x-0 bottom-0 top-16 z-30"
              style={{ background: 'rgba(0,0,0,0.35)' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setOpen(false)}
            />
            <m.div
              key="catalog-panel"
              className="absolute inset-x-0 top-16 z-40 border-b border-[var(--border)] shadow-2xl"
              style={{ background: 'var(--bg2)' }}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="web-container py-7">
                {cols.length === 0 ? (
                  <div className="grid grid-cols-3 gap-8" aria-hidden="true">
                    {[0, 1, 2].map((i) => <div key={i} className="h-64 rounded-xl animate-pulse bg-[var(--bg3)]" />)}
                  </div>
                ) : (
                  <div className="grid gap-8 lg:gap-12" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
                    {cols.map((c) => <SectionColumn key={c.section.id} {...c} onPick={() => setOpen(false)} />)}
                  </div>
                )}
                <div className="mt-7 pt-5 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-[var(--hint)]">Автовыдача — коды и ключи приходят сразу после оплаты</span>
                  <Link to="/catalog" onClick={() => setOpen(false)}
                        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors">
                    <LayoutGrid size={16} /> Весь каталог
                  </Link>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Разделы каталога в мобильном меню */
export function CatalogMenuMobile({ onPick }: { onPick: () => void }) {
  const { data: all } = useCatalog()
  const cols = groups(all)
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-[var(--hint)] mb-1">Каталог</span>
      {(cols.length ? cols : SECTIONS.map((s) => ({ section: s, count: 0, top: [] as Game[] }))).map(({ section, count }) => {
        const { Icon } = section
        return (
          <Link key={section.id} to={catalogHref(section.id)} onClick={onPick}
                className="flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 hover:bg-[var(--bg2)] transition-colors">
            <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[var(--link)]"
                  style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)' }}>
              <Icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-[var(--text)]">{section.title}</span>
              <span className="block text-xs text-[var(--hint)] truncate">{section.hint}</span>
            </span>
            {count > 0 && <span className="text-xs text-[var(--hint)] num">{count}</span>}
            <ChevronRight size={16} className="text-[var(--hint)]" />
          </Link>
        )
      })}
    </div>
  )
}
