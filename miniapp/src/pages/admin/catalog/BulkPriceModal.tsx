/**
 * src/pages/admin/catalog/BulkPriceModal.tsx
 * Модалка массового изменения цен раздела: на процент (в том числе вниз) или на фиксированную сумму.
 * Часть страницы «Каталог» (pages/admin/CatalogPage.tsx).
 */

import { useState } from 'react'
import { X } from '@/components/ui/icons'
import { adminApi } from '@/api/admin'
import toast from 'react-hot-toast'
import { inputCls } from './helpers'

export interface BulkPriceModalProps {
  categoryId: string
  onClose: () => void
  onApplied: () => void
}

export function BulkPriceModal({ categoryId, onClose, onApplied }: BulkPriceModalProps) {
  const [mode, setMode] = useState<'percent' | 'fixed'>('percent')
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)

  const handleApply = async () => {
    const numVal = parseFloat(value)
    if (isNaN(numVal)) {
      toast.error('Введите корректное значение')
      return
    }
    if (mode === 'percent') {
      // Процент может быть отрицательным (снижение), но не ≤ -100%.
      if (numVal <= -100) {
        toast.error('Снижение не может быть 100% и более')
        return
      }
    } else if (numVal < 0) {
      toast.error('Цена не может быть отрицательной')
      return
    }
    setLoading(true)
    try {
      const res = await adminApi.bulkPriceUpdate({
        mode,
        value: numVal,
        scope: 'category',
        category_id: categoryId,
      })
      toast.success(`Обновлено товаров: ${res.updated_count}`)
      onApplied()
      onClose()
    } catch {
      toast.error('Ошибка при обновлении цен')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-[var(--bg2)] border border-[var(--border)] rounded-t-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--text)]">Изменить цены</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg3)] active:scale-[0.97] transition-all"
          >
            <X size={18} className="text-[var(--hint)]" />
          </button>
        </div>

        {/* Режим */}
        <div className="flex gap-1 bg-[var(--bg2)] p-1 rounded-xl">
          {(['percent', 'fixed'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={[
                'flex-1 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 active:scale-[0.97]',
                mode === m ? 'bg-[var(--bg3)] text-[var(--text)]' : 'text-[var(--hint)] hover:text-[var(--text-2)]',
              ].join(' ')}
            >
              {m === 'percent' ? 'Процент' : 'Фиксированная цена'}
            </button>
          ))}
        </div>

        {/* Значение */}
        <div>
          <label className="text-xs text-[var(--hint)] mb-1 block">
            {mode === 'percent' ? 'Изменение, %' : 'Новая цена, ₽'}
          </label>
          <input
            type="number"
            min={mode === 'percent' ? undefined : '0'}
            step={mode === 'percent' ? '1' : '0.01'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={mode === 'percent' ? 'Например: 10 или -5' : 'Например: 299'}
            className={inputCls}
          />
          {mode === 'percent' && value && !isNaN(parseFloat(value)) && (
            <p className="text-xs text-[var(--hint)] mt-1">
              Цена будет умножена на коэффициент {(1 + parseFloat(value) / 100).toFixed(4)}
            </p>
          )}
        </div>

        <button
          onClick={handleApply}
          disabled={loading || !value}
          className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--btn-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-[var(--text)] transition-all duration-200 active:scale-[0.97]"
        >
          {loading ? 'Применяем...' : 'Применить'}
        </button>
      </div>
    </div>
  )
}
