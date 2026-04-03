// src/pages/SupportPage.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, ChevronRight, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { supportApi } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'
import clsx from 'clsx'

type View = 'list' | 'new'

const STATUS_LABEL: Record<string, string> = {
  open:         '🟢 Открыт',
  in_progress:  '⚙️ В работе',
  waiting_user: '⏳ Ожидаем вас',
  resolved:     '✅ Решён',
  closed:       '⚫ Закрыт',
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
    <div className="px-4 pt-4 pb-6 animate-fade-in">
      {/* Заголовок + переключатель */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>🆘 Поддержка</h1>
        <button
          onClick={() => setView(view === 'list' ? 'new' : 'list')}
          className="px-3 py-1.5 rounded-full text-sm font-medium"
          style={{ background: 'var(--btn)', color: 'var(--btn-text)' }}
        >
          {view === 'list' ? '+ Новое' : '← Назад'}
        </button>
      </div>

      {view === 'list' ? (
        /* Список тикетов */
        <div className="space-y-3">
          {tickets.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-4">
              <MessageCircle size={56} style={{ color: 'var(--bg2)' }} />
              <p style={{ color: 'var(--hint)' }}>Обращений пока нет</p>
              <button
                onClick={() => setView('new')}
                className="btn-primary"
                style={{ maxWidth: 200 }}
              >
                Создать обращение
              </button>
            </div>
          ) : (
            tickets.map((ticket: any) => (
              <div
                key={ticket.id}
                className="flex items-center gap-3 p-4 rounded-2xl"
                style={{ background: 'var(--bg2)' }}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                    {ticket.subject}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--hint)' }}>
                    {STATUS_LABEL[ticket.status] ?? ticket.status}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>
                    {new Date(ticket.created_at).toLocaleDateString('ru', {
                      day: 'numeric', month: 'short'
                    })}
                  </p>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--hint)' }} />
              </div>
            ))
          )}
        </div>
      ) : (
        /* Форма нового тикета */
        <div className="space-y-4 animate-slide-up">
          <p className="text-sm" style={{ color: 'var(--hint)' }}>
            Опиши проблему — мы ответим в ближайшее время
          </p>

          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--hint)' }}>Тема *</label>
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
            <label className="text-xs mb-1 block" style={{ color: 'var(--hint)' }}>Сообщение *</label>
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
            className="btn-primary flex items-center justify-center gap-2"
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
