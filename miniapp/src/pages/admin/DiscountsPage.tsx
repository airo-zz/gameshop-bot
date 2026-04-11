/**
 * src/pages/admin/DiscountsPage.tsx
 * Управление промокодами и скидками.
 */

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, AlertCircle, Tag, Trash2, ToggleLeft, ToggleRight, X, Check,
} from 'lucide-react'
import { adminApi } from '@/api/admin'
import type { Discount, CreateDiscountPayload, PaginatedResponse } from '@/api/admin'
import toast from 'react-hot-toast'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU')
}

interface CreateFormState {
  code: string
  type: 'percentage' | 'fixed'
  value: string
  min_order_amount: string
  max_uses: string
  expires_at: string
}

const EMPTY_FORM: CreateFormState = {
  code: '', type: 'percentage', value: '',
  min_order_amount: '', max_uses: '', expires_at: '',
}

export default function DiscountsPage() {
  const [data, setData] = useState<PaginatedResponse<Discount> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [page, setPage] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    adminApi.getDiscounts({ page })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [page])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!form.code || !form.value) return
    setCreating(true)
    const payload: CreateDiscountPayload = {
      code: form.code.toUpperCase().trim(),
      type: form.type,
      value: parseFloat(form.value),
      min_order_amount: form.min_order_amount ? parseFloat(form.min_order_amount) : null,
      max_uses: form.max_uses ? parseInt(form.max_uses) : null,
      expires_at: form.expires_at || null,
      is_active: true,
    }
    try {
      await adminApi.createDiscount(payload)
      toast.success('Промокод создан')
      setShowForm(false)
      setForm(EMPTY_FORM)
      load()
    } catch {
      toast.error('Ошибка создания промокода')
    } finally {
      setCreating(false)
    }
  }

  async function handleToggle(discount: Discount) {
    try {
      const updated = await adminApi.updateDiscount(discount.id, { is_active: !discount.is_active })
      setData((prev) => prev
        ? { ...prev, items: prev.items.map(d => d.id === updated.id ? updated : d) }
        : prev
      )
      toast.success(updated.is_active ? 'Промокод активирован' : 'Промокод деактивирован')
    } catch {
      toast.error('Ошибка')
    }
  }

  async function handleDelete(id: string) {
    try {
      await adminApi.deleteDiscount(id)
      setData((prev) => prev
        ? { ...prev, items: prev.items.filter(d => d.id !== id), total: prev.total - 1 }
        : prev
      )
      toast.success('Промокод удалён')
    } catch {
      toast.error('Ошибка удаления')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Скидки</h1>
          {data && <p className="text-sm text-white/40 mt-0.5">Промокодов: {data.total}</p>}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white transition-colors"
        >
          <Plus size={16} />
          Создать
        </button>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-white/[0.04] border border-blue-500/20 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Новый промокод</h2>
                <button onClick={() => setShowForm(false)}>
                  <X size={16} className="text-white/40 hover:text-white/80" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-white/40 mb-1.5 block">Код</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="SUMMER25"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white uppercase placeholder:text-white/25 placeholder:normal-case focus:outline-none focus:border-blue-500/50"
                  />
                </div>

                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Тип</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as 'percentage' | 'fixed' })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="percentage" className="bg-[#060f1e]">Процент %</option>
                    <option value="fixed" className="bg-[#060f1e]">Фиксированная ₽</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">
                    Значение {form.type === 'percentage' ? '(%)' : '(₽)'}
                  </label>
                  <input
                    type="number"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    placeholder={form.type === 'percentage' ? '10' : '500'}
                    min="0"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/50"
                  />
                </div>

                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Мин. сумма (₽)</label>
                  <input
                    type="number"
                    value={form.min_order_amount}
                    onChange={(e) => setForm({ ...form, min_order_amount: e.target.value })}
                    placeholder="Без ограничений"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/50"
                  />
                </div>

                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Макс. использований</label>
                  <input
                    type="number"
                    value={form.max_uses}
                    onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                    placeholder="Без ограничений"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/50"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-xs text-white/40 mb-1.5 block">Истекает</label>
                  <input
                    type="datetime-local"
                    value={form.expires_at}
                    onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>

              <button
                onClick={handleCreate}
                disabled={!form.code || !form.value || creating}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-sm font-semibold text-white transition-colors"
              >
                {creating ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Check size={16} />
                )}
                Создать промокод
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/40">
          <AlertCircle size={36} />
          <p className="text-sm">Ошибка загрузки</p>
          <button onClick={load} className="text-xs text-blue-400">Попробовать снова</button>
        </div>
      ) : !data?.items.length ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/30">
          <Tag size={36} />
          <p className="text-sm">Промокодов пока нет</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.items.map((discount, i) => (
            <motion.div
              key={discount.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.04 }}
              className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-bold text-white">{discount.code}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${discount.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-white/30'}`}>
                      {discount.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                  </div>
                  <div className="text-xs text-white/50">
                    {discount.type === 'percentage'
                      ? `${discount.value}% скидка`
                      : `${discount.value} ₽ скидка`}
                    {discount.min_order_amount != null && ` · от ${discount.min_order_amount} ₽`}
                  </div>
                  <div className="text-xs text-white/30 mt-0.5">
                    Использований: {discount.uses_count}
                    {discount.max_uses != null && `/${discount.max_uses}`}
                    {discount.expires_at && ` · до ${formatDate(discount.expires_at)}`}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggle(discount)}
                    className="text-white/40 hover:text-white/80 transition-colors"
                    title={discount.is_active ? 'Деактивировать' : 'Активировать'}
                  >
                    {discount.is_active
                      ? <ToggleRight size={20} className="text-emerald-400" />
                      : <ToggleLeft size={20} />
                    }
                  </button>
                  <button
                    onClick={() => handleDelete(discount.id)}
                    className="text-white/30 hover:text-red-400 transition-colors"
                    title="Удалить"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex items-center justify-between pt-2">
          <button
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            className="px-4 py-2 rounded-xl bg-white/5 text-sm text-white/60 disabled:opacity-30 hover:bg-white/10 transition-colors"
          >
            Назад
          </button>
          <span className="text-xs text-white/30">Страница {page + 1}</span>
          <button
            disabled={!data.has_next}
            onClick={() => setPage(page + 1)}
            className="px-4 py-2 rounded-xl bg-white/5 text-sm text-white/60 disabled:opacity-30 hover:bg-white/10 transition-colors"
          >
            Вперёд
          </button>
        </div>
      )}
    </div>
  )
}
