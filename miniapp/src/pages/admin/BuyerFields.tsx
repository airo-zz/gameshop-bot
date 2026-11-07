/**
 * src/pages/admin/BuyerFields.tsx
 * Данные покупателя заказа (почта, пароль, ID игрока…) — у каждого поля кнопка
 * «Скопировать», пароль скрыт до нажатия «показать», есть «Скопировать всё».
 * Список собирает бэкенд (order.buyer_fields) — тот же, что уходит в хаб и боту сотрудников.
 * Используется на странице заказа и в чате (под сообщением об оплате).
 */

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Copy, Eye, EyeOff } from '@/components/ui/icons'
import type { AdminBuyerField } from '@/api/admin'

const copy = (text: string, what = 'Скопировано') =>
  navigator.clipboard?.writeText(text).then(() => toast.success(what), () => toast.error('Не удалось скопировать'))

function Row({ f }: { f: AdminBuyerField }) {
  const [shown, setShown] = useState(!f.secret)
  return (
    <div className="flex items-center gap-2 text-sm min-w-0">
      <span className="text-[var(--hint)] shrink-0">{f.label}</span>
      <span className="flex-1 min-w-0 text-right font-mono text-[var(--text)] break-all select-all">
        {shown ? f.value : '••••••••'}
      </span>
      {f.secret && (
        <button type="button" onClick={() => setShown((v) => !v)} title={shown ? 'Скрыть' : 'Показать'}
                className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--hint)] hover:text-[var(--text)] hover:bg-[var(--bg3)]">
          {shown ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
      <button type="button" onClick={() => copy(f.value, `${f.label}: скопировано`)} title="Скопировать"
              className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--hint)] hover:text-[var(--text)] hover:bg-[var(--bg3)]">
        <Copy size={14} />
      </button>
    </div>
  )
}

export default function BuyerFields({ fields, compact = false }: { fields: AdminBuyerField[]; compact?: boolean }) {
  if (!fields.length) {
    return <p className="text-xs text-[var(--hint)]">Покупатель не указал данные</p>
  }
  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {fields.map((f, i) => <Row key={i} f={f} />)}
      {fields.length > 1 && (
        <button type="button" onClick={() => copy(fields.map((f) => `${f.label}: ${f.value}`).join('\n'), 'Данные скопированы')}
                className="mt-1 inline-flex items-center gap-1.5 text-xs text-[var(--link)] hover:text-[var(--text)]">
          <Copy size={12} /> Скопировать всё
        </button>
      )}
    </div>
  )
}
