/**
 * src/web/pages/WebCatalogPage.tsx
 * Полный каталог сайта: вкладки «Донат / Сервисы» (?type=service), поиск (?q=) — по обоим сразу.
 * Ключи игр (?type=key) — отдельная страница: свой заголовок, без вкладок, поиск только по ключам.
 */

import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Search, X } from '@/components/ui/icons'
import { catalogApi } from '@/api'
import type { Game } from '@/api'
import GameCard from '@/web/components/GameCard'
import { filterGames } from '@/web/gameMatch'
import { Reveal, Stagger, StaggerItem } from '@/web/components/Motion'
import { usePageMeta } from '@/web/seo'
import RequestCta from '@/web/components/RequestCta'
import { CATALOG_SECTIONS, KEYS_SECTION, catalogHref, sectionById, sectionFromParam, sectionOf, type SectionId } from '@/web/catalogSections'

const GRID = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4'

function Grid({ title, items }: { title: string; items: Game[] }) {
  if (!items.length) return null
  return (
    <section className="mb-12">
      <Reveal>
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-[var(--text)] mb-5">
          {title} <span className="text-[var(--hint)] font-normal text-base num">{items.length}</span>
        </h2>
      </Reveal>
      <Stagger className={GRID}>
        {items.map((g) => <StaggerItem key={g.id}><GameCard game={g} /></StaggerItem>)}
      </Stagger>
    </section>
  )
}

export default function WebCatalogPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const tab: SectionId = sectionFromParam(params.get('type'))
  const keysPage = tab === 'key'
  usePageMeta({
    title: tab === 'key' ? 'Ключи игр — Steam, Xbox, Rockstar' : tab === 'service' ? 'Пополнение сервисов' : 'Каталог игр и сервисов',
    description: 'Донат в играх, ключи игр и пополнение цифровых сервисов в reDonate: внутриигровая валюта, наборы, подписки и лицензионные ключи. Оплата через СБП, банковской картой или криптовалютой.',
  })
  const { data: all, isLoading, isError } = useQuery({
    queryKey: ['web', 'games', 'all'],
    queryFn: () => catalogApi.getGames(),
    staleTime: 5 * 60_000,
  })

  const { data: trending = [] } = useQuery({
    queryKey: ['web', 'trending-categories'],
    queryFn: catalogApi.getTrendingCategories,
    staleTime: 5 * 60_000,
  })
  // Популярные запросы: игры из трендов + рекомендованные (без повторов)
  const popular = [...new Map(
    [...trending.map((t) => [t.game_slug, t.game_name] as const),
     ...(all ?? []).filter((g) => g.is_featured).map((g) => [g.slug, g.name] as const)],
  ).entries()].slice(0, 8)

  // на странице ключей ищем только ключи, в каталоге — донат и сервисы
  const found = filterGames((all ?? []).filter((g) => (sectionOf(g) === 'key') === keysPage), q)
  const bySection = (id: SectionId) => found.filter((g) => sectionOf(g) === id)

  const setQ = (v: string) => setParams((prev) => {
    const n = new URLSearchParams(prev)
    if (v) n.set('q', v); else n.delete('q')
    return n
  }, { replace: true })
  const setTab = (t: SectionId) => setParams((prev) => {
    const n = new URLSearchParams(prev)
    if (t === 'game') n.delete('type'); else n.set('type', t)
    return n
  }, { replace: true })
  const tabCount = Object.fromEntries([...CATALOG_SECTIONS, KEYS_SECTION].map((s) => [s.id, (all ?? []).filter((g) => sectionOf(g) === s.id).length])) as Record<SectionId, number>
  const tabs = CATALOG_SECTIONS.filter((s) => tabCount[s.id] > 0)

  return (
    <div className="web-container py-10 md:py-14">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-3xl md:text-4xl text-[var(--text)]" style={{ margin: 0 }}>{keysPage ? KEYS_SECTION.title : 'Каталог'}</h1>
          <p className="text-sm text-[var(--hint)] mt-2">
            {keysPage
              ? 'Лицензионные ключи для Steam, Xbox, Rockstar и EA — с активацией в России, ключ приходит сразу после оплаты.'
              : 'Донат в играх и пополнение сервисов: внутриигровая валюта, наборы, боевые пропуски и подарочные карты. Многие товары — с автовыдачей сразу после оплаты.'}
          </p>
        </div>
        <label className="flex items-center gap-2 w-full sm:w-80 h-12 px-4 rounded-xl bg-[var(--bg2)] border border-transparent focus-within:border-[var(--accent)] transition-colors">
          <Search size={18} className="text-[var(--hint)] shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={keysPage ? 'Поиск по ключам' : 'Поиск в каталоге'}
            aria-label={keysPage ? 'Поиск по ключам' : 'Поиск в каталоге'}
            className="ym-record-keys flex-1 min-w-0 bg-transparent outline-none text-sm text-[var(--text)] placeholder:text-[var(--hint)]"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="Очистить" className="text-[var(--hint)] hover:text-[var(--text)]">
              <X size={18} />
            </button>
          )}
        </label>
      </div>

      {/* Донат / Ключи игр / Сервисы — сразу под заголовком; ссылки (для поисковиков), а не только кнопки */}
      {!q && !keysPage && (tabs.length > 1 || tabCount.key > 0) && (
        <div className="-mt-4 mb-8 flex flex-wrap items-center justify-between gap-3">
        {tabs.length > 1 && <div className="flex max-w-full overflow-x-auto no-scrollbar">
          <div className="inline-flex rounded-xl bg-[var(--bg2)] p-1 shrink-0" role="tablist" aria-label="Раздел каталога">
            {tabs.map(({ id, label, Icon }) => (
              <Link
                key={id}
                to={catalogHref(id)}
                replace
                role="tab"
                aria-selected={tab === id}
                onClick={(e) => { e.preventDefault(); setTab(id) }}
                className={'h-10 px-4 sm:px-5 inline-flex items-center gap-2 rounded-lg text-[15px] font-semibold whitespace-nowrap transition-colors ' + (tab === id ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-2)] hover:text-[var(--text)]')}
              >
                <Icon size={17} />
                {label}
                <span className={'text-sm font-normal num ' + (tab === id ? 'text-white/70' : 'text-[var(--hint)]')}>{tabCount[id]}</span>
              </Link>
            ))}
          </div>
        </div>}
        {tabCount.key > 0 && (
          <Link to={catalogHref('key')}
                className="h-12 px-4 inline-flex items-center gap-2 rounded-xl text-[15px] font-semibold text-[var(--text)] bg-[var(--bg2)] hover:bg-[var(--bg3)] transition-colors">
            <KEYS_SECTION.Icon size={17} className="text-[var(--link)]" />
            {KEYS_SECTION.title}
            <span className="text-sm font-normal num text-[var(--hint)]">{tabCount.key}</span>
            <ArrowRight size={16} className="text-[var(--hint)]" />
          </Link>
        )}
        </div>
      )}
      {keysPage && !q && (
        <Link to="/catalog" className="-mt-6 mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--link)] hover:text-[var(--text)] transition-colors">
          <ArrowLeft size={15} /> Донат и сервисы
        </Link>
      )}

      {!q && !keysPage && (popular.length > 0 || isLoading) && (
        <div className="-mt-4 mb-10 flex flex-wrap items-center gap-2 min-h-8">
          <span className="text-sm text-[var(--hint)] mr-1">Часто ищут:</span>
          {popular.map(([slug, name]) => (
            <Link key={slug} to={`/game/${slug}`} className="h-8 px-3 inline-flex items-center rounded-lg text-sm text-[var(--text-2)] bg-[var(--bg2)] hover:bg-[var(--bg3)] hover:text-[var(--text)] transition-colors">
              {name}
            </Link>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className={GRID}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-square rounded-2xl animate-pulse bg-[var(--bg2)]" />
              <div className="h-3.5 w-2/3 rounded mt-3 animate-pulse bg-[var(--bg2)]" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-[var(--hint)] py-16 text-center">Не удалось загрузить каталог — обновите страницу</p>
      ) : found.length === 0 ? (
        <div className="py-12">
          <p className="text-base text-[var(--text-2)] text-center mb-8">
            {q ? `По запросу «${q}» ничего не нашлось. Проверьте написание или оставьте заявку — добавим игру.` : 'Каталог пока пуст'}
          </p>
          <RequestCta query={q} />
        </div>
      ) : (
        <>
          {q ? (
            (keysPage ? [KEYS_SECTION] : CATALOG_SECTIONS).map((s) => <Grid key={s.id} title={s.title} items={bySection(s.id)} />)
          ) : (
            <Grid key={tab} title={sectionById(tab).title} items={bySection(tab)} />
          )}
          <RequestCta query={q} />
        </>
      )}
    </div>
  )
}
