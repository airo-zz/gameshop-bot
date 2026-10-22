/**
 * src/web/pages/WebRequestPage.tsx
 * Заявка с сайта (как CustomOrderPage в Mini App): «Не нашли свою игру?» или
 * «Индивидуальный заказ». Описание + скриншоты уходят оператору в тот же чат
 * (chatApi), ответ приходит покупателю в Telegram-бот.
 *   /request?type=missing_game|custom_order&game=<название>
 */
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ImagePlus, X, Send, CheckCircle } from '@/components/ui/icons'
import { chatApi } from '@/api'
import { compressImage } from '@/utils/image'
import { MINIAPP_URL } from '@/config/appTarget'
import { usePageMeta } from '@/web/seo'

const MAX_FILES = 10

type Mode = 'custom_order' | 'missing_game'

const COPY: Record<Mode, { title: string; intro: string; placeholder: string; header: string }> = {
  custom_order: {
    title: 'Индивидуальный заказ',
    intro: 'Не нашли нужный товар или количество? Опишите, что хотите купить, и приложите скриншоты — оператор подберёт вариант и выставит цену.',
    placeholder: 'Что нужно купить? Товар, количество, ссылка — или приложите скриншоты',
    header: 'Заявка на индивидуальный заказ',
  },
  missing_game: {
    title: 'Не нашли свою игру?',
    intro: 'Напишите, какую игру или сервис нужно пополнить. Оператор ответит, согласует цену и соберёт заказ вручную.',
    placeholder: 'Название игры или сервиса и что нужно пополнить',
    header: 'Не нашёл игру в каталоге',
  },
}

export default function WebRequestPage() {
  const [params] = useSearchParams()
  const mode: Mode = params.get('type') === 'custom_order' ? 'custom_order' : 'missing_game'
  const gameName = params.get('game') || ''
  const copy = COPY[mode]
  usePageMeta({ title: copy.title })

  const [text, setText] = useState(mode === 'missing_game' && gameName ? `${gameName} — ` : '')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!picked.length) return
    if (files.length + picked.length > MAX_FILES) {
      toast.error(`Можно приложить не больше ${MAX_FILES} скриншотов`)
      return
    }
    setFiles((prev) => [...prev, ...picked])
  }

  const submit = async () => {
    if (sending) return
    const trimmed = text.trim()
    if (!trimmed && files.length === 0) {
      toast.error('Опишите заказ или приложите скриншоты')
      return
    }
    setSending(true)
    try {
      let urls: string[] = []
      if (files.length) {
        const compressed = await Promise.all(files.map((f) => compressImage(f)))
        urls = await Promise.all(compressed.map((f) => chatApi.upload(f).then((r) => r.url)))
      }
      const header = [copy.header, mode === 'custom_order' && gameName ? `(${gameName})` : '', '— с сайта'].filter(Boolean).join(' ')
      await chatApi.sendMessage(`${header}${trimmed ? `\n\n${trimmed}` : ''}`, urls)
      setSent(true)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Не удалось отправить заявку — попробуйте ещё раз')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="web-container py-16 md:py-24 text-center"><div className="max-w-xl mx-auto">
        <CheckCircle size={44} className="mx-auto text-[#34d399]" />
        <h1 className="mt-5 text-2xl md:text-3xl text-[var(--text)]" style={{ margin: '20px 0 0' }}>Заявка отправлена</h1>
        <p className="mt-3 text-[var(--text-2)] leading-relaxed">
          Оператор ответит в чате магазина — уведомление придёт в Telegram от нашего бота.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-2 justify-center">
          <a href={`${MINIAPP_URL}=chat`} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center justify-center h-11 px-5 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors">
            Открыть чат в Telegram
          </a>
          <Link to="/catalog" className="inline-flex items-center justify-center h-11 px-5 rounded-xl text-sm text-[var(--text-2)] bg-[var(--bg2)] hover:bg-[var(--bg3)] transition-colors">
            Вернуться в каталог
          </Link>
        </div>
      </div></div>
    )
  }

  return (
    <div className="web-container py-10 md:py-14">
      <div className="max-w-2xl">
      <h1 className="text-3xl md:text-4xl text-[var(--text)]" style={{ margin: 0 }}>{copy.title}</h1>
      <p className="mt-3 text-[var(--text-2)] leading-relaxed">{copy.intro}</p>
      {mode === 'custom_order' && gameName && (
        <p className="mt-2 text-sm text-[var(--hint)]">Игра: <span className="text-[var(--text-2)]">{gameName}</span></p>
      )}

      <label className="block mt-8 text-sm text-[var(--hint)] mb-2" htmlFor="req-text">Описание</label>
      <textarea
        id="req-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={copy.placeholder}
        rows={6}
        maxLength={3000}
        className="w-full rounded-2xl bg-[var(--bg2)] border border-transparent focus:border-[var(--accent)] outline-none p-4 text-[15px] leading-relaxed text-[var(--text)] placeholder:text-[var(--hint)] resize-y transition-colors"
      />

      <p className="mt-6 text-sm text-[var(--hint)] mb-2">Скриншоты <span className="text-[var(--hint)]">(до {MAX_FILES})</span></p>
      <div className="flex flex-wrap gap-2">
        {files.map((f, i) => (
          <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden bg-[var(--bg2)]">
            <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              aria-label="Убрать скриншот"
              onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {files.length < MAX_FILES && (
          <label className="w-20 h-20 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg2)] hover:bg-[var(--bg3)] flex items-center justify-center cursor-pointer text-[var(--hint)] transition-colors">
            <ImagePlus size={24} />
            <input type="file" accept="image/*" multiple onChange={onPick} className="hidden" />
          </label>
        )}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={sending}
        className="mt-8 w-full sm:w-auto inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors disabled:opacity-50"
      >
        <Send size={18} /> {sending ? 'Отправляем…' : 'Отправить заявку'}
      </button>
      <p className="mt-3 text-xs text-[var(--hint)]">Ответ придёт в Telegram от бота магазина.</p>
      </div>
    </div>
  )
}
