/**
 * src/pages/admin/chats/ChatDetailPanel.tsx
 * Правая панель: переписка с покупателем, отправка сообщений и файлов, уведомления, индивидуальный лот.
 * Часть страницы «Чаты» админки (pages/admin/AdminChatsPage.tsx).
 */

import { useState, useEffect, useRef, useCallback, type FormEvent, type ChangeEvent } from 'react'
import { Send, Bell, Paperclip, X, ChevronLeft, Package } from '@/components/ui/icons'
import { adminApi, userIdLabel, type AdminChatDetail, type AdminChatMessage } from '@/api/admin'
import { CustomLotModal } from './CustomLotModal'
import { MessageBubble } from './MessageBubble'
import { NotifyModal } from './NotifyModal'
import { formatDateLabel, getDateKey, getInitials, getUserLabel } from './helpers'

export function ChatDetailPanel({
  chatId,
  onBack,
}: {
  chatId: string
  onBack: () => void
}) {
  const [chat, setChat] = useState<AdminChatDetail | null>(null)
  const [messages, setMessages] = useState<(AdminChatMessage & { optimistic?: boolean })[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [notifyModalOpen, setNotifyModalOpen] = useState(false)
  const [lotModalOpen, setLotModalOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview: string }[]>([])
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDetail = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await adminApi.getChatDetail(chatId)
      setChat(data)
      setMessages(data.messages)
    } catch {
      // ignore polling errors
    } finally {
      if (!silent) setLoading(false)
    }
  }, [chatId])

  // Initial load + polling + mark-read — all in one effect to avoid races
  useEffect(() => {
    setLoading(true)
    setMessages([])
    setChat(null)

    fetchDetail()
    adminApi.markChatRead(chatId).catch(() => {})

    const interval = setInterval(() => {
      fetchDetail(true)
      adminApi.markChatRead(chatId).catch(() => {})
    }, 3000)

    return () => clearInterval(interval)
  }, [chatId, fetchDetail])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const newPending = files.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
    }))
    setPendingFiles(prev => [...prev, ...newPending])
    e.target.value = ''
  }, [])

  const removePending = useCallback((idx: number) => {
    setPendingFiles(prev => {
      const updated = [...prev]
      if (updated[idx].preview) URL.revokeObjectURL(updated[idx].preview)
      updated.splice(idx, 1)
      return updated
    })
  }, [])

  const handleSend = useCallback(async (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = text.trim()
    if ((!trimmed && pendingFiles.length === 0) || sending || uploading) return

    setSending(true)
    setText('')

    // Upload pending files
    let uploadedUrls: string[] = []
    if (pendingFiles.length > 0) {
      setUploading(true)
      try {
        uploadedUrls = await Promise.all(
          pendingFiles.map(({ file }) => adminApi.uploadChatFile(chatId, file).then(r => r.url))
        )
        pendingFiles.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview) })
        setPendingFiles([])
      } catch {
        setSending(false)
        setUploading(false)
        return
      } finally {
        setUploading(false)
      }
    }

    // Optimistic message
    const optimistic: AdminChatMessage & { optimistic: true } = {
      id: `opt-${Date.now()}`,
      chat_id: chatId,
      sender_type: 'admin',
      text: trimmed || null,
      attachments: uploadedUrls,
      created_at: new Date().toISOString(),
      optimistic: true,
    }
    setMessages(prev => [...prev, optimistic])

    try {
      const msg = await adminApi.sendChatMessage(chatId, trimmed || null, uploadedUrls)
      setMessages(prev => [...prev.filter(m => m.id !== optimistic.id), msg])
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setText(trimmed)
    } finally {
      setSending(false)
    }
  }, [text, pendingFiles, chatId, sending, uploading])

  const handleNotifySend = async (notifyText: string) => {
    await adminApi.notifyUserChat(chatId, notifyText || undefined)
  }

  // Group messages by date
  const grouped: { dateKey: string; label: string; msgs: typeof messages }[] = []
  for (const msg of messages) {
    const key = getDateKey(msg.created_at)
    const last = grouped[grouped.length - 1]
    if (!last || last.dateKey !== key) {
      grouped.push({ dateKey: key, label: formatDateLabel(msg.created_at), msgs: [msg] })
    } else {
      last.msgs.push(msg)
    }
  }

  const userLabel = chat ? getUserLabel(chat.user) : '...'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>

      {/* Header */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderBottom: '1px solid rgba(220,235,255,0.06)',
        background: 'rgba(17,24,39,0.98)',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent', border: 'none', color: 'rgba(220,235,255,0.5)',
            cursor: 'pointer', padding: 4, display: 'flex', borderRadius: 8,
          }}
        >
          <ChevronLeft size={20} />
        </button>

        {chat && (
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #1D4ED8, #1d4ed8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff',
          }}>
            {getInitials(chat.user)}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {userLabel}
          </p>
          {chat && (
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(220,235,255,0.35)' }}>
              {userIdLabel(chat.user)}
              {chat.user.username && ` · @${chat.user.username}`}
            </p>
          )}
        </div>

        <button
          onClick={() => setNotifyModalOpen(true)}
          title="Уведомить в Telegram"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 8,
            background: 'rgba(220,235,255,0.07)',
            border: '1px solid rgba(220,235,255,0.1)',
            color: 'rgba(220,235,255,0.6)',
            cursor: 'pointer', fontSize: 11, fontWeight: 500, flexShrink: 0,
          }}
        >
          <Bell size={13} />
          Уведомить
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', overscrollBehavior: 'contain' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <div style={{ width: 24, height: 24, border: '2px solid rgba(220,235,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 48, gap: 8, color: 'rgba(220,235,255,0.3)' }}>
            <p style={{ margin: 0, fontSize: 14 }}>Нет сообщений</p>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.dateKey}>
              <div style={{ textAlign: 'center', margin: '12px 0 8px' }}>
                <span style={{ fontSize: 11, color: 'rgba(220,235,255,0.25)', padding: '3px 10px', borderRadius: 10, background: 'rgba(220,235,255,0.05)' }}>
                  {group.label}
                </span>
              </div>
              {group.msgs.map(msg => (
                <MessageBubble key={msg.id} msg={msg} onImageClick={setLightboxUrl} />
              ))}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending file previews */}
      {pendingFiles.length > 0 && (
        <div style={{
          flexShrink: 0, display: 'flex', gap: 8, padding: '8px 12px',
          borderTop: '1px solid rgba(220,235,255,0.06)',
          background: 'rgba(17,24,39,0.98)',
          overflowX: 'auto',
        }}>
          {pendingFiles.map((pf, idx) => (
            <div key={idx} style={{ position: 'relative', flexShrink: 0 }}>
              {pf.preview ? (
                <img
                  src={pf.preview}
                  alt=""
                  style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(220,235,255,0.12)' }}
                />
              ) : (
                <div style={{
                  width: 60, height: 60, borderRadius: 8, background: 'rgba(220,235,255,0.08)',
                  border: '1px solid rgba(220,235,255,0.12)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: 'rgba(220,235,255,0.5)', textAlign: 'center', padding: 4,
                }}>
                  {pf.file.name.split('.').pop()?.toUpperCase()}
                </div>
              )}
              <button
                onClick={() => removePending(idx)}
                style={{
                  position: 'absolute', top: -4, right: -4,
                  width: 16, height: 16, borderRadius: '50%',
                  background: 'var(--accent)', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={10} color="#fff" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div style={{
        flexShrink: 0, padding: '10px 12px',
        borderTop: '1px solid rgba(220,235,255,0.06)',
        background: 'rgba(17,24,39,0.98)',
      }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <form
          onSubmit={handleSend}
          style={{
            display: 'flex', alignItems: 'flex-end', gap: 6,
            background: 'rgba(220,235,255,0.06)',
            border: '1px solid rgba(220,235,255,0.1)',
            borderRadius: 16, padding: '6px 6px 6px 12px',
          }}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              flexShrink: 0, width: 32, height: 32, borderRadius: 8, border: 'none',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(220,235,255,0.4)',
            }}
          >
            <Paperclip size={17} />
          </button>

          <button
            type="button"
            title="Индивидуальный лот"
            onClick={() => setLotModalOpen(true)}
            style={{
              flexShrink: 0, width: 32, height: 32, borderRadius: 8, border: 'none',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(147,184,240,0.7)',
            }}
          >
            <Package size={17} />
          </button>

          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder="Написать сообщение..."
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              resize: 'none', fontSize: 14, color: '#fff',
              minHeight: 32, maxHeight: 120, lineHeight: 1.5, padding: '4px 0',
            }}
          />

          <button
            type="submit"
            disabled={(!text.trim() && pendingFiles.length === 0) || sending || uploading}
            style={{
              flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: 'none',
              background: (text.trim() || pendingFiles.length > 0)
                ? 'linear-gradient(135deg, #1d4ed8, #2563eb)'
                : 'rgba(220,235,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: (text.trim() || pendingFiles.length > 0) ? 'pointer' : 'default',
              transition: 'background 0.2s',
            }}
          >
            {(sending || uploading)
              ? <div style={{ width: 16, height: 16, border: '2px solid rgba(220,235,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              : <Send size={16} color="#fff" />
            }
          </button>
        </form>
      </div>

      {/* Notify modal */}
      {notifyModalOpen && (
        <NotifyModal
          onSend={handleNotifySend}
          onClose={() => setNotifyModalOpen(false)}
        />
      )}

      {/* Custom lot modal */}
      {lotModalOpen && (
        <CustomLotModal
          chatId={chatId}
          onClose={() => setLotModalOpen(false)}
          onCreated={() => { setLotModalOpen(false); fetchDetail(true) }}
        />
      )}

      {/* Image lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <img
            src={lightboxUrl}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '94vw', maxHeight: '88vh', borderRadius: 12, objectFit: 'contain' }}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            style={{
              position: 'absolute', top: 16, right: 16,
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(220,235,255,0.12)', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={18} color="#fff" />
          </button>
        </div>
      )}
    </div>
  )
}
