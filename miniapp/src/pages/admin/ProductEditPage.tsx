/**
 * src/pages/admin/ProductEditPage.tsx
 * Создание и редактирование товара в админ-панели.
 * Маршруты:
 *   /admin/catalog/products/new   — создание
 *   /admin/catalog/products/:id   — редактирование
 */

import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, AlertCircle, Save, ExternalLink, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/api/admin'
import type { AdminGame, AdminCategory, AdminProductDetail } from '@/api/admin'

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  game_id: string
  category_id: string
  name: string
  short_description: string
  description: string
  price: string
  stock: string
  delivery_type: 'manual' | 'auto' | 'mixed'
  is_active: boolean
  instruction: string
}

const EMPTY_FORM: FormState = {
  game_id: '',
  category_id: '',
  name: '',
  short_description: '',
  description: '',
  price: '',
  stock: '',
  delivery_type: 'manual',
  is_active: true,
  instruction: '',
}

const DELIVERY_OPTIONS: { value: FormState['delivery_type']; label: string }[] = [
  { value: 'manual', label: 'Вручную' },
  { value: 'auto',   label: 'Автоматически' },
  { value: 'mixed',  label: 'Смешанный' },
]

// ── Validation ────────────────────────────────────────────────────────────────

interface FormErrors {
  category_id?: string
  name?: string
  price?: string
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {}
  if (!form.category_id) errors.category_id = 'Выберите категорию'
  if (!form.name.trim()) errors.name = 'Введите название'
  if (form.name.trim().length > 256) errors.name = 'Не более 256 символов'
  if (form.price === '') {
    errors.price = 'Введите цену'
  } else if (Number(form.price) < 0) {
    errors.price = 'Цена не может быть отрицательной'
  }
  return errors
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProductEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isNew = id === 'new'
  const presetCategoryId = isNew ? searchParams.get('category_id') : null

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [games, setGames] = useState<AdminGame[]>([])
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loadingInit, setLoadingInit] = useState(true)
  const [loadingCats, setLoadingCats] = useState(false)
  const [initError, setInitError] = useState(false)
  const [saving, setSaving] = useState(false)

  // Keys management
  const [keyStats, setKeyStats] = useState<{ total: number; used: number; available: number } | null>(null)
  const [keysInput, setKeysInput] = useState('')
  const [keysLoading, setKeysLoading] = useState(false)
  const [keysAdding, setKeysAdding] = useState(false)
  const [keysClearing, setKeysClearing] = useState(false)

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    setLoadingInit(true)
    setInitError(false)

    const loadGames = adminApi.getGames()

    if (isNew) {
      loadGames
        .then(async (g) => {
          setGames(g)
          // Auto-fill game & category from URL param
          if (presetCategoryId) {
            for (const game of g) {
              const cats = await adminApi.getCategories(game.id).catch(() => [] as AdminCategory[])
              if (cats.some((c) => c.id === presetCategoryId)) {
                setCategories(cats)
                setForm((prev) => ({ ...prev, game_id: game.id, category_id: presetCategoryId }))
                break
              }
            }
          }
        })
        .catch(() => setInitError(true))
        .finally(() => setLoadingInit(false))
    } else {
      Promise.all([loadGames, adminApi.getProduct(id!)])
        .then(async ([gamesData, product]) => {
          setGames(gamesData)
          // Перебираем игры, ищем ту чья категория совпадает с product.category_id
          let foundGameId = ''
          let foundCats: AdminCategory[] = []
          for (const game of gamesData) {
            const gc = await adminApi.getCategories(game.id).catch(() => [] as AdminCategory[])
            if (gc.some((c) => c.id === product.category_id)) {
              foundGameId = game.id
              foundCats = gc
              break
            }
          }
          setCategories(foundCats)
          prefillForm(product, foundGameId)
        })
        .catch(() => setInitError(true))
        .finally(() => setLoadingInit(false))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const loadKeyStats = useCallback(async () => {
    if (isNew || !id) return
    setKeysLoading(true)
    try {
      const stats = await adminApi.getProductKeyStats(id)
      setKeyStats(stats)
    } catch {}
    finally { setKeysLoading(false) }
  }, [isNew, id])

  useEffect(() => {
    if (form.delivery_type !== 'manual' && !isNew) {
      loadKeyStats()
    }
  }, [form.delivery_type, isNew, loadKeyStats])

  function prefillForm(product: AdminProductDetail, gameId: string) {
    setForm({
      game_id: gameId,
      category_id: product.category_id,
      name: product.name,
      short_description: product.short_description ?? '',
      description: product.description ?? '',
      price: String(product.price),
      stock: product.stock !== null ? String(product.stock) : '',
      delivery_type: (product.delivery_type as FormState['delivery_type']) ?? 'manual',
      is_active: product.is_active,
      instruction: product.instruction ?? '',
    })
  }

  // ── Load categories when game changes ───────────────────────────────────────

  function handleGameChange(gameId: string) {
    setForm((prev) => ({ ...prev, game_id: gameId, category_id: '' }))
    setCategories([])
    if (!gameId) return
    setLoadingCats(true)
    adminApi
      .getCategories(gameId)
      .then((cats) => setCategories(cats))
      .catch(() => toast.error('Не удалось загрузить категории'))
      .finally(() => setLoadingCats(false))
  }

  // ── Field helpers ───────────────────────────────────────────────────────────

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (errors[key as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }))
    }
  }

  // ── Keys handlers ───────────────────────────────────────────────────────────

  async function handleAddKeys() {
    const lines = keysInput.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length || !id) return
    setKeysAdding(true)
    try {
      const res = await adminApi.addProductKeys(id, lines)
      toast.success(`Добавлено ${res.added} ключей`)
      setKeysInput('')
      await loadKeyStats()
    } catch {
      toast.error('Ошибка добавления ключей')
    } finally { setKeysAdding(false) }
  }

  async function handleClearUnused() {
    if (!id || !window.confirm('Удалить все неиспользованные ключи?')) return
    setKeysClearing(true)
    try {
      const res = await adminApi.deleteUnusedProductKeys(id)
      toast.success(`Удалено ${res.deleted} ключей`)
      await loadKeyStats()
    } catch {
      toast.error('Ошибка')
    } finally { setKeysClearing(false) }
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    const validationErrors = validate(form)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      toast.error('Заполните обязательные поля')
      return
    }

    const payload: Record<string, unknown> = {
      category_id: form.category_id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      short_description: form.short_description.trim() || null,
      price: Number(form.price),
      stock: form.stock !== '' ? Number(form.stock) : null,
      delivery_type: form.delivery_type,
      instruction: form.instruction.trim() || null,
      is_active: form.is_active,
    }

    setSaving(true)
    try {
      if (isNew) {
        await adminApi.createProduct(payload)
        toast.success('Товар создан')
      } else {
        await adminApi.updateProduct(id!, payload)
        toast.success('Товар сохранён')
      }
      navigate('/admin/catalog')
    } catch {
      toast.error(isNew ? 'Не удалось создать товар' : 'Не удалось сохранить товар')
    } finally {
      setSaving(false)
    }
  }

  // ── Loading skeleton ────────────────────────────────────────────────────────

  if (loadingInit) {
    return <p className="text-white/40 text-sm py-8 text-center">Загрузка...</p>
  }

  if (initError) {
    return (
      <div className="flex flex-col items-center py-20 gap-3 text-white/40">
        <AlertCircle size={40} />
        <p className="text-sm">Не удалось загрузить данные</p>
        <button onClick={() => navigate(-1)} className="text-xs text-blue-400">
          Назад
        </button>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={18} className="text-white/60" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-white">
            {isNew ? 'Новый товар' : 'Редактирование товара'}
          </h1>
          <p className="text-xs text-white/40">
            {isNew ? 'Заполните данные и сохраните' : 'Измените нужные поля'}
          </p>
        </div>
        {!isNew && (
          <>
            <button
              onClick={() => window.open(`${window.location.origin}/app/product/${id}`, '_blank')}
              className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
              title="Открыть в магазине"
            >
              <ExternalLink size={16} />
            </button>
            <button
              onClick={async () => {
                try {
                  const copy = await adminApi.copyProduct(id!)
                  toast.success('Товар скопирован')
                  navigate(`/admin/catalog/products/${copy.id}`)
                } catch {
                  toast.error('Ошибка')
                }
              }}
              className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
              title="Дублировать"
            >
              <Copy size={16} />
            </button>
          </>
        )}
      </div>

      {/* Section: Категория — скрыт если предзаполнен из URL */}
      {presetCategoryId && form.category_id ? (
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
          <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Категория</h2>
          <p className="text-sm text-white">
            {games.find(g => g.id === form.game_id)?.name}
            {' / '}
            {categories.find(c => c.id === form.category_id)?.name}
          </p>
        </div>
      ) : (
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-4">
        <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Категория</h2>

        {/* Game select */}
        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Игра</label>
          <select
            value={form.game_id}
            onChange={(e) => handleGameChange(e.target.value)}
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50 appearance-none transition-all duration-200"
          >
            <option value="" className="bg-[#060f1e]">— Выберите игру —</option>
            {games.map((game) => (
              <option key={game.id} value={game.id} className="bg-[#060f1e]">
                {game.name}
              </option>
            ))}
          </select>
        </div>

        {/* Category select */}
        <div>
          <label className="text-xs text-white/50 mb-1.5 block">
            Категория <span className="text-red-400">*</span>
          </label>
          <select
            value={form.category_id}
            onChange={(e) => setField('category_id', e.target.value)}
            disabled={!form.game_id || loadingCats}
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50 disabled:opacity-40 appearance-none transition-all duration-200"
          >
            <option value="" className="bg-[#060f1e]">
              {loadingCats ? 'Загрузка...' : '— Выберите категорию —'}
            </option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id} className="bg-[#060f1e]">
                {cat.name}
              </option>
            ))}
          </select>
          {errors.category_id && (
            <p className="text-xs text-red-400 mt-1">{errors.category_id}</p>
          )}
        </div>
      </div>
      )}

      {/* Section: Основное */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-4">
        <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Основное</h2>

        {/* Name */}
        <div>
          <label className="text-xs text-white/50 mb-1.5 block">
            Название <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="Например: Кристаллы 1000 шт."
            maxLength={256}
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all duration-200"
          />
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
        </div>

        {/* Short description */}
        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Краткое описание</label>
          <input
            type="text"
            value={form.short_description}
            onChange={(e) => setField('short_description', e.target.value)}
            placeholder="Отображается в карточке товара"
            maxLength={512}
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all duration-200"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Описание</label>
          <textarea
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            rows={4}
            placeholder="Подробное описание товара..."
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50 resize-none transition-all duration-200"
          />
        </div>
      </div>

      {/* Section: Цена и склад */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-4">
        <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Цена и наличие</h2>

        <div className="grid grid-cols-2 gap-3">
          {/* Price */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">
              Цена, ₽ <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              value={form.price}
              onChange={(e) => setField('price', e.target.value)}
              placeholder="0"
              min={0}
              step="0.01"
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all duration-200"
            />
            {errors.price && <p className="text-xs text-red-400 mt-1">{errors.price}</p>}
          </div>

          {/* Stock */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Остаток</label>
            <input
              type="number"
              value={form.stock}
              onChange={(e) => setField('stock', e.target.value)}
              placeholder="Не ограничен"
              min={0}
              step={1}
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all duration-200"
            />
          </div>
        </div>

        {/* Delivery type */}
        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Тип доставки</label>
          <select
            value={form.delivery_type}
            onChange={(e) => setField('delivery_type', e.target.value as FormState['delivery_type'])}
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50 appearance-none transition-all duration-200"
          >
            {DELIVERY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[#060f1e]">
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Section: Ключи автовыдачи */}
      {form.delivery_type !== 'manual' && !isNew && (
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Ключи автовыдачи</h2>
            {keyStats && (
              <div className="flex gap-3 text-xs">
                <span className="text-emerald-400">{keyStats.available} доступно</span>
                <span className="text-white/30">{keyStats.used} использовано</span>
              </div>
            )}
            {keysLoading && <span className="text-xs text-white/30">Загрузка...</span>}
          </div>

          <div>
            <label className="text-xs text-white/50 mb-1.5 block">
              Новые ключи <span className="text-white/30">(по одному на строку)</span>
            </label>
            <textarea
              value={keysInput}
              onChange={e => setKeysInput(e.target.value)}
              rows={6}
              placeholder={"key-abc-123\nkey-def-456\nkey-ghi-789"}
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50 resize-none font-mono transition-all duration-200"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-white/30">
                {keysInput.split('\n').filter(l => l.trim()).length} строк
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAddKeys}
              disabled={keysAdding || !keysInput.trim()}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-[0.98]"
            >
              {keysAdding ? 'Добавление...' : 'Добавить ключи'}
            </button>
            {keyStats && keyStats.available > 0 && (
              <button
                type="button"
                onClick={handleClearUnused}
                disabled={keysClearing}
                className="px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-red-500/10 hover:border-red-500/30 disabled:opacity-40 text-white/50 hover:text-red-400 text-sm transition-all active:scale-[0.98]"
              >
                {keysClearing ? '...' : 'Очистить'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Section: Инструкция */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-4">
        <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Инструкция</h2>
        <textarea
          value={form.instruction}
          onChange={(e) => setField('instruction', e.target.value)}
          rows={4}
          placeholder="Что покупатель должен сделать для получения товара..."
          className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50 resize-none transition-all duration-200"
        />
      </div>

      {/* Section: Публикация */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Активен</p>
            <p className="text-xs text-white/40 mt-0.5">Товар виден покупателям</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.is_active}
            onClick={() => setField('is_active', !form.is_active)}
            className={[
              'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none',
              form.is_active ? 'bg-blue-600' : 'bg-white/15',
            ].join(' ')}
          >
            <span
              className={[
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition duration-200',
                form.is_active ? 'translate-x-5' : 'translate-x-0',
              ].join(' ')}
            />
          </button>
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSubmit}
        disabled={saving}
        className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm font-semibold text-white transition-all duration-200 active:scale-[0.98]"
      >
        {saving ? (
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <Save size={16} />
        )}
        {isNew ? 'Создать товар' : 'Сохранить изменения'}
      </button>
    </div>
  )
}
