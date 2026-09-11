/**
 * src/pages/admin/CategoryEditModal.tsx
 * Редактирование подраздела: название, описание (по умолчанию — общее по игре),
 * и свои поля покупателя (по умолчанию — поля игры).
 */

import { useState } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/api/admin'
import type { AdminCategory } from '@/api/admin'
import InputFieldsEditor from '@/components/admin/InputFieldsEditor'

interface Props {
  category: AdminCategory
  onClose: () => void
  onSaved: (c: AdminCategory) => void
}

const inputCls =
  'w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all'

export default function CategoryEditModal({ category, onClose, onSaved }: Props) {
  const [name, setName] = useState(category.name)
  const [description, setDescription] = useState(category.description ?? '')
  const [autoEngine, setAutoEngine] = useState(category.auto_engine ?? '')
  const [fields, setFields] = useState<Record<string, unknown>[]>(
    (category.input_fields as Record<string, unknown>[] | null) ?? [],
  )
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) { toast.error('Введите название'); return }
    setSaving(true)
    try {
      const updated = await adminApi.updateCategory(category.id, {
        name: name.trim(),
        description: description.trim() || null,
        input_fields: fields, // [] = наследовать поля игры
        auto_engine: autoEngine || 'none', // '' → 'none' = выключить на бэке
      })
      onSaved(updated)
      onClose()
      toast.success('Сохранено')
    } catch {
      toast.error('Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 flex justify-center overflow-y-auto bg-black/60 backdrop-blur-sm" style={{ zIndex: 200 }} onClick={onClose}>
      <div className="w-full max-w-lg my-6 mx-4 h-fit rounded-2xl border border-white/[0.1] bg-[#0b1220] p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Подраздел</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-all">
            <X size={18} className="text-white/50" />
          </button>
        </div>

        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Название</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={128} className={inputCls} />
        </div>

        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Описание подраздела</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Пусто — показывается общее описание игры"
            className={inputCls + ' resize-none'}
          />
        </div>

        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Автовыдача (движок)</label>
          <select
            value={autoEngine}
            onChange={(e) => setAutoEngine(e.target.value)}
            className={inputCls + ' appearance-none'}
          >
            <option value="" className="bg-[#0b1220]">Нет — обычная выдача (ключи/вручную)</option>
            <option value="telegram_stars" className="bg-[#0b1220]">Telegram Stars (Fragment)</option>
            <option value="telegram_premium" className="bg-[#0b1220]">Telegram Premium (Fragment)</option>
          </select>
          <p className="text-xs text-white/40 mt-1.5">
            При оплате заказ выдаётся автоматически через Fragment. Нужны креды на
            странице «Интеграции» и поле покупателя с Telegram @username в этом подразделе или игре.
          </p>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Свои поля покупателя</h4>
          <p className="text-xs text-white/40 mb-2">
            Пусто — берутся поля игры. Заполните, чтобы у этого подраздела были свои запросы.
          </p>
          <InputFieldsEditor value={fields} onChange={setFields} />
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm font-semibold text-white transition-all active:scale-[0.98]"
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}
