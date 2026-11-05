/**
 * src/pages/admin/chats/NotifyModal.tsx
 * Модалка «Уведомить покупателя»: текст или шаблон → сообщение клиенту в Telegram / на почту.
 * Часть страницы «Чаты» админки (pages/admin/AdminChatsPage.tsx).
 */

import { useState } from 'react'
import { X, Plus } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { loadTemplates, saveTemplates } from './helpers'

export function NotifyModal({
  onSend,
  onClose,
}: {
  onSend: (text: string) => Promise<void>
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [templates, setTemplates] = useState<string[]>(loadTemplates)
  const [newTpl, setNewTpl] = useState('')
  const [addingTpl, setAddingTpl] = useState(false)

  const handleSend = async () => {
    if (sending) return
    setSending(true)
    try {
      await onSend(text.trim())
      onClose()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Не удалось отправить уведомление')
    } finally {
      setSending(false)
    }
  }

  const addTemplate = () => {
    const t = newTpl.trim()
    if (!t || templates.includes(t)) return
    const next = [...templates, t]
    setTemplates(next)
    saveTemplates(next)
    setNewTpl('')
    setAddingTpl(false)
    setText(t)
  }

  const removeTemplate = (t: string) => {
    const next = templates.filter(x => x !== t)
    setTemplates(next)
    saveTemplates(next)
    if (text === t) setText('')
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: '#0d1626',
          border: '1px solid rgba(220,235,255,0.1)',
          borderBottom: 'none',
          borderRadius: '18px 18px 0 0',
          padding: '20px 16px 24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Уведомить пользователя</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(220,235,255,0.4)', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Templates */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {templates.map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <button
                onClick={() => setText(prev => prev === t ? '' : t)}
                style={{
                  padding: '5px 8px 5px 10px', borderRadius: text === t ? '20px 0 0 20px' : 20,
                  fontSize: 12, cursor: 'pointer',
                  background: text === t ? 'rgba(37,99,235,0.3)' : 'rgba(220,235,255,0.07)',
                  border: text === t ? '1px solid rgba(96,165,250,0.5)' : '1px solid rgba(220,235,255,0.1)',
                  borderRight: text === t ? 'none' : undefined,
                  color: text === t ? 'var(--link)' : 'rgba(220,235,255,0.6)',
                  transition: 'all 0.15s',
                }}
              >
                {t}
              </button>
              <button
                onClick={() => removeTemplate(t)}
                title="Удалить заготовку"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 26,
                  padding: 0,
                  borderRadius: text === t ? '0 20px 20px 0' : '0 20px 20px 0',
                  fontSize: 11, cursor: 'pointer',
                  background: text === t ? 'rgba(37,99,235,0.3)' : 'rgba(220,235,255,0.07)',
                  border: text === t ? '1px solid rgba(96,165,250,0.5)' : '1px solid rgba(220,235,255,0.1)',
                  borderLeft: 'none',
                  color: 'rgba(220,235,255,0.35)',
                  transition: 'all 0.15s',
                }}
              >
                <X size={10} />
              </button>
            </div>
          ))}

          {/* Add template button */}
          {addingTpl ? (
            <div style={{ display: 'flex', gap: 4, width: '100%', marginTop: 2 }}>
              <input
                autoFocus
                value={newTpl}
                onChange={e => setNewTpl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTemplate(); if (e.key === 'Escape') setAddingTpl(false) }}
                placeholder="Текст заготовки..."
                style={{
                  flex: 1, background: 'rgba(220,235,255,0.05)',
                  border: '1px solid rgba(96,165,250,0.3)', borderRadius: 8,
                  padding: '4px 8px', fontSize: 12, color: '#fff', outline: 'none',
                }}
              />
              <button
                onClick={addTemplate}
                style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(37,99,235,0.4)', border: '1px solid rgba(96,165,250,0.4)', color: 'var(--link)', fontSize: 12, cursor: 'pointer' }}
              >
                Добавить
              </button>
              <button
                onClick={() => setAddingTpl(false)}
                style={{ padding: '4px 8px', borderRadius: 8, background: 'rgba(220,235,255,0.05)', border: '1px solid rgba(220,235,255,0.1)', color: 'rgba(220,235,255,0.4)', fontSize: 12, cursor: 'pointer' }}
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingTpl(true)}
              style={{
                padding: '5px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                background: 'transparent',
                border: '1px dashed rgba(220,235,255,0.2)',
                color: 'rgba(220,235,255,0.35)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <Plus size={11} /> Добавить
            </button>
          )}
        </div>

        {/* Text input */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Или введите своё сообщение..."
          rows={3}
          style={{
            width: '100%', background: 'rgba(220,235,255,0.05)',
            border: '1px solid rgba(220,235,255,0.1)', borderRadius: 12,
            padding: '10px 12px', fontSize: 14, color: '#fff', outline: 'none',
            resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
          }}
        />

        <button
          onClick={handleSend}
          disabled={sending || !text.trim()}
          style={{
            marginTop: 12, width: '100%', padding: '12px',
            borderRadius: 12, border: 'none', cursor: (sending || !text.trim()) ? 'default' : 'pointer',
            background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
            color: '#fff', fontSize: 14, fontWeight: 600,
            opacity: (sending || !text.trim()) ? 0.5 : 1, transition: 'opacity 0.2s',
          }}
        >
          {sending ? 'Отправка...' : 'Отправить уведомление'}
        </button>
      </div>
    </div>
  )
}
