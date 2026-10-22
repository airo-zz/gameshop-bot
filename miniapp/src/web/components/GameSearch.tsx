/**
 * src/web/components/GameSearch.tsx
 * Поиск игр с подсказками: при вводе выпадают совпадения из каталога
 * (стрелки ↑/↓, Enter — открыть, Esc — закрыть). Enter без выбора — /catalog?q=.
 */
import { useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Search } from '@/components/ui/icons'
import { catalogApi } from '@/api'
import { normalizeImageUrl } from '@/utils/imageUrl'
import { onThumbError, thumbSrcSet, thumbUrl } from '@/utils/thumb'
import { prefetchGame } from '@/web/prefetch'

export default function GameSearch({ size = 'md', placeholder = 'Найти игру', className = '' }: {
  size?: 'md' | 'lg'
  placeholder?: string
  className?: string
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const listId = useId()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const blurTimer = useRef<number>()

  const { data: games = [] } = useQuery({
    queryKey: ['web', 'games', 'all'],
    queryFn: () => catalogApi.getGames(),
    staleTime: 5 * 60_000,
  })

  const { data: trending = [] } = useQuery({
    queryKey: ['web', 'trending-categories'],
    queryFn: catalogApi.getTrendingCategories,
    staleTime: 5 * 60_000,
  })

  // Пустой запрос — «популярное»: игры из трендов, рекомендованные, затем по порядку каталога
  const popular = useMemo(() => {
    const bySlug = new Map(games.map((g) => [g.slug, g]))
    const out: typeof games = []
    const push = (g?: (typeof games)[number]) => { if (g && !out.includes(g)) out.push(g) }
    trending.forEach((t) => push(bySlug.get(t.game_slug)))
    games.filter((g) => g.is_featured).forEach(push)
    games.forEach((g) => out.length < 6 && push(g))
    return out.slice(0, 6)
  }, [games, trending])

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return popular
    return games
      .filter((g) => g.name.toLowerCase().includes(s))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(s)) - Number(!b.name.toLowerCase().startsWith(s)))
      .slice(0, 6)
  }, [games, q, popular])

  const go = (slug?: string) => {
    setOpen(false)
    if (slug) { setQ(''); navigate(`/game/${slug}`); return }
    navigate(q.trim() ? `/catalog?q=${encodeURIComponent(q.trim())}` : '/catalog')
  }

  const lg = size === 'lg'
  const showList = open && (q.trim().length > 0 || popular.length > 0)

  return (
    <div className={'relative ' + className}>
      <form
        role="search"
        onSubmit={(e) => { e.preventDefault(); go(active >= 0 ? matches[active]?.slug : undefined) }}
        className={
          'flex items-center gap-2 rounded-xl bg-[var(--bg2)] border border-transparent focus-within:border-[var(--accent)] transition-colors ' +
          (lg ? 'h-14 pl-4 pr-2 rounded-2xl' : 'h-10 px-3')
        }
      >
        <Search size={lg ? 20 : 18} className="text-[var(--hint)] shrink-0" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1) }}
          onFocus={() => { window.clearTimeout(blurTimer.current); setOpen(true) }}
          onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 120) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, -1)) }
            else if (e.key === 'Escape') { setOpen(false) }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          className={'flex-1 min-w-0 bg-transparent outline-none text-[var(--text)] placeholder:text-[var(--hint)] ' + (lg ? 'text-base' : 'text-sm')}
        />
        {lg && (
          <button type="submit" className="h-10 px-4 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors">
            Найти
          </button>
        )}
      </form>

      <AnimatePresence>
        {showList && (
          <motion.ul
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl bg-[var(--bg2)] p-1.5 border border-[var(--border)]"
            style={{ boxShadow: '0 12px 32px rgba(0,0,0,0.45)' }}
          >
            {!q.trim() && <li className="px-3 pt-2 pb-1 text-xs text-[var(--hint)]">Популярное</li>}
            {matches.length === 0 ? (
              <li className="px-3 py-3 text-sm text-[var(--hint)]">
                Такой игры пока нет.{' '}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setOpen(false); navigate(`/request?type=missing_game&game=${encodeURIComponent(q.trim())}`) }}
                  className="text-[var(--link)] hover:text-[var(--text)]"
                >
                  Оставить заявку
                </button>
              </li>
            ) : matches.map((g, i) => {
              const img = g.image_url ? normalizeImageUrl(g.image_url) ?? g.image_url : null
              return (
                <li key={g.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => { setActive(i); prefetchGame(qc, g.slug) }}
                    onClick={() => go(g.slug)}
                    className={'w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left transition-colors ' + (i === active ? 'bg-[var(--bg3)]' : '')}
                  >
                    <span className="w-9 h-9 rounded-lg overflow-hidden bg-[var(--bg3)] shrink-0">
                      {img && <img src={thumbUrl(img, 320) ?? img} onError={onThumbError(img)} alt="" className="w-full h-full object-cover" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[var(--text)] truncate">{g.name}</span>
                      <span className="block text-xs text-[var(--hint)]">{g.type === 'service' ? 'Сервис' : 'Игра'}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
