/**
 * src/pages/admin/catalog/QuickAddRow.tsx
 * Строка быстрого создания товара под разделом: название и цена в $ — без перехода в редактор.
 * Часть страницы «Каталог» (pages/admin/CatalogPage.tsx).
 */

import { useState, useRef } from 'react'
import { Plus } from '@/components/ui/icons'
import { adminApi } from '@/api/admin'
import { type AdminProductListItem } from '@/api/admin'
import toast from 'react-hot-toast'

export interface QuickAddRowProps {
  categoryId: string
  onCreated: (product: AdminProductListItem) => void
}

export function QuickAddRow({ categoryId, onCreated }: QuickAddRowProps) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed || price === '' || Number(price) < 0) return
    setSaving(true)
    try {
      const created = await adminApi.createProduct({
        category_id: categoryId,
        name: trimmed,
        price_usd: Number(price),
      })
      onCreated(created as unknown as AdminProductListItem)
      setName('')
      setPrice('')
      nameRef.current?.focus()
    } catch {
      toast.error('Не удалось создать товар')
    } finally {
      setSaving(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  const ready = name.trim() !== '' && price !== ''

  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg2)] px-2.5 py-2">
      <Plus size={15} className="text-[var(--hint)] shrink-0" />
      <input
        ref={nameRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Название лота"
        className="flex-1 min-w-0 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none"
      />
      <input
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="$"
        min={0}
        step="0.01"
        className="w-20 shrink-0 bg-[var(--bg2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)] text-right placeholder:text-[var(--hint)] focus:outline-none focus:border-[var(--border)]"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!ready || saving}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--btn-hover)] disabled:opacity-30 disabled:cursor-not-allowed text-xs font-semibold text-[var(--text)] transition-all active:scale-[0.97]"
      >
        {saving ? '…' : 'Создать'}
      </button>
    </div>
  )
}
