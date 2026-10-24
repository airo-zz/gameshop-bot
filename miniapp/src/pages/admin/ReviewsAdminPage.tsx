/**
 * src/pages/admin/ReviewsAdminPage.tsx
 * Отзывы: все источники (сайт/миниапп и GGSEL), фильтры, скрыть/показать.
 * Новые отзывы с GGSEL подтягиваются сами каждые 3 часа (worker), кнопка — сразу.
 */

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Loader2, RefreshCw, ThumbsDown, ThumbsUp } from '@/components/ui/icons'
import { adminApi, type AdminReview } from '@/api/admin'
import type { ReviewKind } from '@/api'
import { fmtReviewDate } from '@/components/reviews/Reviews'

const LIMIT = 50

const chip = (active: boolean) =>
  'h-9 px-3.5 rounded-xl text-sm whitespace-nowrap transition-colors ' +
  (active ? 'bg-[var(--bg3)] text-[var(--text)] font-medium' : 'bg-[var(--bg2)] text-[var(--hint)] hover:text-[var(--text-2)]')

type Source = '' | 'site' | 'ggsel'
type Hidden = '' | 'visible' | 'hidden'

export default function ReviewsAdminPage() {
  const [source, setSource] = useState<Source>('')
  const [kind, setKind] = useState<ReviewKind>('all')
  const [hidden, setHidden] = useState<Hidden>('')
  const [items, setItems] = useState<AdminReview[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (offset = 0) => {
    setLoading(true)
    try {
      const r = await adminApi.getReviews({
        source: source || undefined,
        kind,
        hidden: hidden === '' ? undefined : hidden === 'hidden',
        offset,
        limit: LIMIT,
      })
      setItems((prev) => (offset ? [...prev, ...r.items] : r.items))
      setTotal(r.total)
    } catch {
      toast.error('Не удалось загрузить отзывы')
    } finally {
      setLoading(false)
    }
  }, [source, kind, hidden])

  useEffect(() => { load(0) }, [load])

  async function toggle(r: AdminReview) {
    setBusyId(r.id)
    try {
      const upd = await adminApi.setReviewVisible(r.id, !r.is_visible)
      setItems((prev) => prev.map((x) => (x.id === r.id ? upd : x)))
      toast.success(upd.is_visible ? 'Отзыв снова виден' : 'Отзыв скрыт')
    } catch {
      toast.error('Не удалось изменить отзыв')
    } finally {
      setBusyId(null)
    }
  }

  async function sync() {
    setSyncing(true)
    try {
      const r = await adminApi.syncGgselReviews()
      toast.success(r.added ? `С GGSEL загружено новых: ${r.added}` : 'Новых отзывов на GGSEL нет')
      load(0)
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail ?? 'GGSEL не ответил')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--hint)]">
          Всего по фильтру: <span className="text-[var(--text)] num">{total.toLocaleString('ru-RU')}</span>
        </p>
        <button
          type="button"
          onClick={sync}
          disabled={syncing}
          className="h-10 px-4 rounded-xl bg-[var(--bg2)] hover:bg-[var(--bg3)] text-sm font-medium text-[var(--text)] inline-flex items-center gap-2 transition-colors disabled:opacity-60"
        >
          {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Загрузить с GGSEL
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {([['', 'Все источники'], ['site', 'Сайт и Telegram'], ['ggsel', 'GGSEL']] as const).map(([v, l]) => (
          <button key={v} type="button" className={chip(source === v)} onClick={() => setSource(v)}>{l}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {([['all', 'Все'], ['text', 'С текстом'], ['positive', 'Положительные'], ['negative', 'Отрицательные']] as const).map(([v, l]) => (
          <button key={v} type="button" className={chip(kind === v)} onClick={() => setKind(v)}>{l}</button>
        ))}
        <span className="w-px bg-[var(--border)] mx-1" />
        {([['', 'Любые'], ['visible', 'Видимые'], ['hidden', 'Скрытые']] as const).map(([v, l]) => (
          <button key={v} type="button" className={chip(hidden === v)} onClick={() => setHidden(v)}>{l}</button>
        ))}
      </div>

      <div className="space-y-2">
        {items.map((r) => {
          const Thumb = r.positive ? ThumbsUp : ThumbsDown
          return (
            <div
              key={r.id}
              className="rounded-xl bg-[var(--bg2)] p-3.5 flex gap-3"
              style={{ opacity: r.is_visible ? 1 : 0.55 }}
            >
              <Thumb
                size={18}
                weight="fill"
                className="shrink-0 mt-0.5"
                color={r.positive ? 'var(--success)' : 'var(--destructive)'}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--hint)] flex flex-wrap gap-x-2">
                  <span>{fmtReviewDate(r.created_at)}</span>
                  <span>{r.source === 'ggsel' ? `GGSEL #${r.external_id}` : `Сайт · ${r.author}`}</span>
                  {r.game_name && <span className="text-[var(--text-2)]">{r.game_name}</span>}
                  {!r.is_visible && <span className="text-[var(--warning)]">скрыт</span>}
                </p>
                <p className="text-sm text-[var(--text)] mt-1 whitespace-pre-line break-words">
                  {r.text ?? <span className="text-[var(--hint)]">Без текста</span>}
                </p>
                {r.product_name && <p className="text-xs text-[var(--hint)] mt-1 truncate">{r.product_name}</p>}
                {r.reply && <p className="text-xs text-[var(--text-2)] mt-1.5">Ответ: {r.reply}</p>}
              </div>
              <button
                type="button"
                onClick={() => toggle(r)}
                disabled={busyId === r.id}
                title={r.is_visible ? 'Скрыть' : 'Показать'}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--hint)] hover:text-[var(--text)] hover:bg-[var(--bg3)] shrink-0 transition-colors disabled:opacity-40"
              >
                {r.is_visible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          )
        })}
        {!loading && items.length === 0 && (
          <p className="text-sm text-[var(--hint)] text-center py-10">Отзывов нет</p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin text-[var(--hint)]" /></div>
      ) : items.length < total && (
        <div className="flex justify-center">
          <button type="button" onClick={() => load(items.length)} className="h-10 px-5 rounded-xl bg-[var(--bg2)] hover:bg-[var(--bg3)] text-sm text-[var(--text)] transition-colors">
            Показать ещё
          </button>
        </div>
      )}
    </div>
  )
}
