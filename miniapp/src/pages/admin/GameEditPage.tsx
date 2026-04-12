/**
 * src/pages/admin/GameEditPage.tsx
 * Создание / редактирование игры + управление категориями.
 *
 * Routes:
 *   /admin/catalog/games/new   — create mode
 *   /admin/catalog/games/:id   — edit mode
 */

import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, Plus, AlertCircle, Upload, Loader2, ImageOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/api/admin'
import type { AdminGame, AdminCategory } from '@/api/admin'

// ── helpers ──────────────────────────────────────────────────────────────────

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── sub-components ────────────────────────────────────────────────────────────

interface ToggleProps {
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

function Toggle({ value, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
        'transition-colors duration-200 focus:outline-none disabled:opacity-40',
        value ? 'bg-blue-600' : 'bg-white/10',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow',
          'transform transition-transform duration-200',
          value ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  )
}

interface FieldProps {
  label: string
  hint?: string
  children: React.ReactNode
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-white/50 uppercase tracking-wide">{label}</label>
        {hint && <span className="text-[11px] text-white/25">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

const inputCls =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white ' +
  'placeholder:text-white/25 focus:outline-none focus:border-blue-500/50 transition-colors'

// ── page ──────────────────────────────────────────────────────────────────────

interface FormState {
  name: string
  slug: string
  image_url: string
  description: string
  is_active: boolean
  is_featured: boolean
}

const EMPTY_FORM: FormState = {
  name: '',
  slug: '',
  image_url: '',
  description: '',
  is_active: true,
  is_featured: false,
}

export default function GameEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isCreate = id === 'new'

  // ── game form state ──
  const [form, setForm]             = useState<FormState>(EMPTY_FORM)
  const [loadingGame, setLoadingGame] = useState(!isCreate)
  const [loadError, setLoadError]   = useState(false)
  const [saving, setSaving]         = useState(false)
  // track whether slug has been touched manually
  const slugManual = useRef(false)

  // ── image upload state ──
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── categories state (edit mode only) ──
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [addingCat, setAddingCat]     = useState(false)

  // ── load game in edit mode ──
  useEffect(() => {
    if (isCreate) return
    setLoadingGame(true)
    setLoadError(false)

    Promise.all([
      adminApi.getGames(),
      adminApi.getCategories(id!),
    ])
      .then(([games, cats]) => {
        const game = games.find((g) => g.id === id)
        if (!game) { setLoadError(true); return }
        setForm({
          name:        game.name,
          slug:        game.slug ?? '',
          image_url:   game.image_url ?? '',
          description: game.description ?? '',
          is_active:   game.is_active,
          is_featured: game.is_featured,
        })
        slugManual.current = true // pre-filled — treat as manual
        setCategories(cats)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoadingGame(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ── form helpers ──
  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleNameChange(value: string) {
    set('name', value)
    if (!slugManual.current) {
      set('slug', slugify(value))
    }
  }

  function handleSlugChange(value: string) {
    slugManual.current = true
    set('slug', value)
  }

  // ── image upload ──
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // reset so same file can be selected again
    e.target.value = ''
    setUploadingImage(true)
    try {
      const { url } = await adminApi.uploadImage(file)
      set('image_url', url)
      toast.success('Изображение загружено')
    } catch {
      toast.error('Ошибка загрузки изображения')
    } finally {
      setUploadingImage(false)
    }
  }

  // ── submit game form ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Название обязательно'); return }
    setSaving(true)
    try {
      const payload = {
        name:        form.name.trim(),
        slug:        form.slug.trim() || undefined,
        image_url:   form.image_url.trim() || undefined,
        description: form.description.trim() || undefined,
        is_active:   form.is_active,
        is_featured: form.is_featured,
      }

      if (isCreate) {
        await adminApi.createGame(payload)
        toast.success('Игра создана')
        navigate('/admin/catalog')
      } else {
        await adminApi.updateGame(id!, payload)
        toast.success('Сохранено')
      }
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  // ── add category ──
  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!newCatName.trim()) return
    setAddingCat(true)
    try {
      const cat = await adminApi.createCategory({
        game_id:   id!,
        name:      newCatName.trim(),
        is_active: true,
      })
      setCategories((prev) => [...prev, cat])
      setNewCatName('')
      toast.success('Категория добавлена')
    } catch {
      toast.error('Ошибка добавления категории')
    } finally {
      setAddingCat(false)
    }
  }

  // ── loading skeleton ──
  if (loadingGame) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-40 bg-white/5 rounded-xl" />
        <div className="h-64 bg-white/5 rounded-2xl" />
      </div>
    )
  }

  // ── load error ──
  if (loadError) {
    return (
      <div className="flex flex-col items-center py-20 gap-3 text-white/40">
        <AlertCircle size={40} />
        <p className="text-sm">Игра не найдена</p>
        <button onClick={() => navigate(-1)} className="text-xs text-blue-400">
          Назад
        </button>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors shrink-0"
        >
          <ArrowLeft size={18} className="text-white/60" />
        </button>
        <h1 className="text-lg font-bold text-white">
          {isCreate ? 'Новая игра' : 'Редактировать игру'}
        </h1>
      </div>

      {/* Game form */}
      <form onSubmit={handleSubmit}>
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-4">
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">
            Основная информация
          </h2>

          {/* Name */}
          <Field label="Название" hint="обязательно">
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Например: Dota 2"
              className={inputCls}
              required
            />
          </Field>

          {/* Slug */}
          <Field label="Slug" hint="необязательно — генерируется автоматически">
            <input
              type="text"
              value={form.slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="dota-2"
              className={inputCls}
            />
          </Field>

          {/* Image URL + upload */}
          <Field label="URL изображения" hint="необязательно">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleImageUpload}
            />

            <div className="space-y-2">
              {/* Text input + upload button row */}
              <div className="flex gap-2">
                <input
                  type="url"
                  value={form.image_url}
                  onChange={(e) => set('image_url', e.target.value)}
                  placeholder="https://..."
                  className={[inputCls, 'flex-1'].join(' ')}
                  disabled={uploadingImage}
                />
                <button
                  type="button"
                  disabled={uploadingImage}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40 text-sm text-white/70 transition-colors shrink-0"
                  title="Загрузить файл"
                >
                  {uploadingImage ? (
                    <Loader2 size={16} className="animate-spin text-blue-400" />
                  ) : (
                    <Upload size={16} />
                  )}
                  <span className="text-xs">{uploadingImage ? 'Загрузка...' : 'Загрузить'}</span>
                </button>
              </div>

              {/* Image preview */}
              {form.image_url && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="relative w-full h-36 rounded-xl overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center"
                >
                  <img
                    src={form.image_url}
                    alt="Превью"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                      ;(e.currentTarget.nextElementSibling as HTMLElement | null)?.removeAttribute('style')
                    }}
                  />
                  <div
                    className="flex flex-col items-center gap-1 text-white/20"
                    style={{ display: 'none' }}
                  >
                    <ImageOff size={24} />
                    <span className="text-xs">Не удалось загрузить</span>
                  </div>
                </motion.div>
              )}
            </div>
          </Field>

          {/* Description */}
          <Field label="Описание" hint="необязательно">
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Краткое описание игры..."
              rows={3}
              className={[inputCls, 'resize-none leading-relaxed'].join(' ')}
            />
          </Field>

          {/* Toggles */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
              <span className="text-sm text-white/70">Активна</span>
              <Toggle value={form.is_active} onChange={(v) => set('is_active', v)} />
            </div>
            <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
              <span className="text-sm text-white/70">В подборке</span>
              <Toggle value={form.is_featured} onChange={(v) => set('is_featured', v)} />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-sm font-semibold text-white transition-colors"
          >
            <Save size={16} />
            {saving ? 'Сохранение...' : isCreate ? 'Создать игру' : 'Сохранить изменения'}
          </button>
        </div>
      </form>

      {/* Categories section — edit mode only */}
      {!isCreate && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-3"
        >
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">
            Категории {categories.length > 0 && `(${categories.length})`}
          </h2>

          {/* Category list */}
          {categories.length === 0 ? (
            <p className="text-sm text-white/25 py-2">Категорий пока нет</p>
          ) : (
            <div className="space-y-1.5">
              {categories.map((cat, i) => (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15, delay: i * 0.03 }}
                  className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-3 py-2.5"
                >
                  <span className="text-sm text-white font-medium truncate flex-1 min-w-0 pr-2">
                    {cat.name}
                  </span>
                  <span
                    className={[
                      'text-xs px-2 py-0.5 rounded-full shrink-0',
                      cat.is_active
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-white/5 text-white/30',
                    ].join(' ')}
                  >
                    {cat.is_active ? 'Активна' : 'Неактивна'}
                  </span>
                </motion.div>
              ))}
            </div>
          )}

          {/* Add category form */}
          <form onSubmit={handleAddCategory} className="flex gap-2 pt-1">
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Название новой категории"
              className={[inputCls, 'flex-1'].join(' ')}
              disabled={addingCat}
            />
            <button
              type="submit"
              disabled={addingCat || !newCatName.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-sm font-semibold text-white transition-colors shrink-0"
            >
              <Plus size={15} />
              Добавить
            </button>
          </form>
        </motion.div>
      )}
    </motion.div>
  )
}
