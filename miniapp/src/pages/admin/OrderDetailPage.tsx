/**
 * src/pages/admin/OrderDetailPage.tsx
 * Детальный вид заказа с возможностью смены статуса.
 * Включает секцию "Ответственный" с кнопками Взять/Отпустить.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertCircle, Save, Trash2, Bell, UserCheck, UserMinus } from '@/components/ui/icons'
import { adminApi } from '@/api/admin'
import type { AdminOrderDetail } from '@/api/admin'
import toast from 'react-hot-toast'
import { useTelegram } from '@/hooks/useTelegram'
import { ADMIN_COLORS } from './OrdersPage'

const STATUS_LABELS: Record<string, string> = {
  new:             'Новый',
  pending_payment: 'Ожидает оплаты',
  paid:            'Оплачен',
  processing:      'В обработке',
  clarification:   'Уточнение',
  completed:       'Выполнен',
  cancelled:       'Отменён',
  refunded:        'Возврат',
}

// Зеркало ALLOWED_STATUS_TRANSITIONS из shared/models/order.py
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  new:             ['pending_payment', 'cancelled'],
  pending_payment: ['paid', 'cancelled'],
  paid:            ['processing', 'cancelled', 'refunded'],
  processing:      ['completed', 'clarification', 'refunded'],
  clarification:   ['processing', 'cancelled', 'refunded'],
  completed:       ['processing', 'refunded'],
  cancelled:       [],
  refunded:        [],
}

const STATUS_COLORS: Record<string, string> = {
  new:             'bg-slate-500/15 text-slate-400',
  pending_payment: 'bg-yellow-500/15 text-yellow-400',
  paid:            'bg-[var(--accent-soft)] text-[var(--link)]',
  processing:      'bg-[var(--accent-soft)] text-[var(--link)]',
  clarification:   'bg-amber-500/15 text-amber-400',
  completed:       'bg-emerald-500/15 text-emerald-400',
  cancelled:       'bg-red-500/15 text-red-400',
  refunded:        'bg-orange-500/15 text-orange-400',
}

const inputCls = 'w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-[var(--accent)] transition-all duration-200'

function formatMoney(v: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(v)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU')
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { showConfirm } = useTelegram()
  const [order, setOrder] = useState<AdminOrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notifying, setNotifying] = useState(false)
  const [claiming, setClaiming] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    adminApi.getOrder(id)
      .then((data) => {
        setOrder(data)
        setNewStatus(ALLOWED_TRANSITIONS[data.status]?.[0] ?? '')
        setReason(data.notes ?? '')
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  async function handleDelete() {
    if (!order) return
    if (!await showConfirm('Удалить заказ? Это действие нельзя отменить.')) return
    setDeleting(true)
    try {
      await adminApi.deleteOrder(order.id)
      toast.success('Заказ удалён')
      navigate('/admin/orders')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Не удалось удалить заказ')
    } finally {
      setDeleting(false)
    }
  }

  async function handleNotify() {
    if (!order) return
    if (!await showConfirm(`Отправить уведомление о статусе "${STATUS_LABELS[order.status] ?? order.status}" пользователю?`)) return
    setNotifying(true)
    try {
      await adminApi.notifyUser(order.id)
      toast.success('Уведомление отправлено')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Не удалось отправить уведомление')
    } finally {
      setNotifying(false)
    }
  }

  async function handleSave() {
    if (!order || !newStatus) return
    setSaving(true)
    try {
      const result = await adminApi.updateOrderStatus(order.id, newStatus, reason || undefined) as { ok: boolean; new_status: string }
      setOrder({ ...order, status: result.new_status })
      setNewStatus(ALLOWED_TRANSITIONS[result.new_status]?.[0] ?? '')
      toast.success('Статус обновлён')
    } catch {
      toast.error('Не удалось обновить статус')
    } finally {
      setSaving(false)
    }
  }

  async function handleClaim() {
    if (!order) return
    setClaiming(true)
    try {
      const res = await adminApi.claimOrder(order.id)
      setOrder({
        ...order,
        status: 'processing',
        assigned_admin: res.assigned_admin,
        assigned_at: res.assigned_at,
      })
      toast.success('Заказ взят в работу')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Не удалось взять заказ')
    } finally {
      setClaiming(false)
    }
  }

  async function handleUnclaim() {
    if (!order) return
    if (!await showConfirm('Отпустить заказ обратно в очередь?')) return
    setClaiming(true)
    try {
      await adminApi.unclaimOrder(order.id)
      setOrder({
        ...order,
        status: 'paid',
        assigned_admin: null,
        assigned_at: null,
      })
      toast.success('Заказ возвращён в очередь')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Не удалось отпустить заказ')
    } finally {
      setClaiming(false)
    }
  }

  if (loading) {
    return <p className="text-[var(--hint)] text-sm py-8 text-center">Загрузка...</p>
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center py-20 gap-3 text-[var(--hint)]">
        <AlertCircle size={40} />
        <p className="text-sm">Заказ не найден</p>
        <button onClick={() => navigate(-1)} className="text-xs text-[var(--link)] active:scale-[0.97] transition-transform">
          Назад
        </button>
      </div>
    )
  }

  const adminColor = order.assigned_admin
    ? ADMIN_COLORS[order.assigned_admin.color_index % ADMIN_COLORS.length]
    : null

  const canClaim = order.status === 'paid' || order.status === 'processing'
  const canUnclaim = (order.status === 'paid' || order.status === 'processing') && !!order.assigned_admin

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
        <div>
          <h1 className="text-lg font-bold text-[var(--text)]">{order.order_number}</h1>
          <p className="text-xs text-[var(--hint)]">{formatDate(order.created_at)}</p>
        </div>
        <span className={`ml-auto text-xs px-3 py-1 rounded-full font-medium ${STATUS_COLORS[order.status] ?? 'bg-[var(--bg3)] text-[var(--hint)]'}`}>
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>

      {/* Assigned admin section */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
        <h2 className="text-xs font-semibold text-[var(--hint)] uppercase tracking-wider">Ответственный</h2>

        {order.assigned_admin ? (
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-[var(--text)]"
              style={{ background: adminColor ?? 'var(--accent)' }}
            >
              {(order.assigned_admin.username || order.assigned_admin.first_name).slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[var(--text)]">
                {order.assigned_admin.username ? `@${order.assigned_admin.username}` : order.assigned_admin.first_name}
              </div>
              {order.assigned_at && (
                <div className="text-xs text-[var(--hint)]">
                  Взят {formatDate(order.assigned_at)}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-[var(--hint)]">Заказ не назначен</div>
        )}

        <div className="flex gap-2">
          {canClaim && (
            <button
              onClick={handleClaim}
              disabled={claiming}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--accent-soft)] hover:bg-blue-500/20 border border-blue-500/[0.2] disabled:opacity-60 text-sm font-semibold text-[var(--link)] transition-all duration-200 active:scale-[0.97]"
            >
              {claiming ? (
                <span className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
              ) : (
                <UserCheck size={15} />
              )}
              Взять в работу
            </button>
          )}
          {canUnclaim && (
            <button
              onClick={handleUnclaim}
              disabled={claiming}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--bg2)] hover:bg-[var(--bg3)] border border-[var(--border)] disabled:opacity-60 text-sm font-semibold text-[var(--hint)] transition-all duration-200 active:scale-[0.97]"
              title="Отпустить заказ"
            >
              <UserMinus size={15} />
            </button>
          )}
        </div>
      </div>

      {/* User info */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 space-y-2">
        <h2 className="text-xs font-semibold text-[var(--hint)] uppercase tracking-wider">Покупатель</h2>
        <div className="text-sm text-[var(--text)]">
          {order.user.first_name}
          {order.user.username && (
            <span className="text-[var(--hint)] ml-1">@{order.user.username}</span>
          )}
        </div>
        <div className="text-xs text-[var(--hint)]">ID: {order.user.telegram_id}</div>
      </div>

      {/* Данные покупателя (на уровне игры) */}
      {order.input_data && Object.keys(order.input_data).length > 0 && (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
          <h2 className="text-xs font-semibold text-[var(--hint)] uppercase tracking-wider">Данные покупателя</h2>
          {Object.entries(order.input_data).map(([gameId, group]: [string, any]) => (
            <div key={gameId} className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-3 space-y-1.5">
              <div className="text-[11px] font-semibold text-[var(--text-2)]">{group.game_name}</div>
              {(group.fields ?? []).map((f: any, i: number) => (
                <div key={i} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-[var(--hint)] shrink-0">{f.label}</span>
                  <span
                    className="text-[var(--text-2)] font-mono text-right break-all select-all cursor-pointer"
                    onClick={() => navigator.clipboard?.writeText(String(f.value)).then(() => toast.success('Скопировано'), () => {})}
                    title="Нажмите, чтобы скопировать"
                  >
                    {String(f.value) || '—'}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Items */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
        <h2 className="text-xs font-semibold text-[var(--hint)] uppercase tracking-wider">Позиции</h2>
        {order.items.map((item) => {
          const fields = item.input_data
            ? Object.entries(item.input_data).filter(([, v]) => v !== null && v !== '' && v !== undefined)
            : []
          return (
            <div key={item.id} className="space-y-2">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-[var(--text)] font-medium truncate">{item.product_name}</div>
                  <div className="text-xs text-[var(--hint)]">{item.quantity} шт.</div>
                </div>
                <div className="text-sm font-semibold text-[var(--text)] shrink-0">
                  {formatMoney(item.total_price)}
                </div>
              </div>
              {fields.length > 0 && (
                <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-2.5 space-y-1.5">
                  <div className="text-[10px] font-semibold text-[var(--hint)] uppercase tracking-wider">
                    Данные покупателя
                  </div>
                  {fields.map(([key, value]) => (
                    <div key={key} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="text-[var(--hint)] shrink-0">{key}</span>
                      <span
                        className="text-[var(--text-2)] font-mono text-right break-all select-all cursor-pointer"
                        onClick={() => {
                          navigator.clipboard?.writeText(String(value)).then(
                            () => toast.success('Скопировано'),
                            () => {},
                          )
                        }}
                        title="Нажмите, чтобы скопировать"
                      >
                        {String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <div className="border-t border-[var(--border)] pt-3 flex justify-between text-sm font-bold text-[var(--text)]">
          <span>Итого</span>
          <span>{formatMoney(order.total_amount)}</span>
        </div>
      </div>

      {/* Status edit */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
        <h2 className="text-xs font-semibold text-[var(--hint)] uppercase tracking-wider">Управление</h2>

        <div>
          <label className="text-xs text-[var(--hint)] mb-1.5 block">Статус</label>
          {(ALLOWED_TRANSITIONS[order.status]?.length ?? 0) === 0 ? (
            <div className="text-xs text-[var(--hint)] px-3 py-2.5 bg-[var(--bg2)] border border-[var(--border)] rounded-xl">
              Статус финальный — смена недоступна
            </div>
          ) : (
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className={inputCls}
            >
              {ALLOWED_TRANSITIONS[order.status].map((s) => (
                <option key={s} value={s} className="bg-[var(--bg2)]">
                  {STATUS_LABELS[s] ?? s}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="text-xs text-[var(--hint)] mb-1.5 block">Заметка (внутренняя)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Необязательно..."
            className={`${inputCls} resize-none`}
          />
        </div>

        {(ALLOWED_TRANSITIONS[order.status]?.length ?? 0) > 0 && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--btn-hover)] disabled:opacity-60 text-sm font-semibold text-[var(--text)] transition-all duration-200 active:scale-[0.97]"
          >
            {saving ? (
              <span className="w-4 h-4 border-2 border-[var(--border)] border-t-white rounded-full animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Сохранить
          </button>
        )}

        <button
          onClick={handleNotify}
          disabled={notifying}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/[0.2] disabled:opacity-60 text-sm font-semibold text-emerald-400 transition-all duration-200 active:scale-[0.97]"
        >
          {notifying ? (
            <span className="w-4 h-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
          ) : (
            <Bell size={16} />
          )}
          Уведомить пользователя
        </button>

        {['new', 'pending_payment', 'cancelled'].includes(order.status) && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/[0.2] disabled:opacity-60 text-sm font-semibold text-red-400 transition-all duration-200 active:scale-[0.97]"
          >
            {deleting ? (
              <span className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
            ) : (
              <Trash2 size={16} />
            )}
            Удалить заказ
          </button>
        )}
      </div>
    </div>
  )
}
