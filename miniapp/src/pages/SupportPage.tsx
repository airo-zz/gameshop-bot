// src/pages/SupportPage.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, Send, Plus, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { supportApi } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'

type View = 'list' | 'new'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  open:         { label: '🟢 Открыт',     color: '#34d399' },
  in_progress:  { label: '⚙️ В работе',   color: '#a78bfa' },
  waiting_user: { label: '⏳ Ожидаем вас', color: '#fbbf24' },
  resolved:     { label: '✅ Решён',       color: '#34d399' },
  closed:       { label: '⚫ Закрыт',      color: 'var(--hint)' },
}

export default function SupportPage() {
  const { haptic } = useTelegram()
  const [view, setView]       = useState<View>('list')
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
        {view === 'new' ? (
          <button
            onClick={() => setView('list')}
            className="flex items-center gap-1.5 text-sm font-medium"
            style={{ color: '#a78bfa' }}
          >
            <ArrowLeft size={16} />
            Назад
          </button>
        ) : (
          <h1 className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>🆘 Поддержка</h1>
        )}

        {view === 'list' && (
          <button
            onClick={() => setView('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              color: '#fff',
            }}
          >
            <Plus size={14} />
            Новое
          </button>
        )}
      </div>

      {view === 'list' ? (
        <div className="space-y-2">
          {tickets.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-5">
              <div
                className="w-24 h-24 rounded-3xl flex items-center justify-center"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
              >
                <MessageCircle size={40} style={{ color: 'var(--hint)' }} />
              </div>
              <div className="text-center">
                <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Обращений пока нет</p>
                <p className="text-sm" style={{ color: 'var(--hint)' }}>Опиши проблему — мы поможем</p>
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
              const status = STATUS_LABEL[ticket.status] ?? { label: ticket.status, color: 'var(--hint)' }
              return (
                <div
                  key={ticket.id}
                  className="flex items-center gap-3 p-4 rounded-2xl"
                  style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                      {ticket.subject}
                    </p>
                    <p className="text-xs mt-1 font-medium" style={{ color: status.color }}>
                      {status.label}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>
                      {new Date(ticket.created_at).toLocaleDateString('ru', {
                        day: 'numeric', month: 'short'
                      })}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      ) : (
        /* Форма */
        <div className="space-y-4 animate-slide-up">
          <p className="text-sm" style={{ color: 'var(--hint)' }}>
            Опиши проблему — мы ответим в ближайшее время
          </p>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--hint)' }}>
              Тема *
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
              Сообщение *
            </label>
            <textarea
              className="input resize-none"
              placeholder="Подробно опиши проблему..."
              rows={5}
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={2000}
            />
            <p className="text-xs mt-1 text-right" style={{ color: 'var(--hint)' }}>
              {message.length}/2000
            </p>
          </div>

          <button
            className="btn-primary gap-2"
            onClick={handleCreate}
            disabled={sending || !subject.trim() || !message.trim()}
          >
            {sending ? '⏳ Отправляем...' : <><Send size={16} /> Отправить</>}
          </button>
        </div>
      )}
    </div>
  )
}
