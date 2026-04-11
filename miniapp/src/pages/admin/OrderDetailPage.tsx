/**
 * src/pages/admin/OrderDetailPage.tsx
 * Детальный вид заказа с возможностью смены статуса.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, AlertCircle, Save } from 'lucide-react'
import { adminApi } from '@/api/admin'
import type { AdminOrder, AdminOrderStatus } from '@/api/admin'
import toast from 'react-hot-toast'

const STATUS_OPTIONS: { value: AdminOrderStatus; label: string }[] = [
  { value: 'pending',    label: 'Ожидает оплаты' },
  { value: 'paid',       label: 'Оплачен' },
  { value: 'processing', label: 'В обработке' },
  { value: 'completed',  label: 'Выполнен' },
  { value: 'cancelled',  label: 'Отменён' },
  { value: 'refunded',   label: 'Возврат' },
]

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-yellow-500/15 text-yellow-400',
  paid:       'bg-blue-500/15 text-blue-400',
  processing: 'bg-violet-500/15 text-violet-400',
  completed:  'bg-emerald-500/15 text-emerald-400',
  cancelled:  'bg-red-500/15 text-red-400',
  refunded:   'bg-orange-500/15 text-orange-400',
}

function formatMoney(v: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(v)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU')
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [order, setOrder] = useState<AdminOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [newStatus, setNewStatus] = useState<AdminOrderStatus | ''>('')
  const [adminNote, setAdminNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    adminApi.getOrder(id)
      .then((data) => {
        setOrder(data)
        setNewStatus(data.status as AdminOrderStatus)
        setAdminNote(data.admin_note ?? '')
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  async function handleSave() {
    if (!order || !newStatus) return
    setSaving(true)
    try {
      const updated = await adminApi.updateOrderStatus(order.id, newStatus, adminNote || undefined)
      setOrder({ ...order, ...updated })
      toast.success('Статус обновлён')
    } catch {
      toast.error('Не удалось обновить статус')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-white/5 rounded-xl" />
        <div className="h-40 bg-white/5 rounded-2xl" />
        <div className="h-32 bg-white/5 rounded-2xl" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center py-20 gap-3 text-white/40">
        <AlertCircle size={40} />
        <p className="text-sm">Заказ не найден</p>
        <button onClick={() => navigate(-1)} className="text-xs text-blue-400">
          Назад
        </button>
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
        <div>
          <h1 className="text-lg font-bold text-white">#{order.order_number}</h1>
          <p className="text-xs text-white/40">{formatDate(order.created_at)}</p>
        </div>
        <span className={`ml-auto text-xs px-3 py-1 rounded-full font-medium ${STATUS_COLORS[order.status] ?? 'bg-white/10 text-white/50'}`}>
          {STATUS_OPTIONS.find(s => s.value === order.status)?.label ?? order.status}
        </span>
      </div>

      {/* User info */}
      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-2">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Покупатель</h2>
        <div className="text-sm text-white">
          {order.user_first_name}
          {order.user_username && (
            <span className="text-white/40 ml-1">@{order.user_username}</span>
          )}
        </div>
        <div className="text-xs text-white/30">ID: {order.user_telegram_id}</div>
      </div>

      {/* Items */}
      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-3">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Позиции</h2>
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
        <div className="border-t border-white/5 pt-3 flex justify-between text-sm font-bold text-white">
          <span>Итого</span>
          <span>{formatMoney(order.total_amount)}</span>
        </div>
      </div>

      {/* Status edit */}
      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-3">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Управление</h2>

        <div>
          <label className="text-xs text-white/40 mb-1.5 block">Статус</label>
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as AdminOrderStatus)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[#060f1e]">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-white/40 mb-1.5 block">Заметка (внутренняя)</label>
          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            rows={3}
            placeholder="Необязательно..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/50 resize-none"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm font-semibold text-white transition-colors duration-200"
        >
          {saving ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save size={16} />
          )}
          Сохранить
        </button>
      </div>
    </motion.div>
  )
}
