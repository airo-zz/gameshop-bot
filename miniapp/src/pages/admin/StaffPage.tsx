/**
 * src/pages/admin/StaffPage.tsx — «Сотрудники» (только владелец):
 * добавить по @нику или Telegram ID, сменить роль, отключить доступ,
 * завершить сессии сотрудника. Свою запись менять нельзя (защита от самоблокировки).
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2, LogOut, Plus } from '@/components/ui/icons'
import { adminWorkspaceApi, type StaffMember, type StaffRole } from '@/api/admin'
import { useAdminStore } from '@/store/adminStore'
import { errText, timeAgo } from '@/admin/format'

const select =
  'h-10 rounded-xl bg-[var(--bg3)] px-3 text-sm text-[var(--text)] outline-none focus:shadow-[inset_0_0_0_1px_var(--border-accent)]'

function Row({ m, isMe, roles }: { m: StaffMember; isMe: boolean; roles: { role: StaffRole; label: string }[] }) {
  const qc = useQueryClient()
  const update = useMutation({
    mutationFn: (data: { role?: StaffRole; is_active?: boolean }) => adminWorkspaceApi.staffUpdate(m.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'staff'] }); toast.success('Сохранено') },
    onError: (e) => toast.error(errText(e, 'Не удалось сохранить')),
  })
  const revoke = useMutation({
    mutationFn: () => adminWorkspaceApi.staffRevoke(m.id),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['admin', 'staff'] }); toast.success(`Завершено сессий: ${r.revoked}`) },
  })
  const name = m.first_name || (m.username ? `@${m.username}` : String(m.telegram_id))

  return (
    <div className="rounded-2xl bg-[var(--bg2)] p-4 flex flex-wrap items-center gap-x-4 gap-y-3" style={{ opacity: m.is_active ? 1 : 0.55 }}>
      <div className="flex-1 min-w-[200px]">
        <p className="text-sm font-medium text-[var(--text)] flex items-center gap-2">
          {name}
          {isMe && <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--link)]">это вы</span>}
          {!m.is_active && <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--bg3)] text-[var(--hint)]">отключён</span>}
        </p>
        <p className="text-xs text-[var(--hint)] mt-0.5">
          {m.username ? `@${m.username} · ` : ''}ID {m.telegram_id} · активность {timeAgo(m.last_seen_at)}
          {m.has_password ? ' · вход по почте настроен' : ''}
        </p>
      </div>
      <select
        className={select}
        value={m.role}
        disabled={isMe || update.isPending}
        onChange={(e) => update.mutate({ role: e.target.value as StaffRole })}
        title={isMe ? 'Свою роль менять нельзя' : 'Роль'}
      >
        {roles.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
      </select>
      {!isMe && (
        <div className="flex items-center gap-2">
          {m.sessions > 0 && (
            <button type="button" onClick={() => revoke.mutate()} disabled={revoke.isPending}
                    title="Завершить все сессии" className="h-10 px-3 rounded-xl bg-[var(--bg3)] text-sm text-[var(--text-2)] hover:text-[var(--destructive)] inline-flex items-center gap-1.5">
              <LogOut size={15} /> {m.sessions}
            </button>
          )}
          <button type="button" onClick={() => update.mutate({ is_active: !m.is_active })} disabled={update.isPending}
                  className="h-10 px-3 rounded-xl bg-[var(--bg3)] text-sm text-[var(--text-2)] hover:text-[var(--text)]">
            {m.is_active ? 'Отключить' : 'Вернуть доступ'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function StaffPage() {
  const qc = useQueryClient()
  const me = useAdminStore((s) => s.me)
  const { data: staff = [], isLoading } = useQuery({ queryKey: ['admin', 'staff'], queryFn: adminWorkspaceApi.staff })
  const { data: roles = [] } = useQuery({ queryKey: ['admin', 'staff-roles'], queryFn: adminWorkspaceApi.staffRoles, staleTime: Infinity })
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<StaffRole>('operator')
  const add = useMutation({
    mutationFn: () => adminWorkspaceApi.staffAdd(query.trim(), role),
    onSuccess: (m) => {
      setQuery('')
      qc.invalidateQueries({ queryKey: ['admin', 'staff'] })
      toast.success(`${m.first_name || m.username} добавлен`)
    },
    onError: (e) => toast.error(errText(e, 'Не удалось добавить')),
  })
  const roleInfo = roles.find((r) => r.role === role)

  return (
    <div className="space-y-5 max-w-4xl">
      <section className="rounded-2xl bg-[var(--bg2)] p-5">
        <h2 className="text-base font-semibold text-[var(--text)]" style={{ margin: 0 }}>Добавить сотрудника</h2>
        <p className="text-sm text-[var(--hint)] mt-1">
          Человек должен хотя бы раз открыть бота магазина. Войти он сможет через бот поддержки или внутри Telegram.
        </p>
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (query.trim()) add.mutate() }}>
          <input
            className="flex-1 min-w-[200px] h-10 rounded-xl bg-[var(--bg3)] px-3.5 text-sm text-[var(--text)] placeholder:text-[var(--hint)] outline-none focus:shadow-[inset_0_0_0_1px_var(--border-accent)]"
            placeholder="@ник или Telegram ID" value={query} onChange={(e) => setQuery(e.target.value)}
          />
          <select className={select} value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
            {roles.filter((r) => r.role !== 'owner' || me?.role === 'owner').map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
          </select>
          <button type="submit" disabled={add.isPending || !query.trim()}
                  className="h-10 px-4 rounded-xl bg-[var(--btn)] hover:bg-[var(--btn-hover)] text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
            {add.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Добавить
          </button>
        </form>
        {roleInfo && <p className="text-xs text-[var(--hint)] mt-2">{roleInfo.label}: {roleInfo.description}</p>}
      </section>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[var(--hint)]" /></div>
      ) : (
        <div className="space-y-2">
          {staff.map((m) => <Row key={m.id} m={m} isMe={m.id === me?.id} roles={roles} />)}
        </div>
      )}
    </div>
  )
}
