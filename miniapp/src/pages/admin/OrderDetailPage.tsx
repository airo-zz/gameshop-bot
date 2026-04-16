/**
 * src/pages/admin/OrderDetailPage.tsx
 * Детальный вид заказа с возможностью смены статуса.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertCircle, Save, Trash2 } from 'lucide-react'
import { adminApi } from '@/api/admin'
import type { AdminOrderDetail } from '@/api/admin'
import toast from 'react-hot-toast'

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'new',             label: 'Новый' },
  { value: 'pending_payment', label: 'Ожидает оплаты' },
  { value: 'paid',            label: 'Оплачен' },
  { value: 'processing',      label: 'В обработке' },
  { value: 'completed',       label: 'Выполнен' },
  { value: 'cancelled',       label: 'Отменён' },
  { value: 'refunded',        label: 'Возврат' },
]

const STATUS_COLORS: Record<string, string> = {
  new:             'bg-slate-500/15 text-slate-400',
  pending_payment: 'bg-yellow-500/15 text-yellow-400',
  paid:            'bg-blue-500/15 text-blue-400',
  processing:      'bg-violet-500/15 text-violet-400',
  completed:       'bg-emerald-500/15 text-emerald-400',
  cancelled:       'bg-red-500/15 text-red-400',
  refunded:        'bg-orange-500/15 text-orange-400',
}

const inputCls = 'w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-all duration-200'

function formatMoney(v: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(v)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU')
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [order, setOrder] = useState<AdminOrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    adminApi.getOrder(id)
      .then((data) => {
        setOrder(data)
        setNewStatus(data.status)
        setReason(data.notes ?? '')
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  async function handleDelete() {
    if (!order) return
    if (!window.confirm('Удалить заказ? Это действие нельзя отменить.')) return
    setDeleting(true)
    try {
      await adminApi.deleteOrder(order.id)
      toast.success('Заказ удалён')
      navigate('/admin/orders')
    } catch {
      toast.error('Не удалось удалить заказ')
    } finally {
      setDeleting(false)
    }
  }

  async function handleSave() {
    if (!order || !newStatus) return
    setSaving(true)
    try {
      const result = await adminApi.updateOrderStatus(order.id, newStatus, reason || undefined) as { ok: boolean; new_status: string }
      setOrder({ ...order, status: result.new_status })
      toast.success('Статус обновлён')
    } catch {
      toast.error('Не удалось обновить статус')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-white/40 text-sm py-8 text-center">Загрузка...</p>
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center py-20 gap-3 text-white/40">
        <AlertCircle size={40} />
        <p className="text-sm">Заказ не найден</p>
        <button onClick={() => navigate(-1)} className="text-xs text-blue-400 active:scale-[0.98] transition-transform">
          Назад
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] active:scale-[0.95] transition-all duration-200"
        >
          <ArrowLeft size={18} className="text-white/60" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white">{order.order_number}</h1>
          <p className="text-xs text-white/40">{formatDate(order.created_at)}</p>
        </div>
        <span className={`ml-auto text-xs px-3 py-1 rounded-full font-medium ${STATUS_COLORS[order.status] ?? 'bg-white/10 text-white/50'}`}>
          {STATUS_OPTIONS.find(s => s.value === order.status)?.label ?? order.status}
        </span>
      </div>

      {/* User info */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-2">
        <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Покупатель</h2>
        <div className="text-sm text-white">
          {order.user.first_name}
          {order.user.username && (
            <span className="text-white/40 ml-1">@{order.user.username}</span>
          )}
        </div>
        <div className="text-xs text-white/30">ID: {order.user.telegram_id}</div>
      </div>

      {/* Items */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-3">
        <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Позиции</h2>
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <div className="text-sm text-white font-medium truncate">{item.product_name}</div>
              {item.lot_name && (
                <div className="text-xs text-white/40">{item.lot_name}</div>
              )}
              <div className="text-xs text-white/30">{item.quantity} шт.</div>
            </div>
            <div className="text-sm font-semibold text-white shrink-0">
              {formatMoney(item.total_price)}
            </div>
          </div>
        ))}
        <div className="border-t border-white/[0.08] pt-3 flex justify-between text-sm font-bold text-white">
          <span>Итого</span>
          <span>{formatMoney(order.total_amount)}</span>
        </div>
      </div>

      {/* Status edit */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-3">
        <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Управление</h2>

        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Статус</label>
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            className={inputCls}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[#060f1e]">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Заметка (внутренняя)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Необязательно..."
            className={`${inputCls} resize-none`}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm font-semibold text-white transition-all duration-200 active:scale-[0.98]"
        >
          {saving ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save size={16} />
          )}
          Сохранить
        </button>

        {['new', 'pending_payment', 'cancelled', 'refunded'].includes(order.status) && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/[0.2] disabled:opacity-60 text-sm font-semibold text-red-400 transition-all duration-200 active:scale-[0.98]"
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
