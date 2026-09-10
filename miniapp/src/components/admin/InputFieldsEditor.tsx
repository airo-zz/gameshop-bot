/**
 * src/components/admin/InputFieldsEditor.tsx
 * Редактор «Данных от покупателя» (input_fields). Используется в редакторе игры.
 * Работает с сырым JSON-форматом полей: {key,label,type,required,placeholder?,options?}.
 */

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

interface FieldForm {
  key: string
  label: string
  type: 'text' | 'number' | 'select'
  placeholder: string
  required: boolean
  options: string[]
}

const TYPE_OPTIONS: { value: FieldForm['type']; label: string }[] = [
  { value: 'text', label: 'Текст' },
  { value: 'number', label: 'Число' },
  { value: 'select', label: 'Выбор из списка' },
]

function slugifyKey(label: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
    щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  }
  return label.toLowerCase().split('').map((ch) => (ch in map ? map[ch] : ch)).join('')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalize(raw: unknown): FieldForm {
  const f = (raw ?? {}) as Record<string, unknown>
  const type = f.type === 'number' || f.type === 'select' ? f.type : 'text'
  return {
    key: typeof f.key === 'string' ? f.key : '',
    label: typeof f.label === 'string' ? f.label : '',
    type,
    placeholder: typeof f.placeholder === 'string' ? f.placeholder : '',
    required: f.required !== false,
    options: Array.isArray(f.options) ? f.options.map(String) : [],
  }
}

function serialize(fields: FieldForm[]): Record<string, unknown>[] {
  const used = new Set<string>()
  const result: Record<string, unknown>[] = []
  fields.forEach((f, idx) => {
    const label = f.label.trim()
    if (!label) return
    let key = f.key.trim() || slugifyKey(label) || `field_${idx + 1}`
    while (used.has(key)) key = `${key}_${idx + 1}`
    used.add(key)
    const out: Record<string, unknown> = { key, label, type: f.type, required: f.required }
    const placeholder = f.placeholder.trim()
    if (placeholder) out.placeholder = placeholder
    if (f.type === 'select') out.options = f.options.map((o) => o.trim()).filter(Boolean)
    result.push(out)
  })
  return result
}

const inputCls =
  'w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all'

interface Props {
  value: unknown[]
  onChange: (fields: Record<string, unknown>[]) => void
}

export default function InputFieldsEditor({ value, onChange }: Props) {
  const [fields, setFields] = useState<FieldForm[]>(() => (value ?? []).map(normalize))

  function commit(next: FieldForm[]) {
    setFields(next)
    onChange(serialize(next))
  }

  const add = () =>
    commit([...fields, { key: '', label: '', type: 'text', placeholder: '', required: true, options: [] }])
  const update = (idx: number, patch: Partial<FieldForm>) =>
    commit(fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  const remove = (idx: number) => commit(fields.filter((_, i) => i !== idx))

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/40">
        Поля, которые покупатель заполнит один раз при оформлении заказа этой игры
        (логин, почта, ID, выбор ОС и т.п.).
      </p>

      {fields.map((field, idx) => (
        <div key={idx} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <input
              value={field.label}
              onChange={(e) => update(idx, { label: e.target.value })}
              placeholder="Название поля (напр. Логин)"
              className={inputCls + ' flex-1'}
            />
            <button
              type="button"
              onClick={() => remove(idx)}
              aria-label="Удалить поле"
              className="p-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-red-500/10 hover:border-red-500/30 text-white/40 hover:text-red-400 transition-all"
            >
              <Trash2 size={16} />
            </button>
          </div>

          <div className="flex gap-2">
            <select
              value={field.type}
              onChange={(e) => update(idx, { type: e.target.value as FieldForm['type'] })}
              className={inputCls + ' flex-1'}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-neutral-900">{o.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 px-3 rounded-xl bg-white/[0.05] border border-white/[0.08] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => update(idx, { required: e.target.checked })}
                className="accent-blue-600"
              />
              <span className="text-sm text-white/70">Обязательно</span>
            </label>
          </div>

          {field.type === 'select' ? (
            <textarea
              value={field.options.join('\n')}
              onChange={(e) => update(idx, { options: e.target.value.split('\n') })}
              rows={3}
              placeholder="Варианты — по одному на строку"
              className={inputCls + ' resize-none'}
            />
          ) : (
            <input
              value={field.placeholder}
              onChange={(e) => update(idx, { placeholder: e.target.value })}
              placeholder="Подсказка (напр. Введите ваш логин)"
              className={inputCls}
            />
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-white/[0.05] border border-dashed border-white/[0.15] hover:bg-white/[0.08] hover:border-white/25 text-sm text-white/60 hover:text-white/80 transition-all"
      >
        <Plus size={16} /> Добавить поле
      </button>
    </div>
  )
}
