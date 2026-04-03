// src/pages/SupportPage.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, ChevronRight, Send, Plus, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { supportApi } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'

type View = 'list' | 'new'

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  open:         { label: 'Открыт',      color: '#22c55e', bg: 'rgba(34,197,94,0.1)',    border: 'rgba(34,197,94,0.2)' },
  in_progress:  { label: 'В работе',    color: '#818cf8', bg: 'rgba(99,102,241,0.1)',   border: 'rgba(99,102,241,0.2)' },
  waiting_user: { label: 'Ждём вас',    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.2)' },
  resolved:     { label: 'Решён',       color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.15)' },
  closed:       { label: 'Закрыт',      color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.15)' },
}

export default function SupportPage() {
  const { haptic } = useTelegram()
  const [view, setView] = useState<View>('list')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const { data: tickets = [], refetch } = useQuery({
    queryKey: ['tickets'],
    queryFn: supportApi.list,
  })

  const handleCreate = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error('Заполни тему и сообщение')
      return
    }
    setSending(true)
    haptic.impact('medium')
    try {
      await supportApi.createTicket({ subject: subject.trim(), message: message.trim() })
      haptic.success()
      toast.success('Обращение создано!')
      setSubject('')
      setMessage('')
      setView('list')
      refetch()
    } catch {
      haptic.error()
      toast.error('Ошибка отправки')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="px-4 pt-5 pb-6 animate-fade-in">
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          {view === 'new' && (
            <button
              onClick={() => setView('list')}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90"
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
            >
              <ArrowLeft size={17} style={{ color: 'var(--hint)' }} />
            </button>
          )}
          <h1 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
            {view === 'list' ? '🆘 Поддержка' : '📝 Новое обращение'}
          </h1>
        </div>
        {view === 'list' && (
          <button
            onClick={() => setView('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
              color: '#fff',
              boxShadow: '0 2px 10px rgba(99,102,241,0.35)',
            }}
          >
            <Plus size={15} />
            Новое
          </button>
        )}
      </div>

      {view === 'list' ? (
        /* Список тикетов */
        <div className="space-y-2">
          {tickets.length === 0 ? (
            <div className="flex flex-col items-center py-24 gap-5">
              <div
                className="w-24 h-24 rounded-3xl flex items-center justify-center"
                style={{
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                }}
              >
                <MessageCircle size={44} style={{ color: 'var(--hint)' }} />
              </div>
              <div className="text-center">
                <p className="font-semibold" style={{ color: 'var(--text)' }}>
                  Обращений пока нет
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--hint)' }}>
                  Создай обращение, если что-то не так
                </p>
              </div>
              <button
                onClick={() => setView('new')}
                className="btn-primary"
                style={{ maxWidth: 220 }}
              >
                Создать обращение
              </button>
            </div>
          ) : (
            tickets.map((ticket: any) => {
              const st = STATUS_STYLE[ticket.status] ?? STATUS_STYLE.closed
              return (
                <div
                  key={ticket.id}
                  className="flex items-center gap-3 p-4 rounded-2xl"
                  style={{
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                      {ticket.subject}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          color: st.color,
                          background: st.bg,
                          border: `1px solid ${st.border}`,
                        }}
                      >
                        {st.label}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--hint)' }}>
                        {new Date(ticket.created_at).toLocaleDateString('ru', {
                          day: 'numeric', month: 'short'
                        })}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={15} style={{ color: 'var(--hint)', flexShrink: 0 }} />
                </div>
              )
            })
          )}
        </div>
      ) : (
        /* Форма нового тикета */
        <div className="space-y-4 animate-slide-up">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--hint)' }}>
            Опиши проблему — мы ответим в ближайшее время
          </p>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--hint)' }}>
              Тема <span style={{ color: 'var(--destructive)' }}>*</span>
            </label>
            <input
              type="text"
              className="input"
              placeholder="Например: Не пришёл заказ #001234"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              maxLength={200}
            />
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--hint)' }}>
              Сообщение <span style={{ color: 'var(--destructive)' }}>*</span>
            </label>
            <textarea
              className="input resize-none"
              placeholder="Подробно опиши проблему..."
              rows={5}
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={2000}
            />
            <p className="text-xs mt-1.5 text-right" style={{ color: 'rgba(148,163,184,0.5)' }}>
              {message.length}/2000
            </p>
          </div>

          <button
            className="btn-primary"
            onClick={handleCreate}
            disabled={sending || !subject.trim() || !message.trim()}
          >
            {sending ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Отправляем...
              </>
            ) : (
              <>
                <Send size={16} />
                Отправить
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
