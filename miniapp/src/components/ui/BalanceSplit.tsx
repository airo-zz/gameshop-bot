// src/components/ui/BalanceSplit.tsx
// Доплата с баланса: часть заказа списывается с баланса, остаток — через шлюз.
// Бэкенд: POST /payments/orders/{id}/pay { use_balance: true } (холд в order.meta).
import { fmtPrice } from '@/utils/format'

/** Сколько спишется с баланса и сколько уйдёт через выбранный способ (с его комиссией). */
export function splitPayment(balance: number, base: number, methodTotal: number, enabled: boolean) {
  const can = balance > 0 && balance < base
  const hold = can && enabled ? balance : 0
  // Комиссия метода пропорциональна сумме, которая идёт через шлюз
  const ratio = base > 0 ? methodTotal / base : 1
  const rest = hold > 0 ? Math.ceil((base - hold) * ratio) : methodTotal
  return { can, hold, rest }
}

export default function BalanceSplitToggle({ balance, rest, methodLabel, checked, onChange }: {
  balance: number
  rest: number
  methodLabel: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 p-4 rounded-2xl text-left active:opacity-90"
      style={{ background: 'var(--bg2)', border: 'none', cursor: 'pointer' }}
    >
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Списать {fmtPrice(balance)} ₽ с баланса
        </span>
        <span className="block text-xs mt-0.5" style={{ color: 'var(--hint)' }}>
          {checked
            ? `Остальное — ${fmtPrice(rest)} ₽ через ${methodLabel}`
            : 'Оплатить всю сумму выбранным способом'}
        </span>
      </span>
      <span
        aria-hidden
        style={{
          width: 44, height: 26, borderRadius: 13, flexShrink: 0, position: 'relative',
          background: checked ? 'var(--accent)' : 'var(--bg3)', transition: 'background 0.2s ease',
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: checked ? 21 : 3, width: 20, height: 20, borderRadius: 10,
          background: '#fff', transition: 'left 0.2s ease',
        }} />
      </span>
    </button>
  )
}
