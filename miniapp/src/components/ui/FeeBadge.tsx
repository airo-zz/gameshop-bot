// Плашка комиссии способа оплаты: «Комиссия 0%» — на экранах выбора способа
// (чекаут, оплата заказа, пополнение баланса) в Mini App и на сайте.
import { feeText } from '@/utils/format'

export default function FeeBadge({ pct }: { pct: number | null | undefined }) {
  const text = feeText(pct)
  if (!text) return null
  const free = Number(pct) === 0
  return (
    <span
      className="text-[11px] font-medium px-1.5 py-0.5 rounded-md whitespace-nowrap num"
      style={{
        background: free ? 'var(--accent-soft)' : 'var(--bg)',
        color: free ? 'var(--link)' : 'var(--hint)',
        border: '1px solid var(--border)',
      }}
    >
      {text}
    </span>
  )
}
