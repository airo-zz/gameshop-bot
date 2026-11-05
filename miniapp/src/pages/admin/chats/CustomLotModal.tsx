/**
 * src/pages/admin/chats/CustomLotModal.tsx
 * Модалка «Индивидуальный лот»: оператор создаёт заказ на произвольную сумму прямо из чата.
 * Часть страницы «Чаты» админки (pages/admin/AdminChatsPage.tsx).
 */

import { useState, type CSSProperties } from 'react'
import { X } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { adminApi } from '@/api/admin'

export function CustomLotModal({ chatId, onClose, onCreated }: {
  chatId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const inputStyle: CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 12,
    background: 'rgba(220,235,255,0.05)', border: '1px solid rgba(220,235,255,0.12)',
    color: '#fff', fontSize: 14, outline: 'none',
  }

  const submit = async () => {
    const p = Number(price)
    if (!title.trim()) { toast.error('Введите название лота'); return }
    if (!p || p <= 0) { toast.error('Введите цену больше 0'); return }
    setSaving(true)
    try {
      await adminApi.createCustomLot(chatId, {
        title: title.trim(), price: p, description: description.trim() || undefined,
      })
      toast.success('Лот отправлен в чат')
      onCreated()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Не удалось создать лот')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 420, background: '#111827',
        border: '1px solid rgba(220,235,255,0.1)', borderRadius: 18, padding: 18,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0 }}>Индивидуальный лот</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(220,235,255,0.5)' }}>
            <X size={18} />
          </button>
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'rgba(220,235,255,0.5)', display: 'block', marginBottom: 4 }}>Название</label>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={256} placeholder="Напр.: Аккаунт Steam с играми" style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'rgba(220,235,255,0.5)', display: 'block', marginBottom: 4 }}>Цена, ₽ (без наценки метода)</label>
          <input value={price} onChange={e => setPrice(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="Напр.: 1500" style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'rgba(220,235,255,0.5)', display: 'block', marginBottom: 4 }}>Описание (необязательно)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={2000} placeholder="Что входит в лот" style={{ ...inputStyle, resize: 'none' }} />
        </div>
        <button onClick={submit} disabled={saving} style={{
          padding: '12px', borderRadius: 12, border: 'none',
          background: saving ? 'rgba(37,99,235,0.4)' : 'linear-gradient(135deg, #2563eb, #2563EB)',
          color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
        }}>
          {saving ? 'Создание…' : 'Создать и отправить в чат'}
        </button>
      </div>
    </div>
  )
}
