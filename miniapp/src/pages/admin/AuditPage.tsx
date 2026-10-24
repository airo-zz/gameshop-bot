/**
 * src/pages/admin/AuditPage.tsx — журнал действий сотрудников: кто, что и когда менял.
 * Фильтры: действие, период; клик по сотруднику — только его действия.
 * Строку можно раскрыть: было → стало.
 */

import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronDown, Loader2, X } from '@/components/ui/icons'
import { adminWorkspaceApi, type AuditItem } from '@/api/admin'
import { dateTime } from '@/admin/format'

const LIMIT = 50
const field =
  'h-10 rounded-xl bg-[var(--bg2)] px-3 text-sm text-[var(--text)] outline-none focus:shadow-[inset_0_0_0_1px_var(--border-accent)]'

function short(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** Изменённые поля: «price: 100 → 120». */
function changes(item: AuditItem): string[] {
  const before = item.before ?? {}
  const after = item.after ?? {}
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
  return keys
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .slice(0, 6)
    .map((k) => (k in before ? `${k}: ${short(before[k])} → ${short(after[k])}` : `${k}: ${short(after[k])}`))
}

function Row({ item, onAdmin }: { item: AuditItem; onAdmin: (id: string, name: string) => void }) {
  const [open, setOpen] = useState(false)
  const diff = changes(item)
  return (
    <div className="rounded-xl bg-[var(--bg2)]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--text)]">
            <span className="font-medium">{item.action_label}</span>
            {item.description && <span className="text-[var(--text-2)]"> — {item.description}</span>}
          </p>
          <p className="text-xs text-[var(--hint)] mt-0.5">
            {dateTime(item.created_at)} ·{' '}
            <span role="link" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onAdmin(item.admin.id, item.admin.name) }}
                  className="text-[var(--link)] hover:text-[var(--text)] cursor-pointer">
              {item.admin.name}
            </span>
            {item.ip ? ` · ${item.ip}` : ''}
          </p>
          {!open && diff.length > 0 && <p className="text-xs text-[var(--text-2)] mt-1 truncate">{diff.join('; ')}</p>}
        </div>
        <ChevronDown size={16} className="text-[var(--hint)] shrink-0 mt-1" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div className="px-4 pb-4 grid md:grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-[var(--hint)] mb-1">Было</p>
            <pre className="whitespace-pre-wrap break-all rounded-lg bg-[var(--bg3)] p-3 text-[var(--text-2)] max-h-64 overflow-auto">{item.before ? JSON.stringify(item.before, null, 2) : '—'}</pre>
          </div>
          <div>
            <p className="text-[var(--hint)] mb-1">Стало</p>
            <pre className="whitespace-pre-wrap break-all rounded-lg bg-[var(--bg3)] p-3 text-[var(--text-2)] max-h-64 overflow-auto">{item.after ? JSON.stringify(item.after, null, 2) : '—'}</pre>
          </div>
          {item.entity_type && <p className="text-[var(--hint)]">Объект: {item.entity_type} {item.entity_id ?? ''}</p>}
        </div>
      )}
    </div>
  )
}

export default function AuditPage() {
  const [action, setAction] = useState('')
  const [admin, setAdmin] = useState<{ id: string; name: string } | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(0)
  const params = {
    action: action || undefined, admin_id: admin?.id, date_from: dateFrom || undefined, date_to: dateTo || undefined,
    offset: page * LIMIT, limit: LIMIT,
  }
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'audit', params],
    queryFn: () => adminWorkspaceApi.audit(params),
    placeholderData: keepPreviousData,
  })
  const { data: actions = [] } = useQuery({ queryKey: ['admin', 'audit-actions'], queryFn: adminWorkspaceApi.auditActions })
  const reset = (fn: () => void) => { fn(); setPage(0) }
  const pages = data ? Math.ceil(data.total / LIMIT) : 0

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap gap-2 items-center">
        <select className={field} value={action} onChange={(e) => reset(() => setAction(e.target.value))}>
          <option value="">Все действия</option>
          {actions.map((a) => <option key={a.action} value={a.action}>{a.label} ({a.count})</option>)}
        </select>
        <input type="date" className={field} value={dateFrom} onChange={(e) => reset(() => setDateFrom(e.target.value))} title="С" />
        <input type="date" className={field} value={dateTo} onChange={(e) => reset(() => setDateTo(e.target.value))} title="По" />
        {admin && (
          <button type="button" onClick={() => reset(() => setAdmin(null))}
                  className="h-10 px-3 rounded-xl bg-[var(--accent-soft)] text-sm text-[var(--link)] inline-flex items-center gap-1.5">
            {admin.name} <X size={14} />
          </button>
        )}
        {isFetching && <Loader2 size={16} className="animate-spin text-[var(--hint)]" />}
        {data && <span className="ml-auto text-sm text-[var(--hint)]">Записей: <span className="num text-[var(--text)]">{data.total}</span></span>}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[var(--hint)]" /></div>
      ) : data && data.items.length === 0 ? (
        <p className="text-sm text-[var(--hint)] text-center py-10">Записей нет</p>
      ) : (
        <div className="space-y-2">
          {data?.items.map((it) => <Row key={it.id} item={it} onAdmin={(id, name) => reset(() => setAdmin({ id, name }))} />)}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}
                  className="h-10 px-4 rounded-xl bg-[var(--bg2)] text-sm text-[var(--text)] disabled:opacity-40">Назад</button>
          <span className="text-sm text-[var(--hint)] num">{page + 1} / {pages}</span>
          <button type="button" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}
                  className="h-10 px-4 rounded-xl bg-[var(--bg2)] text-sm text-[var(--text)] disabled:opacity-40">Дальше</button>
        </div>
      )}
    </div>
  )
}
