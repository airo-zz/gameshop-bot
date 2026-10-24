/**
 * src/components/reviews/Reviews.tsx
 * Отзывы о магазине — общие для сайта и миниаппа (одна тема theme.css):
 *  ReviewCard     — карточка: автор, оценка, игра, дата, источник, текст, ответ;
 *  ReviewSummary  — «99,8% положительных из N отзывов»;
 *  ReviewsFeed    — лента с фильтрами и «Показать ещё»;
 *  OrderReviewForm — оставить отзыв по выполненному заказу.
 * Ссылка на игру у сайта и миниаппа разная — передаётся gameHref.
 */

import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { Loader2, ThumbsDown, ThumbsUp } from '@/components/ui/icons'
import { reviewsApi, type Review, type ReviewKind, type ReviewSummary as Summary } from '@/api'

export type GameHref = (slug: string) => string

const PAGE = 20

export const fmtReviewDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export const reviewsWord = (n: number) => plural(n, 'отзыв', 'отзыва', 'отзывов')

// ── Карточка ─────────────────────────────────────────────────────────────────

export function ReviewCard({ review, gameHref, showGame = true, clamp = false }: { review: Review; gameHref: GameHref; showGame?: boolean; clamp?: boolean }) {
  const r = review
  const Thumb = r.positive ? ThumbsUp : ThumbsDown
  const game = showGame && r.game_name ? (
    r.game_slug ? (
      <Link to={gameHref(r.game_slug)} className="text-[var(--link)] hover:text-[var(--text)] transition-colors truncate">
        {r.game_name}
      </Link>
    ) : (
      <span className="text-[var(--text-2)] truncate">{r.game_name}</span>
    )
  ) : null

  return (
    <article className="h-full rounded-[var(--r-card)] bg-[var(--bg2)] p-4 flex flex-col gap-2.5">
      <header className="flex items-start gap-3">
        <span
          className="w-9 h-9 rounded-[var(--r-control)] flex items-center justify-center shrink-0"
          style={{
            background: r.positive ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)',
            color: r.positive ? 'var(--success)' : 'var(--destructive)',
          }}
          title={r.positive ? 'Положительный отзыв' : 'Отрицательный отзыв'}
        >
          <Thumb size={18} weight="fill" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text)] truncate">{r.author}</p>
          <p className="text-xs text-[var(--hint)] mt-0.5 flex items-center gap-1.5 min-w-0">
            <time dateTime={r.created_at} className="shrink-0">{fmtReviewDate(r.created_at)}</time>
            {game && <><span aria-hidden="true">·</span>{game}</>}
          </p>
        </div>
      </header>

      {r.text ? (
        <p className={'text-sm text-[var(--text-2)] leading-relaxed whitespace-pre-line break-words ' + (clamp ? 'line-clamp-5' : '')}>{r.text}</p>
      ) : (
        <p className="text-sm text-[var(--hint)]">{r.positive ? 'Оценка без комментария' : 'Отрицательная оценка без комментария'}</p>
      )}
      {r.product_name && <p className="text-xs text-[var(--hint)] truncate">{r.product_name}</p>}

      {r.reply && (
        <div className="mt-1 rounded-[var(--r-control)] bg-[var(--bg3)] px-3 py-2.5">
          <p className="text-xs font-medium text-[var(--text)]">Ответ магазина</p>
          <p className="text-sm text-[var(--text-2)] mt-1 leading-relaxed whitespace-pre-line break-words">{r.reply}</p>
        </div>
      )}
    </article>
  )
}

// ── Сводка ───────────────────────────────────────────────────────────────────

export function ReviewSummary({ summary, compact = false }: { summary: Summary; compact?: boolean }) {
  const pct = summary.percent.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
  return (
    <div className={'flex items-center gap-4 ' + (compact ? '' : 'rounded-[var(--r-card)] bg-[var(--bg2)] p-4 md:p-5')}>
      <div className="shrink-0">
        <p className={(compact ? 'text-2xl' : 'text-3xl md:text-4xl') + ' font-semibold num text-[var(--text)] leading-none'}>{pct}%</p>
        <p className="text-xs text-[var(--hint)] mt-1.5">положительных</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="h-2 rounded-full bg-[var(--bg3)] overflow-hidden" aria-hidden="true">
          <div className="h-full rounded-full" style={{ width: `${summary.percent}%`, background: 'var(--success)' }} />
        </div>
        <p className="text-xs text-[var(--text-2)] mt-2 flex flex-wrap gap-x-3 gap-y-1">
          <span className="num">{summary.total.toLocaleString('ru-RU')} {reviewsWord(summary.total)}</span>
          <span className="flex items-center gap-1 num"><ThumbsUp size={13} className="text-[var(--success)]" />{summary.positive.toLocaleString('ru-RU')}</span>
          <span className="flex items-center gap-1 num"><ThumbsDown size={13} className="text-[var(--destructive)]" />{summary.negative.toLocaleString('ru-RU')}</span>
        </p>
      </div>
    </div>
  )
}

// ── Лента ────────────────────────────────────────────────────────────────────

const KINDS: { kind: ReviewKind; label: string }[] = [
  { kind: 'all', label: 'Все' },
  { kind: 'text', label: 'С текстом' },
  { kind: 'positive', label: 'Положительные' },
  { kind: 'negative', label: 'Отрицательные' },
]

export const reviewsKey = (game: string | undefined, kind: ReviewKind) => ['reviews', game ?? '', kind]

/** Загрузить первую страницу ленты заранее — переход на страницу отзывов без мигания */
export const prefetchReviews = (qc: QueryClient, game?: string) =>
  qc.prefetchInfiniteQuery({
    queryKey: reviewsKey(game, 'all'),
    queryFn: ({ pageParam }) => reviewsApi.list({ game, kind: 'all', offset: pageParam as number, limit: PAGE }),
    initialPageParam: 0,
    staleTime: 5 * 60_000,
  })

export function ReviewsFeed({ game, gameHref, columns = 2 }: { game?: string; gameHref: GameHref; columns?: 1 | 2 | 3 }) {
  const [kind, setKind] = useState<ReviewKind>('all')
  const q = useInfiniteQuery({
    queryKey: reviewsKey(game, kind),
    queryFn: ({ pageParam }) => reviewsApi.list({ game, kind, offset: pageParam, limit: PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.has_more ? pages.length * PAGE : undefined),
    staleTime: 5 * 60_000,
  })
  // Сводка в ответе всегда по всем отзывам (без фильтра) — держим последнюю, чтобы не мигала при смене фильтра
  const last = useRef<Summary | null>(null)
  const items = q.data?.pages.flatMap((p) => p.items) ?? []
  if (q.data?.pages[0]?.summary) last.current = q.data.pages[0].summary
  const summary = last.current
  const grid = columns === 1 ? '' : columns === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'

  return (
    <div>
      {summary && summary.total > 0 && <ReviewSummary summary={summary} />}

      <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            onClick={() => setKind(k.kind)}
            className={
              'h-9 px-3.5 rounded-[var(--r-control)] text-sm whitespace-nowrap transition-colors ' +
              (kind === k.kind ? 'bg-[var(--bg3)] text-[var(--text)] font-medium' : 'bg-[var(--bg2)] text-[var(--hint)] hover:text-[var(--text-2)]')
            }
          >
            {k.label}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className={'mt-4 grid gap-3 ' + grid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-[var(--r-card)] bg-[var(--bg2)] animate-pulse" />
          ))}
        </div>
      ) : q.isError ? (
        <p className="mt-6 text-sm text-[var(--hint)] text-center">Не удалось загрузить отзывы — обновите страницу</p>
      ) : items.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--hint)] text-center">Пока нет отзывов</p>
      ) : (
        <div className={'mt-4 grid gap-3 ' + grid}>
          {items.map((r) => <ReviewCard key={r.id} review={r} gameHref={gameHref} showGame={!game} />)}
        </div>
      )}

      {q.hasNextPage && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
            className="h-11 px-6 rounded-[var(--r-control)] bg-[var(--bg2)] hover:bg-[var(--bg3)] text-sm font-medium text-[var(--text)] transition-colors inline-flex items-center gap-2 disabled:opacity-60"
          >
            {q.isFetchingNextPage && <Loader2 size={16} className="animate-spin" />}
            Показать ещё
          </button>
        </div>
      )}
    </div>
  )
}

// ── Отзыв по заказу ──────────────────────────────────────────────────────────

export function OrderReviewForm({ orderId, gameHref, autoFocus = false }: { orderId: string; gameHref: GameHref; autoFocus?: boolean }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['order-review', orderId],
    queryFn: () => reviewsApi.getForOrder(orderId),
    staleTime: 60_000,
  })
  const [positive, setPositive] = useState<boolean | null>(null)
  const [text, setText] = useState('')
  const send = useMutation({
    mutationFn: () => reviewsApi.create(orderId, { positive: positive!, text: text.trim() || undefined }),
    onSuccess: (review) => {
      qc.setQueryData(['order-review', orderId], { can_review: false, review })
      qc.invalidateQueries({ queryKey: ['reviews'] })
    },
  })

  if (!data) return null
  if (data.review) {
    return (
      <section className="space-y-2">
        <p className="text-sm font-medium text-[var(--text)]">Ваш отзыв</p>
        <ReviewCard review={data.review} gameHref={gameHref} showGame={false} />
      </section>
    )
  }
  if (!data.can_review) return null

  const needText = positive === false && !text.trim()
  const error = send.error as { response?: { data?: { detail?: string } } } | null

  return (
    <section className="rounded-[var(--r-card)] bg-[var(--bg2)] p-4 space-y-3">
      <div>
        <p className="text-base font-semibold text-[var(--text)]">Как вам заказ?</p>
        <p className="text-sm text-[var(--hint)] mt-0.5">Отзыв появится на сайте и в магазине в Telegram</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {([true, false] as const).map((v) => {
          const active = positive === v
          const Icon = v ? ThumbsUp : ThumbsDown
          const color = v ? 'var(--success)' : 'var(--destructive)'
          return (
            <button
              key={String(v)}
              type="button"
              onClick={() => setPositive(v)}
              aria-pressed={active}
              className="h-12 rounded-[var(--r-control)] text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
              style={{
                background: active ? (v ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)') : 'var(--bg3)',
                color: active ? color : 'var(--text-2)',
                boxShadow: active ? `inset 0 0 0 1px ${color}` : undefined,
              }}
            >
              <Icon size={18} weight={active ? 'fill' : 'regular'} />
              {v ? 'Понравилось' : 'Не понравилось'}
            </button>
          )
        })}
      </div>
      {positive !== null && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1000))}
            rows={3}
            autoFocus={autoFocus}
            placeholder={positive ? 'Пара слов о заказе (необязательно)' : 'Что пошло не так? Мы разберёмся'}
            className="w-full rounded-[var(--r-control)] bg-[var(--bg3)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--hint)] outline-none focus:shadow-[inset_0_0_0_1px_var(--border-accent)] resize-none"
          />
          {error && <p className="text-sm text-[var(--destructive)]">{error.response?.data?.detail ?? 'Не удалось отправить отзыв'}</p>}
          <button
            type="button"
            onClick={() => send.mutate()}
            disabled={send.isPending || needText}
            className="w-full h-12 rounded-[var(--r-control)] bg-[var(--btn)] hover:bg-[var(--btn-hover)] text-white text-sm font-semibold transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {send.isPending && <Loader2 size={16} className="animate-spin" />}
            Отправить отзыв
          </button>
        </>
      )}
    </section>
  )
}
