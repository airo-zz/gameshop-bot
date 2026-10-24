/**
 * src/pages/admin/SecurityPage.tsx — «Безопасность» сотрудника:
 *  • запасной вход без Telegram: почта (подтверждается кодом) + пароль;
 *  • активные сессии админки: где и когда входили, завершить одну или все остальные.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2, LogOut, Mail, ShieldCheck } from '@/components/ui/icons'
import { adminWorkspaceApi } from '@/api/admin'
import { dateTime, deviceLabel, errText, timeAgo } from '@/admin/format'

const input =
  'w-full h-11 rounded-xl bg-[var(--bg3)] px-3.5 text-sm text-[var(--text)] placeholder:text-[var(--hint)] outline-none focus:shadow-[inset_0_0_0_1px_var(--border-accent)]'
const btn =
  'h-11 px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50'

function EmailLoginCard({ email, hasPassword, setAt }: { email: string | null; hasPassword: boolean; setAt: string | null }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(!hasPassword)
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [form, setForm] = useState({ email: email ?? '', code: '', password: '', repeat: '' })
  const [busy, setBusy] = useState(false)

  async function sendCode() {
    setBusy(true)
    try {
      await adminWorkspaceApi.credentialsRequest(form.email)
      setStep('code')
      toast.success('Код отправлен на почту')
    } catch (e) {
      toast.error(errText(e, 'Не удалось отправить код'))
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (form.password !== form.repeat) return toast.error('Пароли не совпадают')
    setBusy(true)
    try {
      await adminWorkspaceApi.credentialsSave({ email: form.email, code: form.code, password: form.password })
      toast.success('Вход по почте настроен. Остальные сессии завершены')
      setEditing(false)
      setStep('email')
      qc.invalidateQueries({ queryKey: ['admin', 'security'] })
    } catch (e) {
      toast.error(errText(e, 'Не удалось сохранить'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl bg-[var(--bg2)] p-5">
      <div className="flex items-start gap-3">
        <Mail size={22} className="text-[var(--link)] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-[var(--text)]" style={{ margin: 0 }}>Вход по почте</h2>
          <p className="text-sm text-[var(--hint)] mt-1 leading-relaxed">
            Запасной способ на случай, если Telegram недоступен: почта и пароль, затем код из письма.
          </p>
          {hasPassword && !editing && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-sm text-[var(--text)]">{email}</span>
              <span className="text-xs text-[var(--hint)]">пароль задан {setAt ? timeAgo(setAt) : ''}</span>
              <button type="button" onClick={() => setEditing(true)} className="text-sm text-[var(--link)] hover:text-[var(--text)]">
                Изменить
              </button>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-4 space-y-3 max-w-md">
          {step === 'email' ? (
            <>
              <input className={input} type="email" placeholder="Рабочая почта" value={form.email}
                     onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <button type="button" onClick={sendCode} disabled={busy || !form.email}
                      className={btn + ' bg-[var(--btn)] hover:bg-[var(--btn-hover)] text-white'}>
                {busy && <Loader2 size={16} className="animate-spin" />} Отправить код подтверждения
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--text-2)]">Код отправлен на <b>{form.email}</b></p>
              <input className={input + ' num tracking-widest'} inputMode="numeric" maxLength={6} placeholder="Код из письма"
                     value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, '') })} />
              <input className={input} type="password" autoComplete="new-password" placeholder="Новый пароль (от 10 символов)"
                     value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <input className={input} type="password" autoComplete="new-password" placeholder="Повторите пароль"
                     value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} />
              <div className="flex gap-2">
                <button type="button" onClick={save} disabled={busy || form.code.length < 6 || form.password.length < 10}
                        className={btn + ' bg-[var(--btn)] hover:bg-[var(--btn-hover)] text-white'}>
                  {busy && <Loader2 size={16} className="animate-spin" />} Сохранить
                </button>
                <button type="button" onClick={() => setStep('email')} className={btn + ' bg-[var(--bg3)] text-[var(--text-2)]'}>
                  Назад
                </button>
              </div>
            </>
          )}
          {hasPassword && (
            <button type="button" onClick={() => { setEditing(false); setStep('email') }}
                    className="text-sm text-[var(--hint)] hover:text-[var(--text)]">
              Отмена
            </button>
          )}
        </div>
      )}
    </section>
  )
}

export default function SecurityPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'security'], queryFn: adminWorkspaceApi.security })
  const revoke = useMutation({
    mutationFn: (id: string) => adminWorkspaceApi.revokeSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'security'] }),
    onError: (e) => toast.error(errText(e, 'Не удалось завершить сессию')),
  })
  const revokeOthers = useMutation({
    mutationFn: adminWorkspaceApi.revokeOtherSessions,
    onSuccess: (r) => {
      toast.success(r.revoked ? `Завершено сессий: ${r.revoked}` : 'Других сессий нет')
      qc.invalidateQueries({ queryKey: ['admin', 'security'] })
    },
  })

  if (isLoading || !data) {
    return <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-[var(--hint)]" /></div>
  }
  const others = data.sessions.filter((s) => !s.current).length

  return (
    <div className="space-y-4 max-w-3xl">
      <EmailLoginCard email={data.email} hasPassword={data.has_password} setAt={data.password_set_at} />

      <section className="rounded-2xl bg-[var(--bg2)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldCheck size={22} className="text-[var(--link)] shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-semibold text-[var(--text)]" style={{ margin: 0 }}>Активные сессии</h2>
              <p className="text-sm text-[var(--hint)] mt-1">Где сейчас открыта админка под вашим аккаунтом.</p>
            </div>
          </div>
          {others > 0 && (
            <button type="button" onClick={() => revokeOthers.mutate()} disabled={revokeOthers.isPending}
                    className={btn + ' bg-[var(--bg3)] text-[var(--text)] hover:text-[var(--destructive)]'}>
              <LogOut size={16} /> Завершить все остальные
            </button>
          )}
        </div>
        <div className="mt-4 divide-y divide-[var(--border)]">
          {data.sessions.map((s) => (
            <div key={s.id} className="py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text)] flex items-center gap-2">
                  {deviceLabel(s.user_agent)}
                  {s.current && <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--link)]">это устройство</span>}
                </p>
                <p className="text-xs text-[var(--hint)] mt-0.5">
                  {s.method_label} · IP {s.ip ?? '—'} · вход {dateTime(s.created_at)} · активность {timeAgo(s.last_seen_at)}
                </p>
              </div>
              {!s.current && (
                <button type="button" onClick={() => revoke.mutate(s.id)} disabled={revoke.isPending}
                        className="text-sm text-[var(--hint)] hover:text-[var(--destructive)] transition-colors">
                  Завершить
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
