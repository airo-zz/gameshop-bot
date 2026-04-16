/**
 * src/pages/admin/DiscountsPage.tsx
 * Управление промокодами.
 */

import { useEffect, useState, useCallback } from 'react'
import {
  Plus, AlertCircle, Tag, ToggleLeft, ToggleRight, X, Check, Trash2,
} from 'lucide-react'
import { adminApi } from '@/api/admin'
import type { PromoCode } from '@/api/admin'
import toast from 'react-hot-toast'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU')
}

interface CreateFormState {
  code: string
  discount_value_type: 'percent' | 'fixed'
  discount_value: string
  max_discount_amount: string
  min_order_amount: string
  max_uses_unlimited: boolean
  max_uses: string
  per_user_limit: string
  expires_unlimited: boolean
  expires_at: string
}

const EMPTY_FORM: CreateFormState = {
  code: '',
  discount_value_type: 'percent',
  discount_value: '',
  max_discount_amount: '',
  min_order_amount: '',
  max_uses_unlimited: true,
  max_uses: '',
  per_user_limit: '1',
  expires_unlimited: true,
  expires_at: '',
}

const inputCls = 'w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-all duration-200'

export default function DiscountsPage() {
  const [promos, setPromos] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    adminApi.getPromos()
      .then(setPromos)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const isFormValid = form.code.trim().length > 0 && form.discount_value.trim().length > 0

  async function handleCreate() {
    if (!isFormValid) return
    setCreating(true)
    try {
      const created = await adminApi.createPromoDirect({
        code: form.code.toUpperCase().trim(),
        discount_value_type: form.discount_value_type,
        discount_value: parseFloat(form.discount_value),
        max_discount_amount: form.max_discount_amount ? parseFloat(form.max_discount_amount) : undefined,
        min_order_amount: form.min_order_amount ? parseFloat(form.min_order_amount) : undefined,
        max_uses: (!form.max_uses_unlimited && form.max_uses) ? parseInt(form.max_uses) : undefined,
        per_user_limit: form.per_user_limit ? parseInt(form.per_user_limit) : 1,
        expires_at: (!form.expires_unlimited && form.expires_at) ? form.expires_at : undefined,
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

  async function handleDelete(promo: PromoCode) {
    if (!window.confirm(`Удалить промокод ${promo.code}?`)) return
    try {
      await adminApi.deletePromo(promo.id)
      setPromos(prev => prev.filter(p => p.id !== promo.id))
      toast.success('Промокод удалён')
    } catch {
      toast.error('Ошибка удаления')
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
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-sm font-semibold text-white transition-all duration-200"
        >
          <Plus size={16} />
          Создать
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Новый промокод</h2>
                <button
                  onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
                  className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors active:scale-[0.95]"
                >
                  <X size={16} className="text-white/40" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Код */}
                <div className="col-span-2">
                  <label className="text-xs text-white/50 mb-1.5 block">Код</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="SUMMER25"
                    className={`${inputCls} uppercase`}
                  />
                </div>

                {/* Тип скидки */}
                <div className="col-span-2">
                  <label className="text-xs text-white/50 mb-1.5 block">Тип скидки</label>
                  <div className="flex gap-2">
                    {(['percent', 'fixed'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setForm({ ...form, discount_value_type: type, max_discount_amount: '' })}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98] ${
                          form.discount_value_type === type
                            ? 'bg-blue-600 text-white'
                            : 'bg-white/[0.05] text-white/50 hover:bg-white/[0.08]'
                        }`}
                      >
                        {type === 'percent' ? 'Процент %' : 'Фикс. сумма'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Размер скидки */}
                <div className={form.discount_value_type === 'percent' ? '' : 'col-span-2'}>
                  <label className="text-xs text-white/50 mb-1.5 block">
                    Размер скидки {form.discount_value_type === 'percent' ? '(%)' : '(₽)'}
                  </label>
                  <input
                    type="number"
                    value={form.discount_value}
                    onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                    placeholder={form.discount_value_type === 'percent' ? '10' : '500'}
                    min="0"
                    step={form.discount_value_type === 'percent' ? '1' : '50'}
                    className={inputCls}
                  />
                </div>

                {/* Макс. скидка (только для процентных) */}
                {form.discount_value_type === 'percent' && (
                  <div>
                    <label className="text-xs text-white/50 mb-1.5 block">Макс. скидка (₽)</label>
                    <input
                      type="number"
                      value={form.max_discount_amount}
                      onChange={(e) => setForm({ ...form, max_discount_amount: e.target.value })}
                      placeholder="Без лимита"
                      min="0"
                      className={inputCls}
                    />
                  </div>
                )}

                {/* Мин. сумма заказа */}
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">Мин. сумма (₽)</label>
                  <input
                    type="number"
                    value={form.min_order_amount}
                    onChange={(e) => setForm({ ...form, min_order_amount: e.target.value })}
                    placeholder="0"
                    min="0"
                    className={inputCls}
                  />
                </div>

                {/* Лимит на пользователя */}
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">Лимит / пользователь</label>
                  <input
                    type="number"
                    value={form.per_user_limit}
                    onChange={(e) => setForm({ ...form, per_user_limit: e.target.value })}
                    placeholder="1"
                    min="1"
                    className={inputCls}
                  />
                </div>

                {/* Макс. использований */}
                <div className="col-span-2">
                  <label className="text-xs text-white/50 mb-1.5 block">Макс. использований</label>
                  <div className="flex gap-2 mb-2">
                    {[{ val: true, label: 'Без ограничений' }, { val: false, label: 'Указать число' }].map(({ val, label }) => (
                      <button
                        key={String(val)}
                        type="button"
                        onClick={() => setForm({ ...form, max_uses_unlimited: val, max_uses: '' })}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 active:scale-[0.98] ${
                          form.max_uses_unlimited === val
                            ? 'bg-blue-600 text-white'
                            : 'bg-white/[0.05] text-white/50 hover:bg-white/[0.08]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {!form.max_uses_unlimited && (
                    <input
                      type="number"
                      value={form.max_uses}
                      onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                      placeholder="100"
                      min="1"
                      className={inputCls}
                    />
                  )}
                </div>

                {/* Срок действия */}
                <div className="col-span-2">
                  <label className="text-xs text-white/50 mb-1.5 block">Срок действия</label>
                  <div className="flex gap-2 mb-2">
                    {[{ val: true, label: 'Бессрочный' }, { val: false, label: 'До даты' }].map(({ val, label }) => (
                      <button
                        key={String(val)}
                        type="button"
                        onClick={() => setForm({ ...form, expires_unlimited: val, expires_at: '' })}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 active:scale-[0.98] ${
                          form.expires_unlimited === val
                            ? 'bg-blue-600 text-white'
                            : 'bg-white/[0.05] text-white/50 hover:bg-white/[0.08]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {!form.expires_unlimited && (
                    <input
                      type="datetime-local"
                      value={form.expires_at}
                      onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                      className={inputCls}
                    />
                  )}
                </div>
              </div>

              <button
                onClick={handleCreate}
                disabled={!isFormValid || creating}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-sm font-semibold text-white transition-all duration-200 active:scale-[0.98]"
              >
                {creating ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Check size={16} />
                )}
                Создать промокод
              </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-white/40 text-sm py-8 text-center">Загрузка...</p>
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/40">
          <AlertCircle size={36} />
          <p className="text-sm">Ошибка загрузки</p>
          <button onClick={load} className="text-xs text-blue-400 active:scale-[0.98] transition-transform">Попробовать снова</button>
        </div>
      ) : promos.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/30">
          <Tag size={36} />
          <p className="text-sm">Промокодов пока нет</p>
        </div>
      ) : (
        <div className="space-y-2">
          {promos.map((promo) => (
            <div
              key={promo.id}
              className="bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-bold text-white">{promo.code}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${promo.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.05] text-white/30'}`}>
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
                    className="text-white/40 hover:text-white/80 active:scale-[0.9] transition-all duration-200"
                    title={promo.is_active ? 'Деактивировать' : 'Активировать'}
                  >
                    {promo.is_active
                      ? <ToggleRight size={20} className="text-emerald-400" />
                      : <ToggleLeft size={20} />
                    }
                  </button>
                  <button
                    onClick={() => handleDelete(promo)}
                    className="text-white/30 hover:text-red-400 active:scale-[0.9] transition-all duration-200"
                    title="Удалить"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
