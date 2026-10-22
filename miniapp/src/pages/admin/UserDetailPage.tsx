/**
 * src/pages/admin/UserDetailPage.tsx
 * Детальный профиль пользователя в admin-панели.
 * Позволяет бан/разбан и корректировку баланса.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, AlertCircle, ShieldAlert,
  ShieldOff, PlusCircle, MinusCircle, ExternalLink, Save,
} from '@/components/ui/icons'
import { adminApi } from '@/api/admin'
import type { AdminUserDetail, LoyaltyLevel } from '@/api/admin'
import toast from 'react-hot-toast'

function formatMoney(v: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(v)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU')
}

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-yellow-500/15 text-yellow-400',
  paid:       'bg-[var(--accent-soft)] text-[var(--link)]',
  processing: 'bg-[var(--accent-soft)] text-[var(--link)]',
  completed:  'bg-emerald-500/15 text-emerald-400',
  cancelled:  'bg-red-500/15 text-red-400',
  refunded:   'bg-orange-500/15 text-orange-400',
}

const inputCls = 'w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-[var(--accent)] transition-all duration-200'

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [user, setUser] = useState<AdminUserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [balanceDelta, setBalanceDelta] = useState('')
  const [balanceReason, setBalanceReason] = useState('')
  const [loyaltyLevels, setLoyaltyLevels] = useState<LoyaltyLevel[]>([])
  const [editTotalSpent, setEditTotalSpent] = useState('')
  const [editLoyaltyId, setEditLoyaltyId] = useState('')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([adminApi.getUser(id), adminApi.getLoyaltyLevels()])
      .then(([u, levels]) => {
        setUser(u)
        setLoyaltyLevels(levels)
        setEditTotalSpent(String(u.total_spent))
        setEditLoyaltyId(u.loyalty_level?.id ?? '')
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  async function handleBan() {
    if (!user || !id) return
    setActionLoading(true)
    try {
      const updated = await adminApi.updateUser(id, { is_blocked: !user.is_blocked })
      setUser({ ...user, ...updated })
      toast.success(updated.is_blocked ? 'Пользователь заблокирован' : 'Блокировка снята')
    } catch {
      toast.error('Ошибка')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleBalance(sign: 1 | -1) {
    if (!user || !id || !balanceDelta) return
    const amount = parseFloat(balanceDelta)
    if (isNaN(amount) || amount === 0) return
    setActionLoading(true)
    try {
      const res = await adminApi.adjustBalance(id, amount, sign === 1 ? 'manual_credit' : 'manual_debit', balanceReason || undefined)
      setUser({ ...user, balance: res.balance_after })
      setBalanceDelta('')
      setBalanceReason('')
      toast.success(`Баланс обновлён: ${formatMoney(res.balance_after)}`)
    } catch {
      toast.error('Ошибка изменения баланса')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleSaveLoyalty() {
    if (!user || !id) return
    const spent = parseFloat(editTotalSpent)
    if (isNaN(spent) || spent < 0) { toast.error('Некорректная сумма'); return }
    setActionLoading(true)
    try {
      const payload: { total_spent?: number; loyalty_level_id?: string } = {}
      if (spent !== user.total_spent) payload.total_spent = spent
      if (editLoyaltyId && editLoyaltyId !== (user.loyalty_level?.id ?? '')) payload.loyalty_level_id = editLoyaltyId
      if (!Object.keys(payload).length) { toast('Нет изменений'); return }
      const updated = await adminApi.updateUser(id, payload)
      const newLevel = loyaltyLevels.find(l => l.id === updated.loyalty_level_id) ?? null
      setUser({
        ...user,
        total_spent: updated.total_spent ?? spent,
        loyalty_level: newLevel ? { id: newLevel.id, name: newLevel.name, discount_percent: newLevel.discount_percent, cashback_percent: newLevel.cashback_percent, color_hex: newLevel.color_hex ?? null, icon_emoji: newLevel.icon_emoji ?? null } : user.loyalty_level,
      })
      toast.success('Сохранено')
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return <p className="text-[var(--hint)] text-sm py-8 text-center">Загрузка...</p>
  }

  if (error || !user) {
    return (
      <div className="flex flex-col items-center py-20 gap-3 text-[var(--hint)]">
        <AlertCircle size={40} />
        <p className="text-sm">Пользователь не найден</p>
        <button onClick={() => navigate(-1)} className="text-xs text-[var(--link)] active:scale-[0.97] transition-transform">Назад</button>
      </div>
    )
  }

  const STAT_ITEMS = [
    { label: 'Telegram ID', value: user.telegram_id },
    { label: 'Баланс',      value: formatMoney(user.balance) },
    { label: 'Заказов',     value: user.orders_count },
    { label: 'Потрачено',   value: formatMoney(user.total_spent) },
    { label: 'Уровень',     value: user.loyalty_level?.name ?? '—' },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl bg-[var(--bg2)] border border-[var(--border)] hover:bg-[var(--bg3)] active:scale-[0.97] transition-all duration-200"
        >
          <ArrowLeft size={18} className="text-[var(--text-2)]" />
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {user.photo_url ? (
            <img src={user.photo_url} alt={user.first_name} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[var(--bg3)] flex items-center justify-center text-sm font-semibold text-[var(--text-2)]">
              {user.first_name[0]}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold text-[var(--text)] truncate">{user.first_name}</span>
              {user.is_blocked && <ShieldAlert size={14} className="text-red-400 shrink-0" />}
            </div>
            {user.username && (
              <div className="text-xs text-[var(--hint)]">@{user.username}</div>
            )}
          </div>
        </div>
      </div>

      {/* Stats — individual cards */}
      <div>
        <h2 className="text-xs font-semibold text-[var(--hint)] uppercase tracking-wider mb-3">Статистика</h2>
        <div className="grid grid-cols-2 gap-2">
          {STAT_ITEMS.map(({ label, value }) => (
            <div
              key={label}
              className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-3 py-3"
            >
              <div className="text-xs text-[var(--hint)] mb-1">{label}</div>
              <div className="text-sm font-semibold text-[var(--text)]">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 px-1 text-xs text-[var(--hint)]">
          Зарегистрирован: {formatDate(user.created_at)}
          {user.last_active_at && ` · Был: ${formatDate(user.last_active_at)}`}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
        <h2 className="text-xs font-semibold text-[var(--hint)] uppercase tracking-wider">Действия</h2>

        <div className="flex gap-2">
          <button
            onClick={handleBan}
            disabled={actionLoading}
            className={[
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.97]',
              user.is_blocked
                ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'
                : 'bg-red-600/20 text-red-400 hover:bg-red-600/30',
            ].join(' ')}
          >
            {user.is_blocked ? <ShieldOff size={15} /> : <ShieldAlert size={15} />}
            {user.is_blocked ? 'Разблокировать' : 'Заблокировать'}
          </button>
        </div>

        {/* Balance adjustment */}
        <div>
          <label className="text-xs text-[var(--hint)] mb-1.5 block">Корректировка баланса</label>
          <input
            type="number"
            value={balanceDelta}
            onChange={(e) => setBalanceDelta(e.target.value)}
            placeholder="Сумма (руб.)"
            className={`${inputCls} mb-2`}
          />
          <input
            type="text"
            value={balanceReason}
            onChange={(e) => setBalanceReason(e.target.value)}
            placeholder="Причина (необязательно)"
            className={`${inputCls} mb-2`}
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleBalance(1)}
              disabled={!balanceDelta || actionLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-30 active:scale-[0.97] transition-all duration-200"
            >
              <PlusCircle size={15} /> Пополнить
            </button>
            <button
              onClick={() => handleBalance(-1)}
              disabled={!balanceDelta || actionLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-30 active:scale-[0.97] transition-all duration-200"
            >
              <MinusCircle size={15} /> Списать
            </button>
          </div>
        </div>
      </div>

      {/* Loyalty & total_spent edit */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
        <h2 className="text-xs font-semibold text-[var(--hint)] uppercase tracking-wider">Лояльность</h2>
        <div>
          <label className="text-xs text-[var(--hint)] mb-1.5 block">Сумма трат, ₽</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={editTotalSpent}
            onChange={e => setEditTotalSpent(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--hint)] mb-1.5 block">Уровень лояльности</label>
          <select
            value={editLoyaltyId}
            onChange={e => setEditLoyaltyId(e.target.value)}
            className={inputCls}
          >
            <option value="">— не задан —</option>
            {loyaltyLevels.map(l => (
              <option key={l.id} value={l.id}>{l.name} (от {l.min_spent.toLocaleString('ru-RU')} ₽)</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleSaveLoyalty}
          disabled={actionLoading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-blue-600/20 text-[var(--link)] hover:bg-blue-600/30 disabled:opacity-30 active:scale-[0.97] transition-all duration-200"
        >
          <Save size={15} /> Сохранить
        </button>
      </div>

      {/* Orders */}
      {user.orders && user.orders.length > 0 && (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
          <h2 className="text-xs font-semibold text-[var(--hint)] uppercase tracking-wider">
            Заказы ({user.orders.length})
          </h2>
          <div className="space-y-2">
            {user.orders.slice(0, 5).map((order) => (
              <Link
                key={order.id}
                to={`/admin/orders/${order.id}`}
                className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0 hover:opacity-80 active:scale-[0.97] transition-all"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[var(--text)]">{order.order_number}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[order.status] ?? 'bg-[var(--bg3)] text-[var(--hint)]'}`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--hint)] mt-0.5">{formatDate(order.created_at)}</div>
                </div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text)]">
                  {formatMoney(order.total_amount)}
                  <ExternalLink size={12} className="text-[var(--hint)]" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
