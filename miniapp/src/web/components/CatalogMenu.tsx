/**
 * src/web/components/CatalogMenu.tsx
 * Меню «Каталог» в шапке сайта — как на GGSel.
 *  • ПК: открывается только кликом. Слева разделы: донат (открыт по умолчанию), сервисы,
 *    ниже под чертой — ключи игр. Наведение/клик по разделу показывает справа его игры
 *    сеткой (самые продаваемые, с ценой «от»).
 *  • Телефон: CatalogMenuMobile + KeysMenuMobile — разделы списком внутри мобильного меню.
 * Данные — тот же запрос, что у страницы каталога (кэш общий).
 */

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { ArrowRight, ChevronDown, ChevronRight, Gamepad2, LayoutGrid } from '@/components/ui/icons'
import { catalogApi, type Game } from '@/api'
import { money } from '@/web/format'
import { normalizeImageUrl } from '@/utils/imageUrl'
import { onThumbError, thumbUrl } from '@/utils/thumb'
import { CATALOG_SECTIONS, KEYS_SECTION, catalogHref, sectionOf, type Section, type SectionId } from '@/web/catalogSections'

// сколько позиций показывать: донату — больше места
const TOP_N: Record<string, number> = { game: 24, service: 18, key: 18 }

function useCatalog() {
  return useQuery({ queryKey: ['web', 'games', 'all'], queryFn: () => catalogApi.getGames(), staleTime: 5 * 60_000 })
}

/** раздел → позиции: сначала самые продаваемые, при равенстве — рекомендованные */
function groups(all: Game[] | undefined, sections: Section[] = CATALOG_SECTIONS) {
  return sections.map((s) => {
    const items = (all ?? []).filter((g) => sectionOf(g) === s.id)
    const top = [...items].sort((a, b) =>
      (b.sold_count ?? 0) - (a.sold_count ?? 0) || Number(b.is_featured) - Number(a.is_featured)).slice(0, TOP_N[s.id] ?? 6)
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

/** Пункт левой колонки: наведение (мышь) или клик — показать раздел справа */
function SideItem({ section, count, active, onShow }: { section: Section; count: number; active: boolean; onShow: () => void }) {
  const { Icon } = section
  return (
    <button
      type="button"
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') onShow() }}
      onClick={onShow}
      onFocus={onShow}
      aria-current={active ? 'true' : undefined}
      className={'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors '
        + (active ? 'bg-[var(--bg3)] text-[var(--text)]' : 'text-[var(--text-2)] hover:bg-[var(--bg3)] hover:text-[var(--text)]')}
    >
      <span className={'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ' + (active ? 'text-[var(--link)]' : 'text-[var(--hint)]')}
            style={active ? { background: 'color-mix(in srgb, var(--accent) 16%, transparent)' } : undefined}>
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium truncate">{section.title}</span>
      {count > 0 && <span className="text-xs text-[var(--hint)] num">{count}</span>}
    </button>
  )
}

/** Правая часть: игры выбранного раздела сеткой */
function SectionPanel({ section, count, top, onPick }: { section: Section; count: number; top: Game[]; onPick: () => void }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <Link to={catalogHref(section.id)} onClick={onPick} className="text-lg font-semibold text-[var(--text)] hover:text-[var(--link)] transition-colors">
          {section.title}
        </Link>
        <Link to={catalogHref(section.id)} onClick={onPick}
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--link)] hover:text-[var(--text)] transition-colors shrink-0">
          Все {count} <ArrowRight size={14} />
        </Link>
      </div>
      <ul className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-0.5">
        {top.map((g) => (
          <li key={g.id} className="min-w-0">
            <Link to={`/game/${g.slug}`} onClick={onPick}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-[var(--bg3)] transition-colors">
              <Cover game={g} size={32} />
              <span className="min-w-0 flex-1 text-sm text-[var(--text-2)] truncate">{g.name}</span>
              {g.min_price != null && <span className="text-xs text-[var(--hint)] num shrink-0">от {money(g.min_price)}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Кнопка «Каталог» + выпадающая панель (только ПК). Открывается только кликом */
export default function CatalogMenu() {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState<SectionId>('game')
  const { pathname, search } = useLocation()
  const reduce = useReducedMotion()
  const { data: all } = useCatalog()
  const main = groups(all)
  const [keys] = groups(all, [KEYS_SECTION])
  const cur = [...main, ...(keys ? [keys] : [])].find((g) => g.section.id === shown) ?? main[0]

  // каждое открытие — с доната
  useEffect(() => { if (open) setShown('game') }, [open])
  // новая страница / Esc — закрыть
  useEffect(() => { setOpen(false) }, [pathname, search])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const active = pathname.startsWith('/catalog') || pathname.startsWith('/game/')
  const close = () => setOpen(false)

  return (
    <div>
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
              onClick={close}
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
              <div className="web-container py-6">
                {!cur ? (
                  <div className="grid gap-8" style={{ gridTemplateColumns: '290px 1fr' }} aria-hidden="true">
                    {[0, 1].map((i) => <div key={i} className="h-64 rounded-xl animate-pulse bg-[var(--bg3)]" />)}
                  </div>
                ) : (
                  <div className="grid gap-8" style={{ gridTemplateColumns: '290px minmax(0, 1fr)', minHeight: 420 }}>
                    {/* слева разделы, как на GGSel: донат и сервисы, ниже отдельно — ключи */}
                    <div className="flex flex-col gap-1 border-r border-[var(--border)] pr-6">
                      {main.map((g) => (
                        <SideItem key={g.section.id} section={g.section} count={g.count}
                                  active={cur.section.id === g.section.id} onShow={() => setShown(g.section.id)} />
                      ))}
                      {keys && (
                        <>
                          <div className="my-2 border-t border-[var(--border)]" />
                          <SideItem section={keys.section} count={keys.count} active={cur.section.id === 'key'} onShow={() => setShown('key')} />
                        </>
                      )}
                      <Link to="/catalog" onClick={close}
                            className="mt-auto pt-4 inline-flex items-center gap-2 px-3 text-sm font-medium text-[var(--link)] hover:text-[var(--text)] transition-colors">
                        <LayoutGrid size={16} /> Весь каталог
                      </Link>
                    </div>
                    <SectionPanel key={cur.section.id} {...cur} onPick={close} />
                  </div>
                )}
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
      {(cols.length ? cols : CATALOG_SECTIONS.map((s) => ({ section: s, count: 0, top: [] as Game[] }))).map(({ section, count }) => {
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

/** «Ключи игр» в мобильном меню — в «Каталоге», под чертой, отдельно от доната и сервисов */
export function KeysMenuMobile({ onPick }: { onPick: () => void }) {
  const { data: all } = useCatalog()
  const [g] = groups(all, [KEYS_SECTION])
  if (!g) return null
  const { Icon } = KEYS_SECTION
  return (
    <>
      <div className="my-1 border-t border-[var(--border)]" />
      <Link to={catalogHref('key')} onClick={onPick}
            className="flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 hover:bg-[var(--bg2)] transition-colors">
        <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-[var(--bg2)] text-[var(--text-2)]">
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-[var(--text)]">{KEYS_SECTION.title}</span>
          <span className="block text-xs text-[var(--hint)] truncate">{KEYS_SECTION.hint}</span>
        </span>
        <span className="text-xs text-[var(--hint)] num">{g.count}</span>
        <ChevronRight size={16} className="text-[var(--hint)]" />
      </Link>
    </>
  )
}
