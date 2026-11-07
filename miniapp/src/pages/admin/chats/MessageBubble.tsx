/**
 * src/pages/admin/chats/MessageBubble.tsx
 * Пузыри сообщений: обычное сообщение (текст, картинка, файл) и системное «Заказ оплачен» со ссылкой на заказ.
 * Часть страницы «Чаты» админки (pages/admin/AdminChatsPage.tsx).
 */

import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Paperclip } from '@/components/ui/icons'
import { adminApi, type AdminChatMessage } from '@/api/admin'
import BuyerFields from '../BuyerFields'
import { formatTime, isImageUrl } from './helpers'

export const ADMIN_PAYMENT_RE = /^(Заказ\s+#\S+\s+на\s+сумму\s+[\d\s\u00a0]+₽\s+успешно\s+оплачен\..*?)(?:\|oid=([a-f0-9-]+))?$/s

const OPEN = ['paid', 'processing', 'clarification']
const STATUS_RU: Record<string, string> = {
  paid: 'Оплачен', processing: 'В работе', clarification: 'Уточнение', completed: 'Выполнен',
  cancelled: 'Отменён', refunded: 'Возврат',
}

/** «Выполнен» в один клик: покупателю придёт уведомление и карточка с оценкой в чат */
function CompleteButton({ orderId, status }: { orderId: string; status: string }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  if (!OPEN.includes(status)) {
    return <div className="text-[11px] text-[var(--hint)]">Статус: {STATUS_RU[status] ?? status}</div>
  }
  const done = async () => {
    setBusy(true)
    try {
      // из «Уточнения» в «Выполнен» напрямую нельзя — сначала «В работе»
      if (status === 'clarification') await adminApi.updateOrderStatus(orderId, 'processing')
      await adminApi.updateOrderStatus(orderId, 'completed')
      toast.success('Заказ выполнен — покупателю предложено оставить отзыв')
      qc.invalidateQueries({ queryKey: ['admin', 'order', orderId] })
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Не удалось сменить статус')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-[var(--hint)]">Статус: {STATUS_RU[status] ?? status}</span>
      <button type="button" onClick={done} disabled={busy}
              className="h-8 px-3 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: '#10b981' }}>
        {busy ? 'Сохраняем…' : '✓ Выполнен'}
      </button>
    </div>
  )
}

const ADMIN_REVIEW_RE = /^Отзыв к заказу (#\S+): ([★☆]{5})(?: — ([\s\S]*?))?\|review=([a-f0-9-]+)$/
const ADMIN_DONE_RE = /^(Заказ\s+#\S+\s+выполнен\.)\|done=([a-f0-9-]+)$/

/** Под сообщением об оплате: состав заказа и данные покупателя (с копированием) */
function PaidOrderDetails({ orderId }: { orderId: string }) {
  const { data: order } = useQuery({
    queryKey: ['admin', 'order', orderId],
    queryFn: () => adminApi.getOrder(orderId),
    staleTime: 60_000,
  })
  if (!order) return null
  return (
    <div style={{ width: '100%', textAlign: 'left' }} className="space-y-2">
      <CompleteButton orderId={order.id} status={order.status} />
      <div className="space-y-0.5">
        {order.items.map((i) => (
          <div key={i.id} className="text-xs text-[var(--text)]">
            • {i.product_name}{i.quantity > 1 ? ` × ${i.quantity}` : ''}
          </div>
        ))}
      </div>
      <div className="pt-2 border-t border-[rgba(16,185,129,0.25)]">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--hint)] mb-1">Данные покупателя</div>
        <BuyerFields fields={order.buyer_fields ?? []} compact />
      </div>
    </div>
  )
}

export function SystemMessageBubble({ text }: { text: string | null }) {
  if (!text) return null
  const review = ADMIN_REVIEW_RE.exec(text)
  if (review) {
    const [, num, stars, body, oid] = review
    const low = (stars.match(/★/g) ?? []).length <= 3
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0', marginBottom: 8 }}>
        <div style={{ maxWidth: '85%', padding: '10px 14px', borderRadius: 14,
                      background: low ? 'rgba(239,68,68,0.08)' : 'rgba(251,191,36,0.08)',
                      border: `1px solid ${low ? 'rgba(239,68,68,0.25)' : 'rgba(251,191,36,0.25)'}` }}>
          <div style={{ fontSize: 11, color: 'rgba(220,235,255,0.5)', fontWeight: 700 }}>
            Отзыв покупателя · <Link to={`/admin/orders/${oid}`} style={{ color: 'inherit' }}>заказ {num}</Link>
          </div>
          <div style={{ fontSize: 18, color: '#fbbf24', marginTop: 2 }}>{stars}</div>
          {body && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(220,235,255,0.8)', whiteSpace: 'pre-wrap' }}>{body}</p>}
        </div>
      </div>
    )
  }
  const done = ADMIN_DONE_RE.exec(text)
  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '4px 0', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#34d399', display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: 'rgba(16,185,129,0.1)' }}>
          {done[1]} Покупателю предложено оставить отзыв ·{' '}
          <Link to={`/admin/orders/${done[2]}`} style={{ color: 'inherit' }}>заказ</Link>
        </span>
      </div>
    )
  }
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
          {orderId && <PaidOrderDetails orderId={orderId} />}
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
