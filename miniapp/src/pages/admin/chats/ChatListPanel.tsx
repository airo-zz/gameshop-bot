/**
 * src/pages/admin/chats/ChatListPanel.tsx
 * Левая панель: список чатов (непрочитанные выделены), выбор чата.
 * Часть страницы «Чаты» админки (pages/admin/AdminChatsPage.tsx).
 */

import { MessageSquare } from '@/components/ui/icons'
import { type AdminChatListItem, type AdminOrderListItem } from '@/api/admin'
import { PendingOrdersSection } from './PendingOrdersSection'
import { formatTime, getInitials, getUserLabel } from './helpers'

export function ChatListPanel({
  chats,
  loading,
  selectedId,
  onSelect,
  pendingOrders,
  onClaimOrder,
  onOpenOrderChat,
}: {
  chats: AdminChatListItem[]
  loading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  pendingOrders: AdminOrderListItem[]
  onClaimOrder: (id: string) => Promise<void>
  onOpenOrderChat: (orderId: string) => void
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      borderRight: '1px solid rgba(220,235,255,0.06)',
      background: 'rgba(220,235,255,0.01)',
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, padding: '14px 16px 10px',
        borderBottom: '1px solid rgba(220,235,255,0.06)',
      }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>Чаты</h2>
      </div>

      {/* Pending orders */}
      <PendingOrdersSection
        orders={pendingOrders}
        onClaim={onClaimOrder}
        onOpenChat={onOpenOrderChat}
      />

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading && chats.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 12px' }}>
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                style={{
                  height: 64, borderRadius: 10,
                  background: 'rgba(220,235,255,0.05)',
                  animation: 'pulse 1.5s ease infinite',
                }}
              />
            ))}
          </div>
        ) : chats.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            paddingTop: 40, gap: 8, color: 'rgba(220,235,255,0.3)',
          }}>
            <MessageSquare size={32} style={{ opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 13 }}>Нет чатов</p>
          </div>
        ) : (
          chats.map(chat => {
            const isSelected = chat.id === selectedId
            const hasUnread = chat.admin_unread_count > 0
            return (
              <button
                key={chat.id}
                onClick={() => onSelect(chat.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', width: '100%', textAlign: 'left',
                  cursor: 'pointer', border: 'none',
                  background: isSelected
                    ? 'rgba(37,99,235,0.18)'
                    : hasUnread
                    ? 'rgba(37,99,235,0.08)'
                    : 'transparent',
                  borderLeft: isSelected
                    ? '2px solid rgba(96,165,250,0.7)'
                    : hasUnread
                    ? '2px solid rgba(96,165,250,0.3)'
                    : '2px solid transparent',
                  transition: 'background 0.15s',
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #1D4ED8, #1d4ed8)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: '#fff',
                }}>
                  {getInitials(chat.user)}
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    <span style={{
                      fontSize: 13, fontWeight: hasUnread ? 700 : 500,
                      color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {getUserLabel(chat.user)}
                    </span>
                    <span style={{ fontSize: 10, color: 'rgba(220,235,255,0.3)', flexShrink: 0 }}>
                      {formatTime(chat.last_message_at)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 2 }}>
                    <span style={{
                      fontSize: 12, color: 'rgba(220,235,255,0.4)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {chat.last_message_preview || 'Нет сообщений'}
                    </span>
                    {hasUnread && (
                      <span style={{
                        flexShrink: 0, minWidth: 18, height: 18, borderRadius: 9,
                        background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
                        color: '#fff', fontSize: 10, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 5px',
                      }}>
                        {chat.admin_unread_count > 99 ? '99+' : chat.admin_unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
