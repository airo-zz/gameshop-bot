/**
 * src/pages/admin/DiscountsPage.tsx
 * Управление промокодами.
 */

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, AlertCircle, Tag, ToggleLeft, ToggleRight, X, Check,
} from 'lucide-react'
import { adminApi } from '@/api/admin'
import type { PromoCode, DiscountRule } from '@/api/admin'
import toast from 'react-hot-toast'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU')
}

interface CreateFormState {
  code: string
  discount_rule_id: string
  max_uses: string
  per_user_limit: string
  expires_at: string
}

const EMPTY_FORM: CreateFormState = {
  code: '',
  discount_rule_id: '',
  max_uses: '',
  per_user_limit: '1',
  expires_at: '',
}

export default function DiscountsPage() {
  const [promos, setPromos] = useState<PromoCode[]>([])
  const [rules, setRules] = useState<DiscountRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    Promise.all([adminApi.getPromos(), adminApi.getDiscountRules()])
      .then(([promosData, rulesData]) => {
        setPromos(promosData)
        setRules(rulesData)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!form.code || !form.discount_rule_id) return
    setCreating(true)
    try {
      const created = await adminApi.createPromo({
        code: form.code.toUpperCase().trim(),
        discount_rule_id: form.discount_rule_id,
        max_uses: form.max_uses ? parseInt(form.max_uses) : undefined,
        per_user_limit: form.per_user_limit ? parseInt(form.per_user_limit) : undefined,
        is_active: true,
        expires_at: form.expires_at || undefined,
      })
      toast.success('Промокод создан')
      setShowForm(false)
      setForm(EMPTY_FORM)
      setPromos((prev) => [created, ...prev])
    } catch {
      toast.error('Ошибка создания промокода')
    } finally {
      setCreating(false)
    }
  }

  async function handleToggle(promo: PromoCode) {
    try {
      const updated = await adminApi.updatePromo(promo.id, { is_active: !promo.is_active })
      setPromos((prev) => prev.map(p => p.id === updated.id ? updated : p))
      toast.success(updated.is_active ? 'Промокод активирован' : 'Промокод деактивирован')
    } catch {
      toast.error('Ошибка')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Скидки</h1>
          {!loading && <p className="text-sm text-white/40 mt-0.5">Промокодов: {promos.length}</p>}
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

                <div className="col-span-2">
                  <label className="text-xs text-white/40 mb-1.5 block">Правило скидки</label>
                  <select
                    value={form.discount_rule_id}
                    onChange={(e) => setForm({ ...form, discount_rule_id: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="" className="bg-[#060f1e]">Выберите правило...</option>
                    {rules.map((rule) => (
                      <option key={rule.id} value={rule.id} className="bg-[#060f1e]">
                        {rule.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Макс. использований</label>
                  <input
                    type="number"
                    value={form.max_uses}
                    onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                    placeholder="Без ограничений"
                    min="1"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/50"
                  />
                </div>

                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Лимит на пользователя</label>
                  <input
                    type="number"
                    value={form.per_user_limit}
                    onChange={(e) => setForm({ ...form, per_user_limit: e.target.value })}
                    placeholder="1"
                    min="1"
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
                disabled={!form.code || !form.discount_rule_id || creating}
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
      ) : promos.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/30">
          <Tag size={36} />
          <p className="text-sm">Промокодов пока нет</p>
        </div>
      ) : (
        <div className="space-y-2">
          {promos.map((promo, i) => (
            <motion.div
              key={promo.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.04 }}
              className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-bold text-white">{promo.code}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${promo.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-white/30'}`}>
                      {promo.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                  </div>
                  <div className="text-xs text-white/50 truncate">
                    {promo.discount_rule_name}
                  </div>
                  <div className="text-xs text-white/30 mt-0.5">
                    Использований: {promo.used_count}
                    {promo.max_uses != null && `/${promo.max_uses}`}
                    {promo.expires_at && ` · до ${formatDate(promo.expires_at)}`}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggle(promo)}
                    className="text-white/40 hover:text-white/80 transition-colors"
                    title={promo.is_active ? 'Деактивировать' : 'Активировать'}
                  >
                    {promo.is_active
                      ? <ToggleRight size={20} className="text-emerald-400" />
                      : <ToggleLeft size={20} />
                    }
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
