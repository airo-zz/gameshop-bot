/**
 * src/pages/admin/chats/MessageBubble.tsx
 * Пузыри сообщений: обычное сообщение (текст, картинка, файл) и системное «Заказ оплачен» со ссылкой на заказ.
 * Часть страницы «Чаты» админки (pages/admin/AdminChatsPage.tsx).
 */

import { Link } from 'react-router-dom'
import { Paperclip } from '@/components/ui/icons'
import { type AdminChatMessage } from '@/api/admin'
import { formatTime, isImageUrl } from './helpers'

export const ADMIN_PAYMENT_RE = /^(Заказ\s+#\S+\s+на\s+сумму\s+[\d\s\u00a0]+₽\s+успешно\s+оплачен\..*?)(?:\|oid=([a-f0-9-]+))?$/s

export function SystemMessageBubble({ text }: { text: string | null }) {
  if (!text) return null
  const match = ADMIN_PAYMENT_RE.exec(text)

  if (match) {
    const displayText = match[1].trim()
    const orderId = match[2] ?? null
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0', marginBottom: 8 }}>
        <div style={{
          display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          padding: '10px 16px', borderRadius: 14,
          background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
          maxWidth: '85%',
        }}>
          <span style={{ fontSize: 11, color: '#34d399', fontWeight: 700 }}>Оплата подтверждена</span>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(220,235,255,0.7)', textAlign: 'center', lineHeight: 1.5 }}>
            {displayText}
          </p>
          {orderId && (
            <Link
              to={`/admin/orders/${orderId}`}
              style={{
                fontSize: 11, color: 'rgba(220,235,255,0.45)',
                textDecoration: 'none', padding: '3px 10px',
                borderRadius: 20, border: '1px solid rgba(220,235,255,0.12)',
                background: 'rgba(220,235,255,0.05)',
              }}
            >
              Открыть заказ
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ textAlign: 'center', padding: '4px 0', marginBottom: 8 }}>
      <span style={{
        fontSize: 12, color: 'rgba(220,235,255,0.35)', fontStyle: 'italic',
        display: 'inline-block', padding: '4px 12px', borderRadius: 20,
        background: 'rgba(220,235,255,0.04)',
      }}>
        {text}
      </span>
    </div>
  )
}

export function MessageBubble({
  msg,
  onImageClick,
}: {
  msg: AdminChatMessage & { optimistic?: boolean }
  onImageClick: (url: string) => void
}) {
  const isAdmin = msg.sender_type === 'admin'
  const isSystem = msg.sender_type === 'system'

  if (isSystem) {
    return <SystemMessageBubble text={msg.text} />
  }

  return (
    <div style={{ display: 'flex', justifyContent: isAdmin ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
      <div style={{
        maxWidth: '75%',
        padding: '8px 12px',
        borderRadius: isAdmin ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isAdmin ? 'rgba(29,78,216,0.85)' : 'rgba(220,235,255,0.08)',
        border: isAdmin ? '1px solid rgba(96,165,250,0.2)' : '1px solid rgba(220,235,255,0.08)',
        opacity: msg.optimistic ? 0.65 : 1,
        transition: 'opacity 0.2s',
      }}>
        {!isAdmin && (
          <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(220,235,255,0.4)', margin: '0 0 3px' }}>
            Покупатель
          </p>
        )}
        {msg.text && (
          <p style={{ fontSize: 14, color: '#fff', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45, margin: 0 }}>
            {msg.text}
          </p>
        )}
        {msg.attachments && msg.attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: msg.text ? 6 : 0 }}>
            {msg.attachments.map((url, idx) => {
              const absUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`
              const openFile = () => {
                const tg = (window as any).Telegram?.WebApp
                if (tg?.openLink) tg.openLink(absUrl)
                else window.open(absUrl, '_blank')
              }
              return isImageUrl(url) ? (
                <button
                  key={idx}
                  type="button"
                  onTouchStart={e => e.stopPropagation()}
                  onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); onImageClick(absUrl) }}
                  onClick={e => { e.stopPropagation(); onImageClick(absUrl) }}
                  style={{
                    width: 80, height: 80, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
                    border: '1px solid rgba(220,235,255,0.1)', padding: 0, cursor: 'pointer',
                    background: 'transparent', touchAction: 'none', WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <img src={absUrl} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none', userSelect: 'none', WebkitUserSelect: 'none' }} />
                </button>
              ) : (
                <button
                  key={idx}
                  type="button"
                  onTouchStart={e => e.stopPropagation()}
                  onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); openFile() }}
                  onClick={openFile}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
                    borderRadius: 8, background: 'rgba(220,235,255,0.08)',
                    border: '1px solid rgba(220,235,255,0.12)',
                    color: 'rgba(220,235,255,0.6)', fontSize: 11, cursor: 'pointer',
                    touchAction: 'none', WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <Paperclip size={11} /> Файл {idx + 1}
                </button>
              )
            })}
          </div>
        )}
        <p style={{
          fontSize: 10,
          color: isAdmin ? 'rgba(220,235,255,0.4)' : 'rgba(220,235,255,0.25)',
          marginTop: 4, marginBottom: 0, textAlign: 'right',
        }}>
          {msg.optimistic ? '...' : formatTime(msg.created_at)}
        </p>
      </div>
    </div>
  )
}
