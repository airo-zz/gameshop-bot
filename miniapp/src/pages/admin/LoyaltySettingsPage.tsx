/**
 * src/pages/admin/LoyaltySettingsPage.tsx
 * Управление уровнями лояльности и настройками реферальной программы.
 */

import { useState, useCallback, useEffect } from 'react'
import { Plus, Pencil, Trash2, AlertCircle, X, Check, Save } from 'lucide-react'
import { adminApi, type LoyaltyLevel } from '@/api/admin'
import toast from 'react-hot-toast'

const inputCls =
  'w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-all duration-200'

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      className={[
        'w-10 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer',
        value ? 'bg-indigo-600' : 'bg-white/10',
      ].join(' ')}
    >
      <div
        className={[
          'w-5 h-5 rounded-full bg-white shadow transition-transform',
          value ? 'translate-x-4' : 'translate-x-0',
        ].join(' ')}
      />
    </div>
  )
}

// ── LevelForm ─────────────────────────────────────────────────────────────────

interface LevelFormData {
  name: string
  min_spent: string
  discount_percent: string
  cashback_percent: string
  is_active: boolean
}

const EMPTY_FORM: LevelFormData = {
  name: '',
  min_spent: '',
  discount_percent: '',
  cashback_percent: '',
  is_active: true,
}

function levelToForm(level: LoyaltyLevel): LevelFormData {
  return {
    name: level.name,
    min_spent: String(level.min_spent),
    discount_percent: String(level.discount_percent),
    cashback_percent: String(level.cashback_percent),
    is_active: level.is_active,
  }
}

interface LevelFormProps {
  initial?: LevelFormData
  onSave: (data: LevelFormData) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function LevelForm({ initial = EMPTY_FORM, onSave, onCancel, saving }: LevelFormProps) {
  const [form, setForm] = useState<LevelFormData>(initial)
  const set = (key: keyof LevelFormData, val: string | boolean) =>
    setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Введите название'); return }
    if (isNaN(Number(form.min_spent))) { toast.error('Неверный порог суммы'); return }
    if (isNaN(Number(form.discount_percent))) { toast.error('Неверный процент скидки'); return }
    if (isNaN(Number(form.cashback_percent))) { toast.error('Неверный процент кэшбэка'); return }
    onSave(form)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-white/50 mb-1 block">Название</label>
          <input
            className={inputCls}
            placeholder="Например: Gold"
            value={form.name}
            onChange={e => set('name', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-white/50 mb-1 block">Порог суммы, ₽</label>
          <input
            type="number"
            min="0"
            className={inputCls}
            placeholder="5000"
            value={form.min_spent}
            onChange={e => set('min_spent', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-white/50 mb-1 block">Скидка, %</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            className={inputCls}
            placeholder="5"
            value={form.discount_percent}
            onChange={e => set('discount_percent', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-white/50 mb-1 block">Кэшбэк, %</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            className={inputCls}
            placeholder="2"
            value={form.cashback_percent}
            onChange={e => set('cashback_percent', e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 self-end pb-1">
          <Toggle value={form.is_active} onChange={v => set('is_active', v)} />
          <span className="text-sm text-white/60">Активен</span>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-sm font-semibold text-white transition-all duration-200 active:scale-[0.97]"
        >
          <Check size={15} />
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white/60 transition-all duration-200 active:scale-[0.97]"
        >
          <X size={15} />
          Отмена
        </button>
      </div>
    </form>
  )
}

// ── LoyaltyRow ────────────────────────────────────────────────────────────────

interface LoyaltyRowProps {
  level: LoyaltyLevel
  onEdit: () => void
  onDelete: () => void
  onToggle: (active: boolean) => void
  deleting: boolean
  toggling: boolean
}

function LoyaltyRow({ level, onEdit, onDelete, onToggle, deleting, toggling }: LoyaltyRowProps) {
  return (
    <div className="flex items-center gap-3 bg-[#1a1f2e] border border-white/[0.06] rounded-xl px-4 py-3.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {level.icon_emoji && (
            <span className="text-base">{level.icon_emoji}</span>
          )}
          <span className="text-sm font-semibold text-white truncate">{level.name}</span>
          <span
            className={`text-xs font-medium ${level.is_active ? 'text-emerald-400' : 'text-white/30'}`}
          >
            {level.is_active ? 'Активен' : 'Неактивен'}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-xs text-white/50">
            от {level.min_spent.toLocaleString('ru')} ₽
          </span>
          <span className="text-xs text-indigo-400">
            скидка {level.discount_percent}%
          </span>
          <span className="text-xs text-emerald-400/80">
            кэшбэк {level.cashback_percent}%
          </span>
        </div>
      </div>

      <Toggle value={level.is_active} onChange={v => !toggling && onToggle(v)} />

      <button
        onClick={onEdit}
        className="p-1.5 rounded-lg hover:bg-white/[0.08] active:scale-[0.9] transition-all duration-200 shrink-0"
        title="Редактировать"
      >
        <Pencil size={15} className="text-white/40" />
      </button>

      <button
        onClick={onDelete}
        disabled={deleting}
        className="p-1.5 rounded-lg hover:bg-red-500/20 active:scale-[0.9] transition-all duration-200 disabled:opacity-40 shrink-0"
        title="Удалить"
      >
        <Trash2 size={15} className="text-red-400/70" />
      </button>
    </div>
  )
}

// ── ReferralSettingsBlock ─────────────────────────────────────────────────────

function ReferralSettingsBlock() {
  const [bonusAmount, setBonusAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminApi.getReferralSettings()
      .then(data => setBonusAmount(String(data.bonus_amount)))
      .catch(() => toast.error('Не удалось загрузить настройки реферальной программы'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    const num = Number(bonusAmount)
    if (isNaN(num) || num < 0) {
      toast.error('Введите корректную сумму бонуса')
      return
    }
    setSaving(true)
    try {
      const updated = await adminApi.updateReferralSettings({ bonus_amount: num })
      setBonusAmount(String(updated.bonus_amount))
      toast.success('Настройки реферальной программы сохранены')
    } catch {
      toast.error('Не удалось сохранить настройки')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">Реферальная программа</h2>
        <p className="text-xs text-white/40 mt-0.5">Сумма бонуса, начисляемого рефереру за каждого нового пользователя, совершившего первый заказ</p>
      </div>

      <div className="bg-[#1a1f2e] border border-white/[0.06] rounded-xl p-4 space-y-3">
        {loading ? (
          <p className="text-white/40 text-sm">Загрузка...</p>
        ) : (
          <>
            <div>
              <label className="text-xs text-white/50 mb-1 block">Бонус за реферала, ₽</label>
              <input
                type="number"
                min="0"
                step="1"
                className={inputCls}
                placeholder="100"
                value={bonusAmount}
                onChange={e => setBonusAmount(e.target.value)}
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-sm font-semibold text-white transition-all duration-200 active:scale-[0.97]"
            >
              <Save size={15} />
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LoyaltySettingsPage() {
  const [levels, setLevels] = useState<LoyaltyLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    adminApi.getLoyaltyLevels()
      .then(setLevels)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async (form: LevelFormData) => {
    setSavingId('new')
    try {
      const created = await adminApi.createLoyaltyLevel({
        name: form.name,
        min_spent: Number(form.min_spent),
        discount_percent: Number(form.discount_percent),
        cashback_percent: Number(form.cashback_percent),
        is_active: form.is_active,
      })
      setLevels(prev => [...prev, created])
      setShowAddForm(false)
      toast.success('Уровень создан')
    } catch {
      toast.error('Не удалось создать уровень')
    } finally {
      setSavingId(null)
    }
  }

  const handleUpdate = async (id: string, form: LevelFormData) => {
    setSavingId(id)
    try {
      const updated = await adminApi.updateLoyaltyLevel(id, {
        name: form.name,
        min_spent: Number(form.min_spent),
        discount_percent: Number(form.discount_percent),
        cashback_percent: Number(form.cashback_percent),
        is_active: form.is_active,
      })
      setLevels(prev => prev.map(l => l.id === id ? updated : l))
      setEditingId(null)
      toast.success('Уровень обновлён')
    } catch {
      toast.error('Не удалось обновить уровень')
    } finally {
      setSavingId(null)
    }
  }

  const handleToggle = async (level: LoyaltyLevel, active: boolean) => {
    setTogglingId(level.id)
    try {
      const updated = await adminApi.updateLoyaltyLevel(level.id, { is_active: active })
      setLevels(prev => prev.map(l => l.id === level.id ? updated : l))
    } catch {
      toast.error('Не удалось обновить')
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async (level: LoyaltyLevel) => {
    if (!window.confirm(`Удалить уровень "${level.name}"?`)) return
    setDeletingId(level.id)
    try {
      await adminApi.deleteLoyaltyLevel(level.id)
      setLevels(prev => prev.filter(l => l.id !== level.id))
      toast.success('Уровень удалён')
    } catch {
      toast.error('Не удалось удалить уровень')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-8">

      {/* ── Loyalty levels section ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Уровни лояльности</h1>
            <p className="text-xs text-white/40 mt-0.5">Настройте скидки и кэшбэк по уровням</p>
          </div>
          {!showAddForm && (
            <button
              onClick={() => { setShowAddForm(true); setEditingId(null) }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.97] text-xs font-semibold text-white transition-all duration-200"
            >
              <Plus size={15} />
              Добавить
            </button>
          )}
        </div>

        {/* Add form */}
        {showAddForm && (
          <LevelForm
            onSave={handleCreate}
            onCancel={() => setShowAddForm(false)}
            saving={savingId === 'new'}
          />
        )}

        {/* List */}
        {loading ? (
          <p className="text-white/40 text-sm py-8 text-center">Загрузка...</p>
        ) : error ? (
          <div className="flex flex-col items-center py-16 gap-3 text-white/40">
            <AlertCircle size={36} />
            <p className="text-sm">Ошибка загрузки уровней</p>
            <button
              onClick={load}
              className="text-xs text-white/50 hover:text-white/70 active:scale-[0.98] transition-transform"
            >
              Попробовать снова
            </button>
          </div>
        ) : levels.length === 0 && !showAddForm ? (
          <div className="flex flex-col items-center py-16 gap-3 text-white/30">
            <p className="text-sm">Уровней лояльности ещё нет</p>
          </div>
        ) : (
          <div className="space-y-2">
            {levels.map(level => (
              <div key={level.id}>
                {editingId === level.id ? (
                  <LevelForm
                    initial={levelToForm(level)}
                    onSave={form => handleUpdate(level.id, form)}
                    onCancel={() => setEditingId(null)}
                    saving={savingId === level.id}
                  />
                ) : (
                  <LoyaltyRow
                    level={level}
                    onEdit={() => { setEditingId(level.id); setShowAddForm(false) }}
                    onDelete={() => handleDelete(level)}
                    onToggle={v => handleToggle(level, v)}
                    deleting={deletingId === level.id}
                    toggling={togglingId === level.id}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-white/[0.06]" />

      {/* ── Referral settings section ── */}
      <ReferralSettingsBlock />
    </div>
  )
}
