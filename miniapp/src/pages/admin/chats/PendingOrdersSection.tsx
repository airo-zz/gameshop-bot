/**
 * src/pages/admin/chats/PendingOrdersSection.tsx
 * Блок «Ожидают оператора» над списком чатов: оплаченные заказы без исполнителя, кнопка «Взять».
 * Часть страницы «Чаты» админки (pages/admin/AdminChatsPage.tsx).
 */

import { useState } from 'react'
import { Package, User, ChevronDown } from '@/components/ui/icons'
import { userIdLabel, type AdminOrderListItem } from '@/api/admin'

export const PENDING_VISIBLE = 3

export function PendingOrdersSection({
  orders,
  onClaim,
  onOpenChat,
}: {
  orders: AdminOrderListItem[]
  onClaim: (id: string) => Promise<void>
  onOpenChat: (orderId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [claiming, setClaiming] = useState<string | null>(null)

  if (orders.length === 0) return null

  const visible = expanded ? orders : orders.slice(0, PENDING_VISIBLE)
  const hiddenCount = orders.length - PENDING_VISIBLE

  const handleClaim = async (e: { stopPropagation: () => void }, orderId: string) => {
    e.stopPropagation()
    if (claiming) return
    setClaiming(orderId)
    try {
      await onClaim(orderId)
    } finally {
      setClaiming(null)
    }
  }

  return (
    <div style={{
      flexShrink: 0,
      borderBottom: '1px solid rgba(220,235,255,0.06)',
      padding: '10px 10px 6px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Package size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Ожидают оператора
        </span>
        <span style={{
          marginLeft: 'auto', minWidth: 18, height: 18, borderRadius: 9,
          background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)',
          color: '#f59e0b', fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 5px', flexShrink: 0,
        }}>
          {orders.length}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {visible.map(order => {
          const userName = order.user_first_name || (order.user_username ? `@${order.user_username}` : (order.user_id_label || userIdLabel({ telegram_id: order.user_telegram_id })))
          const isClaiming = claiming === order.id
          return (
            <button
              key={order.id}
              type="button"
              onClick={() => onOpenChat(order.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 10px', borderRadius: 10, border: 'none', textAlign: 'left',
                background: 'rgba(245,158,11,0.07)', cursor: 'pointer',
                borderLeft: '2px solid rgba(245,158,11,0.4)',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {order.order_number}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(220,235,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.total_amount.toLocaleString('ru-RU')} ₽
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <User size={10} style={{ color: 'rgba(220,235,255,0.35)', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'rgba(220,235,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {userName}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(220,235,255,0.25)', flexShrink: 0, marginLeft: 2 }}>
                    · {order.items_count} поз.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => handleClaim(e, order.id)}
                disabled={!!claiming}
                style={{
                  flexShrink: 0, padding: '4px 10px', borderRadius: 7,
                  background: isClaiming ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.2)',
                  border: '1px solid rgba(245,158,11,0.4)',
                  color: '#f59e0b', fontSize: 11, fontWeight: 600,
                  cursor: claiming ? 'default' : 'pointer',
                  opacity: claiming && !isClaiming ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {isClaiming ? '...' : 'Взять'}
              </button>
            </button>
          )
        })}
      </div>

      {hiddenCount > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            width: '100%', marginTop: 5, padding: '5px 0',
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            color: 'rgba(220,235,255,0.35)', fontSize: 11,
          }}
        >
          <ChevronDown size={12} />
          Показать ещё {hiddenCount}
        </button>
      )}
    </div>
  )
}
