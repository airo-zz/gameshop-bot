/**
 * src/pages/admin/FazerItemPanel.tsx
 * Блок FazerCards под позицией заказа в админке: результат автовыдачи
 * (статус, заказы поставщика, себестоимость) и повтор выдачи с исправленными
 * данными покупателя (ID игрока, логин Steam…).
 */

import { useState } from 'react'
import { Zap, RotateCcw } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { fazerApi } from '@/api/admin'
import type { AdminOrderDetailItem, FazerDeliveryInfo } from '@/api/admin'

const STATE: Record<string, { label: string; cls: string }> = {
  ok: { label: 'Выдано', cls: 'text-emerald-400' },
  pending: { label: 'Принято поставщиком, в обработке', cls: 'text-sky-300' },
  fail: { label: 'Не выдано', cls: 'text-red-400' },
  refunded: { label: 'Поставщик вернул деньги — не выдано', cls: 'text-red-400' },
  queued: { label: 'В очереди на выдачу', cls: 'text-sky-300' },
}

interface BuyerField { key: string; label: string; value: string }

interface Props {
  item: AdminOrderDetailItem
  orderStatus: string
  orderFields: BuyerField[]
  onRequeued: () => void
}

export default function FazerItemPanel({ item, orderStatus, orderFields, onRequeued }: Props) {
  const info = ((item.delivery_data ?? {}) as { fazer?: FazerDeliveryInfo }).fazer
  // Блок только у позиций, прошедших через Fazer (есть delivery_data.fazer)
  const canRetry = !!info && !item.delivered_at && ['paid', 'processing'].includes(orderStatus)
    && ['fail', 'refunded'].includes(info.state ?? '')
  const [editing, setEditing] = useState(false)
  const [sending, setSending] = useState(false)

  // Поля для правки: из позиции (Stars/Steam-поля, прошлые правки) и из заказа (чекаут)
  const initial: BuyerField[] = [
    ...orderFields,
    ...Object.entries(item.input_data ?? {})
      .filter(([k, v]) => typeof v !== 'object' && !orderFields.some((f) => f.key === k))
      .map(([k, v]) => ({ key: k, label: k, value: String(v ?? '') })),
  ].map((f) => ({ ...f, value: String((item.input_data ?? {})[f.key] ?? f.value) }))
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(initial.map((f) => [f.key, f.value])),
  )

  if (!info) return null
  const st = STATE[info?.state ?? 'queued'] ?? { label: info?.state ?? '—', cls: 'text-[var(--hint)]' }

  const retry = async () => {
    setSending(true)
    try {
      const changed = Object.fromEntries(
        initial.filter((f) => (values[f.key] ?? '') !== f.value).map((f) => [f.key, values[f.key] ?? '']),
      )
      await fazerApi.redeliver(item.id, changed)
      toast.success('Выдача поставлена в очередь — результат появится через минуту')
      setEditing(false)
      onRequeued()
    } catch (e) {
      const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      toast.error(typeof d === 'string' ? d : 'Не удалось повторить выдачу')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-2.5 space-y-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--hint)] uppercase tracking-wider">
          <Zap size={11} /> FazerCards
        </span>
        <span className={`font-semibold ${st.cls}`}>{st.label}</span>
      </div>
      {info?.detail && <p className="text-[var(--text-2)] break-words">{info.detail}</p>}
      {(info?.orders?.length ?? 0) > 0 && (
        <p className="text-[var(--hint)] break-all">
          Заказы поставщика: {info!.orders!.map((o) => `${o.id} (${o.status || o.state})`).join(', ')}
        </p>
      )}
      {info?.cost_usd != null && <p className="text-[var(--hint)]">Себестоимость: ${info.cost_usd}</p>}

      {canRetry && !editing && (
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg3)] border border-[var(--border)] text-[var(--text)] font-semibold hover:brightness-110"
        >
          <RotateCcw size={12} /> Повторить выдачу
        </button>
      )}
      {editing && (
        <div className="space-y-2 pt-1">
          {initial.length > 0 && <p className="text-[var(--hint)]">Проверьте или исправьте данные покупателя:</p>}
          {initial.map((f) => (
            <div key={f.key}>
              <label className="text-[var(--hint)] block mb-1">{f.label}</label>
              <input
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          ))}
          <p className="text-amber-300/80">Будет новая покупка у FazerCards — спишется баланс поставщика.</p>
          <div className="flex gap-2">
            <button
              onClick={retry}
              disabled={sending}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white font-semibold disabled:opacity-50"
            >
              {sending ? 'Отправка…' : 'Выдать'}
            </button>
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-[var(--hint)]">Отмена</button>
          </div>
        </div>
      )}
    </div>
  )
}
