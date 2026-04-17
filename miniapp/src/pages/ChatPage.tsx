// src/pages/ChatPage.tsx
// Чат покупателя с продавцом — один постоянный чат, как на Funpay.
import {
  useState, useEffect, useRef, useCallback,
  type FormEvent,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { chatApi, type ChatMessage } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
}

function getDateKey(dateStr: string): string {
  return new Date(dateStr).toDateString()
}

// ── System message ────────────────────────────────────────────────────────────

function SystemMessage({ text }: { text: string }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '4px 0',
      marginBottom: 8,
    }}>
      <span style={{
        fontSize: 12,
        color: 'rgba(255,255,255,0.35)',
        fontStyle: 'italic',
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 20,
        background: 'rgba(255,255,255,0.04)',
      }}>
        {text}
      </span>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage & { optimistic?: boolean } }) {
  const isUser = msg.sender_type === 'user'
  const isAdmin = msg.sender_type === 'admin'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-1`}>
      <div
        style={{
          maxWidth: '80%',
          padding: '8px 12px',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          background: isUser ? 'rgba(29,78,216,0.85)' : 'rgba(255,255,255,0.07)',
          border: isUser
            ? '1px solid rgba(96,165,250,0.2)'
            : '1px solid rgba(255,255,255,0.06)',
          opacity: msg.optimistic ? 0.65 : 1,
          transition: 'opacity 0.2s',
        }}
      >
        {isAdmin && (
          <p style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', marginBottom: 3 }}>
            Продавец
          </p>
        )}
        {msg.text && (
          <p style={{
            fontSize: 14,
            color: '#fff',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.45,
            margin: 0,
          }}>
            {msg.text}
          </p>
        )}
        <p style={{
          fontSize: 10,
          color: isUser ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.25)',
          marginTop: 4,
          marginBottom: 0,
          textAlign: 'right',
        }}>
          {msg.optimistic ? '...' : formatTime(msg.created_at)}
        </p>
      </div>
    </div>
  )
}

// ── Date separator ────────────────────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', margin: '12px 0 8px' }}>
      <span style={{
        fontSize: 11,
        color: 'rgba(255,255,255,0.25)',
        padding: '3px 10px',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.05)',
      }}>
        {label}
      </span>
    </div>
  )
}

// ── Main ChatPage ─────────────────────────────────────────────────────────────

export default function ChatPage() {
  const queryClient = useQueryClient()
  const { haptic } = useTelegram()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Получаем/создаём чат
  const { data: chat, isLoading: chatLoading } = useQuery({
    queryKey: ['chat'],
    queryFn: () => chatApi.getOrCreate(),
    staleTime: Infinity,
  })

  // Сообщения с polling каждые 2 секунды
  const { data: messages = [] } = useQuery<(ChatMessage & { optimistic?: boolean })[]>({
    queryKey: ['chat-messages'],
    queryFn: () => chatApi.getMessages(),
    enabled: !!chat,
    refetchInterval: 2000,
    staleTime: 0,
  })

  // Автоскролл при новых сообщениях
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = useCallback(async (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || sending) return

    haptic.impact('light')
    setText('')
    setSending(true)

    const optimisticMsg: ChatMessage & { optimistic: true } = {
      id: `opt-${Date.now()}`,
      chat_id: chat?.id ?? '',
      sender_type: 'user',
      text: trimmed,
      created_at: new Date().toISOString(),
      optimistic: true,
    }
    queryClient.setQueryData<(ChatMessage & { optimistic?: boolean })[]>(
      ['chat-messages'],
      prev => [...(prev ?? []), optimisticMsg]
    )

    try {
      await chatApi.sendMessage(trimmed)
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] })
    } catch {
      haptic.error()
      toast.error('Ошибка отправки')
      setText(trimmed)
      queryClient.setQueryData<(ChatMessage & { optimistic?: boolean })[]>(
        ['chat-messages'],
        prev => prev?.filter(m => m.id !== optimisticMsg.id) ?? []
      )
    } finally {
      setSending(false)
    }
  }, [text, sending, chat, haptic, queryClient])

  // Группируем сообщения по датам
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

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg)',
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 16px',
        height: 56,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(6,15,30,0.97)',
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          flexShrink: 0,
          background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.3 }}>
            Поддержка
          </p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0, lineHeight: 1 }}>
            Онлайн
          </p>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px 14px',
        overscrollBehavior: 'contain',
      }}>
        {chatLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 16 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                height: 44,
                borderRadius: 18,
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                animation: 'pulse 1.5s ease infinite',
                width: i % 2 === 0 ? '60%' : '75%',
                alignSelf: i % 2 === 0 ? 'flex-end' : 'flex-start',
              }} />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingTop: 48,
                gap: 12,
                textAlign: 'center',
              }}
            >
              <div style={{
                width: 64,
                height: 64,
                borderRadius: 22,
                background: 'rgba(29,78,216,0.12)',
                border: '1px solid rgba(29,78,216,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6"
                  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                </svg>
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', margin: '0 0 6px' }}>
                  Чат с поддержкой
                </p>
                <p style={{ fontSize: 13, color: 'var(--hint)', margin: 0, lineHeight: 1.5 }}>
                  Напишите нам — ответим быстро
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        ) : (
          grouped.map(group => (
            <div key={group.dateKey}>
              <DateSeparator label={group.label} />
              {group.msgs.map(msg => {
                if (msg.sender_type === 'system') {
                  return <SystemMessage key={msg.id} text={msg.text ?? ''} />
                }
                return <MessageBubble key={msg.id} msg={msg} />
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div style={{
        flexShrink: 0,
        padding: '8px 12px',
        paddingBottom: 'max(env(safe-area-inset-bottom,16px),16px)',
        background: '#060f1e',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        <form
          onSubmit={handleSend}
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 20,
            padding: '6px 6px 6px 14px',
          }}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Написать сообщение..."
            rows={1}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: 14,
              color: '#fff',
              minHeight: 32,
              maxHeight: 120,
              lineHeight: 1.5,
              padding: '4px 0',
            }}
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: 12,
              border: 'none',
              background: text.trim()
                ? 'linear-gradient(135deg, #1d4ed8, #2563eb)'
                : 'rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: text.trim() ? 'pointer' : 'default',
              transition: 'background 0.2s',
            }}
          >
            {sending
              ? <div style={{
                  width: 16,
                  height: 16,
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite',
                }} />
              : <Send size={16} color="#fff" />
            }
          </button>
        </form>
      </div>
    </div>
  )
}
