/**
 * src/pages/admin/ContentPage.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Управление контентом бота: тексты экранов и картинки.
 * Позволяет менять тексты и фото без правки кода. Картинки игр и сервисов
 * сюда не входят — они задаются в товарах.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Image as ImageIcon, RotateCcw, Save, Trash2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi, type BotContent, type ContentPhoto, type ContentText } from '@/api/admin'
import { normalizeImageUrl } from '@/utils/imageUrl'

const textareaCls =
  'w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-all duration-200 font-mono leading-relaxed resize-y'

function groupBy<T extends { group: string }>(items: T[]): [string, T[]][] {
  const map = new Map<string, T[]>()
  for (const it of items) {
    const arr = map.get(it.group) ?? []
    arr.push(it)
    map.set(it.group, arr)
  }
  return Array.from(map.entries())
}

// ── Текстовая карточка ──────────────────────────────────────────────────────

function TextCard({ item, onSaved }: { item: ContentText; onSaved: (t: ContentText) => void }) {
  const [draft, setDraft] = useState(item.value)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setDraft(item.value) }, [item.value])

  const dirty = draft !== item.value
  const isDefault = draft === item.default

  const save = async () => {
    setSaving(true)
    try {
      // Если текст совпадает с дефолтом — сбрасываем оверрайд (null)
      const payload = draft.trim() === '' || isDefault ? null : draft
      const res = await adminApi.updateContentText(item.key, payload)
      onSaved({ ...item, value: res.value, is_overridden: res.is_overridden })
      toast.success('Текст сохранён')
    } catch {
      toast.error('Не удалось сохранить текст')
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    setSaving(true)
    try {
      const res = await adminApi.updateContentText(item.key, null)
      onSaved({ ...item, value: res.value, is_overridden: res.is_overridden })
      toast.success('Сброшено к стандартному')
    } catch {
      toast.error('Не удалось сбросить')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-white/90 truncate">{item.label}</div>
        </div>
        {item.is_overridden ? (
          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-400/20">
            изменено
          </span>
        ) : (
          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-white/40 border border-white/10">
            стандарт
          </span>
        )}
      </div>

      <textarea
        className={textareaCls}
        rows={Math.min(12, Math.max(3, draft.split('\n').length + 1))}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        spellCheck={false}
      />

      {item.variables.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] text-white/40">
            Переменные — сохраняй их в тексте, иначе значение не подставится:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {item.variables.map(v => {
              const present = draft.includes(`{${v.name}}`)
              return (
                <span
                  key={v.name}
                  title={v.hint + (v.system ? ' (подставляется автоматически)' : '')}
                  className={[
                    'text-[11px] px-2 py-0.5 rounded-md border font-mono cursor-help',
                    present
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20'
                      : 'bg-amber-500/10 text-amber-300 border-amber-400/25',
                  ].join(' ')}
                >
                  {`{${v.name}}`}
                </span>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-500 transition-colors"
        >
          <Save size={14} /> Сохранить
        </button>
        {item.is_overridden && (
          <button
            type="button"
            disabled={saving}
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl bg-white/[0.06] text-white/70 hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <RotateCcw size={14} /> Сбросить
          </button>
        )}
      </div>
    </div>
  )
}

// ── Фото-карточка ────────────────────────────────────────────────────────────

function PhotoCard({ item, onSaved }: { item: ContentPhoto; onSaved: (p: ContentPhoto) => void }) {
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const preview = item.preview_url || normalizeImageUrl(item.url) || null

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const { url } = await adminApi.uploadImage(file)
      const res = await adminApi.updateContentPhoto(item.key, url)
      onSaved({ ...item, url: res.url, preview_url: res.preview_url, is_set: res.is_set })
      toast.success('Картинка обновлена')
    } catch {
      toast.error('Не удалось загрузить картинку')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      const res = await adminApi.updateContentPhoto(item.key, null)
      onSaved({ ...item, url: res.url, preview_url: res.preview_url, is_set: res.is_set })
      toast.success('Картинка убрана')
    } catch {
      toast.error('Не удалось убрать картинку')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
      <div>
        <div className="text-sm font-medium text-white/90">{item.label}</div>
        {item.hint && <div className="text-[11px] text-white/40 mt-0.5">{item.hint}</div>}
      </div>

      <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
        {preview ? (
          <img src={preview} alt={item.label} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-white/25">
            <ImageIcon size={26} />
            <span className="text-[11px]">Нет картинки</span>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-40"
        >
          <Upload size={14} /> {item.is_set ? 'Заменить' : 'Загрузить'}
        </button>
        {item.is_set && (
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl bg-white/[0.06] text-white/70 hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <Trash2 size={14} /> Убрать
          </button>
        )}
      </div>
    </div>
  )
}

// ── Страница ─────────────────────────────────────────────────────────────────

type Tab = 'texts' | 'photos'

export default function ContentPage() {
  const [content, setContent] = useState<BotContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<Tab>('texts')

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setContent(await adminApi.getContent())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const onTextSaved = useCallback((t: ContentText) => {
    setContent(c => c && { ...c, texts: c.texts.map(x => (x.key === t.key ? t : x)) })
  }, [])

  const onPhotoSaved = useCallback((p: ContentPhoto) => {
    setContent(c => c && { ...c, photos: c.photos.map(x => (x.key === p.key ? p : x)) })
  }, [])

  const textGroups = useMemo(() => (content ? groupBy(content.texts) : []), [content])
  const photoGroups = useMemo(() => (content ? groupBy(content.photos) : []), [content])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white">Контент бота</h1>
        <p className="text-sm text-white/45 mt-0.5">
          Тексты и картинки экранов бота. Картинки игр и сервисов задаются в товарах.
        </p>
      </div>

      <div className="inline-flex p-0.5 rounded-xl bg-white/[0.05] border border-white/[0.08]">
        {([['texts', 'Тексты'], ['photos', 'Фото']] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={[
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              tab === id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-white/40 py-8">Загрузка…</div>}

      {error && !loading && (
        <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2.5">
          <AlertCircle size={16} /> Не удалось загрузить контент.
          <button onClick={load} className="underline ml-1">Повторить</button>
        </div>
      )}

      {content && !loading && tab === 'texts' && (
        <div className="space-y-6">
          {textGroups.map(([group, items]) => (
            <section key={group} className="space-y-3">
              <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.14em]">{group}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {items.map(item => (
                  <TextCard key={item.key} item={item} onSaved={onTextSaved} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {content && !loading && tab === 'photos' && (
        <div className="space-y-6">
          {photoGroups.map(([group, items]) => (
            <section key={group} className="space-y-3">
              <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.14em]">{group}</h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {items.map(item => (
                  <PhotoCard key={item.key} item={item} onSaved={onPhotoSaved} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
