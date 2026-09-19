// src/pages/CustomOrderPage.tsx
// Заявка на индивидуальный (спец) заказ либо на игру, которой нет в каталоге.
// Покупатель описывает, что хочет, и прикладывает скриншоты — заявка уходит в
// чат, оператор собирает индивидуальный лот (кнопка «Оплатить» приходит в чат/бот).
import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { ImagePlus, X, Send, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import { chatApi } from '@/api'
import { compressImage } from '@/utils/image'
import { useTelegram } from '@/hooks/useTelegram'

const MAX_FILES = 5

type Mode = 'custom_order' | 'missing_game'

const COPY: Record<Mode, { title: string; intro: string; placeholder: string; header: string }> = {
  custom_order: {
    title: 'Индивидуальный заказ',
    intro:
      'Не нашли нужный товар или количество? Опишите, что хотите купить, и приложите ' +
      'скриншоты — искать цену самому не нужно. Оператор подберёт вариант и соберёт ' +
      'для вас индивидуальный лот с ценой, который можно оплатить прямо в чате.',
    placeholder: 'Что нужно купить? Опишите товар, количество, ссылку или приложите скриншоты…',
    header: 'Заявка на индивидуальный заказ',
  },
  missing_game: {
    title: 'Не нашли свою игру?',
    intro:
      'Если нужной игры или сервиса нет в каталоге — напишите нам. Опишите, что ищете, ' +
      'и приложите скриншоты. Оператор подскажет, сможем ли помочь, и соберёт ' +
      'индивидуальный лот с ценой.',
    placeholder: 'Какая игра или сервис вам нужны? Опишите и приложите скриншоты…',
    header: 'Не нашёл игру в каталоге',
  },
}

export default function CustomOrderPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { haptic } = useTelegram()

  const rawMode = params.get('type')
  const mode: Mode = rawMode === 'missing_game' ? 'missing_game' : 'custom_order'
  const gameName = params.get('game') || ''
  const copy = COPY[mode]

  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!picked.length) return
    if (files.length + picked.length > MAX_FILES) {
      toast.error(`Максимум ${MAX_FILES} скриншотов`)
      return
    }
    setFiles(prev => [...prev, ...picked])
  }

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx))

  const submit = async () => {
    if (sending) return
    const trimmed = text.trim()
    if (!trimmed && files.length === 0) {
      haptic.error()
      toast.error('Опишите заказ или приложите скриншоты')
      return
    }
    setSending(true)
    haptic.impact('medium')
    try {
      let urls: string[] = []
      if (files.length > 0) {
        const compressed = await Promise.all(files.map(f => compressImage(f)))
        urls = await Promise.all(compressed.map(f => chatApi.upload(f).then(r => r.url)))
      }
      const headerParts = [copy.header]
      if (gameName) headerParts.push(`(${gameName})`)
      const body = `${headerParts.join(' ')}${trimmed ? `\n\n${trimmed}` : ''}`
      await chatApi.sendMessage(body, urls)
      haptic.success()
      toast.success('Заявка отправлена — оператор скоро ответит')
      navigate('/chat', { replace: true })
    } catch (e: any) {
      haptic.error()
      toast.error(e?.response?.data?.detail ?? 'Не удалось отправить заявку')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ padding: '16px', maxWidth: 520, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
        {copy.title}
      </h1>

      {/* Пояснение — «что это за кнопка» */}
      <div style={{
        display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 14, marginBottom: 16,
        background: 'rgba(45,88,173,0.10)', border: '1px solid rgba(45,88,173,0.28)',
      }}>
        <Info size={18} style={{ color: '#6b9de8', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, opacity: 0.9 }}>
          {copy.intro}
        </p>
      </div>

      {/* Описание */}
      <label style={{ fontSize: 13, color: 'var(--hint)', display: 'block', marginBottom: 6 }}>
        Описание
      </label>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={copy.placeholder}
        rows={4}
        style={{
          width: '100%', borderRadius: 14, padding: '12px 14px', resize: 'vertical',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
          color: 'var(--text)', fontSize: 14, lineHeight: 1.45, marginBottom: 16,
        }}
      />

      {/* Скриншоты */}
      <label style={{ fontSize: 13, color: 'var(--hint)', display: 'block', marginBottom: 8 }}>
        Скриншоты <span style={{ opacity: 0.6 }}>(до {MAX_FILES})</span>
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {files.map((f, i) => (
          <div key={i} style={{ position: 'relative', width: 72, height: 72 }}>
            <img
              src={URL.createObjectURL(f)}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)' }}
            />
            <button
              type="button"
              onClick={() => removeFile(i)}
              style={{
                position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%',
                background: '#ef4444', border: 'none', color: '#fff', display: 'flex',
                alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <X size={13} />
            </button>
          </div>
        ))}
        {files.length < MAX_FILES && (
          <label style={{
            width: 72, height: 72, borderRadius: 12, cursor: 'pointer',
            border: '1px dashed rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.03)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ImagePlus size={22} style={{ color: 'var(--hint)' }} />
            <input type="file" accept="image/*" multiple hidden onChange={onPick} />
          </label>
        )}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={sending}
        style={{
          width: '100%', padding: '14px', borderRadius: 14, border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: sending ? 'rgba(45,88,173,0.4)' : 'linear-gradient(135deg, #2563eb, #2d58ad)',
          color: '#fff', fontSize: 15, fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer',
        }}
      >
        <Send size={17} />
        {sending ? 'Отправка…' : 'Отправить заявку'}
      </button>
    </div>
  )
}
