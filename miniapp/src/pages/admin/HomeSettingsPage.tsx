/**
 * src/pages/admin/HomeSettingsPage.tsx
 * Главная сайта: баннеры карусели первого экрана (до 8; если есть — вместо обложек),
 * какие игры в обложках первого экрана (до 6) и какие разделы
 * в блоке «Популярное» (до 8), в каком порядке. Пусто — блок заполняется
 * автоматически (первые игры каталога / разделы по заказам за 3 дня).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ChevronRight, Eye, EyeOff, Gamepad2, ImagePlus, X } from '@/components/ui/icons'
import { adminApi, type AdminCategory, type AdminGame } from '@/api/admin'
import type { HomeBanner } from '@/api'
import { normalizeImageUrl } from '@/utils/imageUrl'

const HERO_MAX = 6
const POPULAR_MAX = 8
const BANNERS_MAX = 8

const inputCls =
  'w-full bg-[var(--bg2)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none focus:border-[var(--accent)]'

const selectCls =
  'w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]'

function moveItem<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/** Строка списка: картинка, название, стрелки порядка, удалить */
function Row({ img, title, sub, onUp, onDown, onRemove, first, last }: {
  img?: string | null; title: string; sub?: string
  onUp: () => void; onDown: () => void; onRemove: () => void; first: boolean; last: boolean
}) {
  const btn = 'w-8 h-8 rounded-lg flex items-center justify-center text-[var(--hint)] hover:text-[var(--text)] hover:bg-[var(--bg3)] disabled:opacity-30 transition-colors'
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[var(--bg)]">
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--bg3)] shrink-0 flex items-center justify-center">
        {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <Gamepad2 size={18} className="text-[var(--hint)]" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text)] truncate">{title}</p>
        {sub && <p className="text-xs text-[var(--hint)] truncate">{sub}</p>}
      </div>
      <button type="button" className={btn} disabled={first} onClick={onUp} aria-label="Выше"><ChevronRight size={16} style={{ transform: 'rotate(-90deg)' }} /></button>
      <button type="button" className={btn} disabled={last} onClick={onDown} aria-label="Ниже"><ChevronRight size={16} style={{ transform: 'rotate(90deg)' }} /></button>
      <button type="button" className={btn} onClick={onRemove} aria-label="Убрать"><X size={16} /></button>
    </div>
  )
}

/** Баннер карусели: картинка 16:9, тексты, ссылка, вкл/выкл, порядок */
function BannerRow({ b, onChange, onUp, onDown, onRemove, first, last }: {
  b: HomeBanner; onChange: (b: HomeBanner) => void
  onUp: () => void; onDown: () => void; onRemove: () => void; first: boolean; last: boolean
}) {
  const btn = 'w-8 h-8 rounded-lg flex items-center justify-center text-[var(--hint)] hover:text-[var(--text)] hover:bg-[var(--bg3)] disabled:opacity-30 transition-colors'
  const set = (k: keyof HomeBanner) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...b, [k]: e.target.value })
  return (
    <div className={'p-3 rounded-xl bg-[var(--bg)] space-y-2 ' + (b.is_active ? '' : 'opacity-60')}>
      <div className="flex items-start gap-3">
        <img src={normalizeImageUrl(b.image_url) ?? b.image_url} alt="" className="w-32 aspect-[16/9] rounded-lg object-cover bg-[var(--bg3)] shrink-0" />
        <div className="flex-1" />
        <button type="button" className={btn} onClick={() => onChange({ ...b, is_active: !b.is_active })}
          aria-label={b.is_active ? 'Скрыть' : 'Показать'} title={b.is_active ? 'Показывается — скрыть' : 'Скрыт — показать'}>
          {b.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
        <button type="button" className={btn} disabled={first} onClick={onUp} aria-label="Выше"><ChevronRight size={16} style={{ transform: 'rotate(-90deg)' }} /></button>
        <button type="button" className={btn} disabled={last} onClick={onDown} aria-label="Ниже"><ChevronRight size={16} style={{ transform: 'rotate(90deg)' }} /></button>
        <button type="button" className={btn} onClick={onRemove} aria-label="Удалить"><X size={16} /></button>
      </div>
      <input className={inputCls} value={b.title} onChange={set('title')} maxLength={120} placeholder="Заголовок, напр. «Хэллоуин в RF Online»" />
      <input className={inputCls} value={b.subtitle} onChange={set('subtitle')} maxLength={240} placeholder="Подзаголовок (необязательно)" />
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <input className={inputCls} value={b.button} onChange={set('button')} maxLength={40} placeholder="Кнопка" />
        <input className={inputCls} value={b.link} onChange={set('link')} maxLength={500} placeholder="Ссылка: /game/rf-online" />
      </div>
    </div>
  )
}

export default function HomeSettingsPage() {
  const [games, setGames] = useState<AdminGame[]>([])
  const [hero, setHero] = useState<string[]>([])
  const [popular, setPopular] = useState<string[]>([])
  const [banners, setBanners] = useState<HomeBanner[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [catsByGame, setCatsByGame] = useState<Record<string, AdminCategory[]>>({})
  const [catGame, setCatGame] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games])
  const catById = useMemo(() => {
    const m = new Map<string, AdminCategory>()
    Object.values(catsByGame).flat().forEach((c) => m.set(c.id, c))
    return m
  }, [catsByGame])

  const loadCats = async (gameIds: string[]) => {
    const missing = gameIds.filter((id) => !catsByGame[id])
    if (!missing.length) return
    const loaded = await Promise.all(missing.map((id) => adminApi.getCategories(id).then((c) => [id, c] as const)))
    setCatsByGame((prev) => ({ ...prev, ...Object.fromEntries(loaded) }))
  }

  useEffect(() => {
    Promise.all([adminApi.getGames(), adminApi.getHomeBlocks()])
      .then(async ([g, cfg]) => {
        setGames(g)
        setHero(cfg.hero_game_ids)
        setPopular(cfg.popular_category_ids)
        setBanners(cfg.banners ?? [])
        // Разделы из «Популярного» — чтобы показать их названия, грузим категории всех игр
        if (cfg.popular_category_ids.length) await loadCats(g.map((x) => x.id))
      })
      .catch(() => toast.error('Не удалось загрузить настройки главной'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const cfg = await adminApi.updateHomeBlocks({ hero_game_ids: hero, popular_category_ids: popular, banners })
      setHero(cfg.hero_game_ids)
      setPopular(cfg.popular_category_ids)
      setBanners(cfg.banners ?? [])
      toast.success('Главная сохранена')
    } catch {
      toast.error('Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  const addBanner = async (file: File) => {
    setUploading(true)
    try {
      const { url } = await adminApi.uploadImage(file)
      setBanners((prev) => [...prev, { image_url: url, title: '', subtitle: '', button: '', link: '', is_active: true }])
    } catch {
      toast.error('Не удалось загрузить картинку')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (loading) return <p className="text-[var(--hint)] text-sm py-8 text-center">Загрузка...</p>

  const activeGames = games.filter((g) => g.is_active)
  const heroCandidates = activeGames.filter((g) => !hero.includes(g.id))
  const catOptions = (catsByGame[catGame] ?? []).filter((c) => c.is_active && !c.parent_id && !popular.includes(c.id))

  return (
    <div className="space-y-4 pb-8 max-w-lg">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.15)', color: 'var(--link)' }}>
          <Gamepad2 size={20} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[var(--text)]">Главная сайта</h1>
          <p className="text-xs text-[var(--hint)]">Какие игры и разделы показывать в блоках главной redonate.gg</p>
        </div>
      </div>

      {/* Баннеры карусели */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">Баннеры на первом экране</p>
          <p className="text-xs text-[var(--hint)] mt-0.5">
            До {BANNERS_MAX}, листаются сами каждые 6 секунд. Картинка 16:9 (лучше 1600×900), текст пишется поверх
            внизу слева — оставьте там место. Есть хоть один показанный баннер — карусель стоит вместо обложек.
          </p>
        </div>
        <div className="space-y-2">
          {banners.map((b, i) => (
            <BannerRow
              key={b.image_url + i}
              b={b}
              first={i === 0} last={i === banners.length - 1}
              onChange={(nb) => setBanners(banners.map((x, k) => (k === i ? nb : x)))}
              onUp={() => setBanners(moveItem(banners, i, -1))}
              onDown={() => setBanners(moveItem(banners, i, 1))}
              onRemove={() => setBanners(banners.filter((_, k) => k !== i))}
            />
          ))}
        </div>
        {banners.length < BANNERS_MAX && (
          <>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) addBanner(f) }} />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--text-2)] hover:text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-60 transition-colors"
            >
              <ImagePlus size={16} /> {uploading ? 'Загрузка…' : 'Добавить баннер'}
            </button>
          </>
        )}
      </div>

      {/* Обложки первого экрана */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">Обложки на первом экране</p>
          <p className="text-xs text-[var(--hint)] mt-0.5">
            До {HERO_MAX} игр, по порядку. На телефоне видны первые 3. Пусто — первые игры каталога с обложкой.
            {banners.some((b) => b.is_active) && ' Сейчас не видны: на их месте карусель баннеров.'}
          </p>
        </div>
        <div className="space-y-1.5">
          {hero.map((id, i) => {
            const g = gameById.get(id)
            return (
              <Row
                key={id}
                img={g?.image_url}
                title={g?.name ?? 'Игра удалена'}
                sub={g && !g.is_active ? 'выключена — на сайте не показывается' : undefined}
                first={i === 0} last={i === hero.length - 1}
                onUp={() => setHero(moveItem(hero, i, -1))}
                onDown={() => setHero(moveItem(hero, i, 1))}
                onRemove={() => setHero(hero.filter((x) => x !== id))}
              />
            )
          })}
        </div>
        {hero.length < HERO_MAX && (
          <select
            className={selectCls}
            value=""
            onChange={(e) => { if (e.target.value) setHero([...hero, e.target.value]) }}
            aria-label="Добавить игру в обложки"
          >
            <option value="">+ Добавить игру</option>
            {heroCandidates.map((g) => <option key={g.id} value={g.id}>{g.name}{g.image_url ? '' : ' (без обложки)'}</option>)}
          </select>
        )}
      </div>

      {/* Популярное */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">Блок «Популярное»</p>
          <p className="text-xs text-[var(--hint)] mt-0.5">
            До {POPULAR_MAX} разделов, по порядку. Пусто — разделы с заказами за 3 дня или закреплённые.
          </p>
        </div>
        <div className="space-y-1.5">
          {popular.map((id, i) => {
            const c = catById.get(id)
            const g = c ? gameById.get(c.game_id) : undefined
            return (
              <Row
                key={id}
                img={g?.image_url}
                title={c?.name ?? 'Раздел'}
                sub={g?.name}
                first={i === 0} last={i === popular.length - 1}
                onUp={() => setPopular(moveItem(popular, i, -1))}
                onDown={() => setPopular(moveItem(popular, i, 1))}
                onRemove={() => setPopular(popular.filter((x) => x !== id))}
              />
            )
          })}
        </div>
        {popular.length < POPULAR_MAX && (
          <div className="grid grid-cols-2 gap-2">
            <select
              className={selectCls}
              value={catGame}
              onChange={(e) => { setCatGame(e.target.value); if (e.target.value) loadCats([e.target.value]).catch(() => toast.error('Не удалось загрузить разделы')) }}
              aria-label="Игра"
            >
              <option value="">Игра…</option>
              {activeGames.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select
              className={selectCls}
              value=""
              disabled={!catGame}
              onChange={(e) => { if (e.target.value) setPopular([...popular, e.target.value]) }}
              aria-label="Раздел"
            >
              <option value="">{catGame ? '+ Раздел' : 'Сначала игра'}</option>
              {catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--btn-hover)] disabled:opacity-60 text-sm font-semibold text-[var(--text)] transition-all active:scale-[0.97]"
      >
        {saving ? 'Сохранение...' : 'Сохранить'}
      </button>
      <p className="text-xs text-[var(--hint)] text-center">На сайте изменения видны в течение 5 минут.</p>
    </div>
  )
}
