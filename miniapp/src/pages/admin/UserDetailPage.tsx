/**
 * src/pages/admin/UserDetailPage.tsx
 * Детальный профиль пользователя в admin-панели.
 * Позволяет бан/разбан и корректировку баланса.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, AlertCircle, ShieldAlert,
  ShieldOff, PlusCircle, MinusCircle, ExternalLink,
} from 'lucide-react'
import { adminApi } from '@/api/admin'
import type { AdminUserDetail } from '@/api/admin'
import toast from 'react-hot-toast'

function formatMoney(v: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(v)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU')
}

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-yellow-500/15 text-yellow-400',
  paid:       'bg-blue-500/15 text-blue-400',
  processing: 'bg-violet-500/15 text-violet-400',
  completed:  'bg-emerald-500/15 text-emerald-400',
  cancelled:  'bg-red-500/15 text-red-400',
  refunded:   'bg-orange-500/15 text-orange-400',
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [user, setUser] = useState<AdminUserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [balanceDelta, setBalanceDelta] = useState('')
  const [balanceReason, setBalanceReason] = useState('')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    adminApi.getUser(id)
      .then(setUser)
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

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-white/5 rounded-xl" />
        <div className="h-32 bg-white/5 rounded-2xl" />
        <div className="h-40 bg-white/5 rounded-2xl" />
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="flex flex-col items-center py-20 gap-3 text-white/40">
        <AlertCircle size={40} />
        <p className="text-sm">Пользователь не найден</p>
        <button onClick={() => navigate(-1)} className="text-xs text-blue-400">Назад</button>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={18} className="text-white/60" />
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {user.photo_url ? (
            <img src={user.photo_url} alt={user.first_name} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-sm font-semibold text-white/60">
              {user.first_name[0]}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold text-white truncate">{user.first_name}</span>
              {user.is_blocked && <ShieldAlert size={14} className="text-red-400 shrink-0" />}
            </div>
            {user.username && (
              <div className="text-xs text-white/40">@{user.username}</div>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Статистика</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Telegram ID', value: user.telegram_id },
            { label: 'Баланс', value: formatMoney(user.balance) },
            { label: 'Заказов', value: user.orders_count },
            { label: 'Потрачено', value: formatMoney(user.total_spent) },
            { label: 'Уровень', value: user.loyalty_level?.name ?? '—' },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-xs text-white/40">{label}</div>
              <div className="text-sm font-medium text-white mt-0.5">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-white/30">
          Зарегистрирован: {formatDate(user.created_at)}
          {user.last_active_at && ` · Был: ${formatDate(user.last_active_at)}`}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-3">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Действия</h2>

        <div className="flex gap-2">
          <button
            onClick={handleBan}
            disabled={actionLoading}
            className={[
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors',
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
          <label className="text-xs text-white/40 mb-1.5 block">Корректировка баланса</label>
          <input
            type="number"
            value={balanceDelta}
            onChange={(e) => setBalanceDelta(e.target.value)}
            placeholder="Сумма (руб.)"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/50 mb-2"
          />
          <input
            type="text"
            value={balanceReason}
            onChange={(e) => setBalanceReason(e.target.value)}
            placeholder="Причина (необязательно)"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/50 mb-2"
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleBalance(1)}
              disabled={!balanceDelta || actionLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-30 transition-colors"
            >
              <PlusCircle size={15} /> Пополнить
            </button>
            <button
              onClick={() => handleBalance(-1)}
              disabled={!balanceDelta || actionLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-30 transition-colors"
            >
              <MinusCircle size={15} /> Списать
            </button>
          </div>
        </div>
      </div>

      {/* Orders */}
      {user.orders && user.orders.length > 0 && (
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-3">
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">
            Заказы ({user.orders.length})
          </h2>
          <div className="space-y-2">
            {user.orders.slice(0, 5).map((order) => (
              <Link
                key={order.id}
                to={`/admin/orders/${order.id}`}
                className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 hover:opacity-80 transition-opacity"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-white">#{order.order_number}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[order.status] ?? 'bg-white/10 text-white/50'}`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="text-xs text-white/30 mt-0.5">{formatDate(order.created_at)}</div>
                </div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                  {formatMoney(order.total_amount)}
                  <ExternalLink size={12} className="text-white/30" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}
