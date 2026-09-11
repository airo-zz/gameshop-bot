/**
 * src/pages/admin/CatalogPage.tsx
 * Двухуровневый каталог: Игры → Воркспейс игры.
 * Воркспейс = аккордеон категорий, под каждой — её товары и строка быстрого
 * создания лота. Всё для одной игры на одном экране.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import {
  Plus,
  AlertCircle,
  Gamepad2,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Trash2,
  Pencil,
  ImageOff,
  PercentSquare,
  X,
  Copy,
  Pin,
  Upload,
  Check,
  Settings,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { adminApi } from '@/api/admin'
import type { AdminGame, AdminCategory, AdminProductListItem } from '@/api/admin'
import { normalizeImageUrl } from '@/utils/imageUrl'
import SortableRow from '@/components/admin/SortableRow'
import GgselImportModal from '@/pages/admin/GgselImportModal'
import ProductEditModal from '@/pages/admin/ProductEditModal'
import CategoryEditModal from '@/pages/admin/CategoryEditModal'
import toast from 'react-hot-toast'

type Step = 'games' | 'workspace'

function formatMoney(v: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(v)
}

const inputCls = 'w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-all duration-200'

// ── Модалка массового изменения цен ──────────────────────────────────────────

interface BulkPriceModalProps {
  categoryId: string
  onClose: () => void
  onApplied: () => void
}

function BulkPriceModal({ categoryId, onClose, onApplied }: BulkPriceModalProps) {
  const [mode, setMode] = useState<'percent' | 'fixed'>('percent')
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)

  const handleApply = async () => {
    const numVal = parseFloat(value)
    if (isNaN(numVal)) {
      toast.error('Введите корректное значение')
      return
    }
    if (mode === 'percent') {
      // Процент может быть отрицательным (снижение), но не ≤ -100%.
      if (numVal <= -100) {
        toast.error('Снижение не может быть 100% и более')
        return
      }
    } else if (numVal < 0) {
      toast.error('Цена не может быть отрицательной')
      return
    }
    setLoading(true)
    try {
      const res = await adminApi.bulkPriceUpdate({
        mode,
        value: numVal,
        scope: 'category',
        category_id: categoryId,
      })
      toast.success(`Обновлено товаров: ${res.updated_count}`)
      onApplied()
      onClose()
    } catch {
      toast.error('Ошибка при обновлении цен')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-[#1a1f2e] border border-white/[0.1] rounded-t-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Изменить цены</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/[0.08] active:scale-[0.95] transition-all"
          >
            <X size={18} className="text-white/50" />
          </button>
        </div>

        {/* Режим */}
        <div className="flex gap-1 bg-white/[0.05] p-1 rounded-xl">
          {(['percent', 'fixed'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={[
                'flex-1 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 active:scale-[0.98]',
                mode === m ? 'bg-white/[0.12] text-white' : 'text-white/40 hover:text-white/60',
              ].join(' ')}
            >
              {m === 'percent' ? 'Процент' : 'Фиксированная цена'}
            </button>
          ))}
        </div>

        {/* Значение */}
        <div>
          <label className="text-xs text-white/50 mb-1 block">
            {mode === 'percent' ? 'Изменение, %' : 'Новая цена, ₽'}
          </label>
          <input
            type="number"
            min={mode === 'percent' ? undefined : '0'}
            step={mode === 'percent' ? '1' : '0.01'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={mode === 'percent' ? 'Например: 10 или -5' : 'Например: 299'}
            className={inputCls}
          />
          {mode === 'percent' && value && !isNaN(parseFloat(value)) && (
            <p className="text-xs text-white/40 mt-1">
              Цена будет умножена на коэффициент {(1 + parseFloat(value) / 100).toFixed(4)}
            </p>
          )}
        </div>

        <button
          onClick={handleApply}
          disabled={loading || !value}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white transition-all duration-200 active:scale-[0.98]"
        >
          {loading ? 'Применяем...' : 'Применить'}
        </button>
      </div>
    </div>
  )
}

// ── Уровень 1: Игры ───────────────────────────────────────────────────────────

interface GamesLevelProps {
  onSelect: (game: AdminGame) => void
}

function GamesLevel({ onSelect }: GamesLevelProps) {
  const navigate = useNavigate()
  const [games, setGames] = useState<AdminGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    adminApi
      .getGames()
      .then(setGames)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Каталог</h1>
          <p className="text-xs text-white/40 mt-0.5">Выберите игру</p>
        </div>
        <button
          onClick={() => navigate('/admin/catalog/games')}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] active:scale-[0.97] text-xs font-medium text-white/60 transition-all duration-200"
        >
          Управление играми
          <ChevronRight size={14} />
        </button>
      </div>

      {loading ? (
        <p className="text-white/40 text-sm py-8 text-center">Загрузка...</p>
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/40">
          <AlertCircle size={36} />
          <p className="text-sm">Ошибка загрузки игр</p>
          <button onClick={load} className="text-xs text-white/50 hover:text-white/70 active:scale-[0.98] transition-transform">Попробовать снова</button>
        </div>
      ) : games.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/30">
          <Gamepad2 size={36} />
          <p className="text-sm">Игр пока нет</p>
        </div>
      ) : (
        <div className="space-y-2">
          {games.map((game) => (
            <div
              key={game.id}
              onClick={() => onSelect(game)}
              className="flex items-center gap-3 bg-[#1a1f2e] hover:bg-[#1f2538] border border-white/[0.06] rounded-xl px-4 py-3.5 transition-all duration-200 cursor-pointer active:scale-[0.99]"
            >
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/[0.05] shrink-0 flex items-center justify-center">
                {game.image_url ? (
                  <img
                    src={normalizeImageUrl(game.image_url) ?? game.image_url}
                    alt={game.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                    }}
                  />
                ) : (
                  <ImageOff size={18} className="text-white/20" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{game.name}</div>
                <div className="text-xs text-white/50 mt-0.5">
                  <span className={game.is_active ? 'text-emerald-400' : 'text-white/30'}>
                    {game.is_active ? 'Активна' : 'Неактивна'}
                  </span>
                </div>
              </div>
              <ChevronRight size={16} className="text-white/30 shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Строка быстрого создания товара ───────────────────────────────────────────

interface QuickAddRowProps {
  categoryId: string
  onCreated: (product: AdminProductListItem) => void
}

function QuickAddRow({ categoryId, onCreated }: QuickAddRowProps) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed || price === '' || Number(price) < 0) return
    setSaving(true)
    try {
      const created = await adminApi.createProduct({
        category_id: categoryId,
        name: trimmed,
        price_usd: Number(price),
      })
      onCreated(created as unknown as AdminProductListItem)
      setName('')
      setPrice('')
      nameRef.current?.focus()
    } catch {
      toast.error('Не удалось создать товар')
    } finally {
      setSaving(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  const ready = name.trim() !== '' && price !== ''

  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/[0.15] bg-white/[0.02] px-2.5 py-2">
      <Plus size={15} className="text-white/30 shrink-0" />
      <input
        ref={nameRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Название лота"
        className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
      />
      <input
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="$"
        min={0}
        step="0.01"
        className="w-20 shrink-0 bg-white/[0.05] border border-white/[0.08] rounded-lg px-2 py-1.5 text-sm text-white text-right placeholder:text-white/25 focus:outline-none focus:border-white/20"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!ready || saving}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-semibold text-white transition-all active:scale-[0.97]"
      >
        {saving ? '…' : 'Создать'}
      </button>
    </div>
  )
}

// ── Секция категории (аккордеон) ──────────────────────────────────────────────

interface CategorySectionProps {
  category: AdminCategory
  products: AdminProductListItem[]
  expanded: boolean
  onToggleExpanded: () => void
  onProductsChange: (updater: (prev: AdminProductListItem[]) => AdminProductListItem[]) => void
  onToggleFeatured: () => void
  onDeleteCategory: () => void
  onOpenBulkPrice: () => void
  onRename: (name: string) => Promise<void>
  onEditProduct: (productId: string) => void
  onReloadCategory: () => void
  onEditCategory: () => void
}

function CategorySection({
  category,
  products,
  expanded,
  onToggleExpanded,
  onProductsChange,
  onToggleFeatured,
  onDeleteCategory,
  onOpenBulkPrice,
  onRename,
  onEditProduct,
  onReloadCategory,
  onEditCategory,
}: CategorySectionProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(category.name)
  const [renaming, setRenaming] = useState(false)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function saveRename() {
    const name = draftName.trim()
    if (!name || name === category.name) { setEditing(false); setDraftName(category.name); return }
    setRenaming(true)
    try {
      await onRename(name)
      setEditing(false)
    } catch {
      toast.error('Не удалось переименовать')
    } finally {
      setRenaming(false)
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = products.findIndex(p => p.id === active.id)
    const newIndex = products.findIndex(p => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(products, oldIndex, newIndex)
    onProductsChange(() => reordered)

    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      try {
        await adminApi.reorderProducts(reordered.map((p, i) => ({ id: p.id, sort_order: i })))
      } catch {
        toast.error('Не удалось сохранить порядок')
      }
    }, 600)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Удалить товар "${name}"?`)) return
    setDeletingId(id)
    try {
      await adminApi.deleteProduct(id)
      onProductsChange(prev => prev.filter(p => p.id !== id))
      toast.success('Товар удалён')
    } catch {
      toast.error('Не удалось удалить товар')
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleActive = async (product: AdminProductListItem) => {
    setTogglingId(product.id)
    try {
      await adminApi.updateProduct(product.id, { is_active: !product.is_active })
      onProductsChange(prev => prev.map(p => p.id === product.id ? { ...p, is_active: !p.is_active } : p))
    } catch {
      toast.error('Не удалось изменить статус')
    } finally {
      setTogglingId(null)
    }
  }

  const handleDuplicate = async (id: string) => {
    try {
      const copy = await adminApi.copyProduct(id)
      toast.success('Товар скопирован')
      onReloadCategory()
      onEditProduct(copy.id)
    } catch {
      toast.error('Ошибка копирования')
    }
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Заголовок категории */}
      <div className="flex items-center gap-2 px-3 py-3">
        {editing ? (
          <>
            <FolderOpen size={16} className="text-white/40 shrink-0" />
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); saveRename() }
                if (e.key === 'Escape') { setEditing(false); setDraftName(category.name) }
              }}
              maxLength={128}
              className="flex-1 min-w-0 bg-white/[0.05] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
            />
            <button
              type="button"
              onClick={saveRename}
              disabled={renaming}
              className="shrink-0 p-1.5 rounded-lg text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 hover:bg-emerald-400/20 disabled:opacity-40 transition-all"
              title="Сохранить"
            >
              <Check size={13} />
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setDraftName(category.name) }}
              className="shrink-0 p-1.5 rounded-lg text-white/40 bg-white/[0.03] border border-white/[0.08] hover:text-white/70 transition-all"
              title="Отмена"
            >
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onToggleExpanded}
              className="flex items-center gap-2 flex-1 min-w-0 text-left active:scale-[0.99] transition-transform"
            >
              {expanded
                ? <ChevronDown size={16} className="text-white/40 shrink-0" />
                : <ChevronRight size={16} className="text-white/40 shrink-0" />}
              <FolderOpen size={16} className="text-white/40 shrink-0" />
              <span className="text-sm font-medium text-white truncate">{category.name}</span>
              <span className="text-xs text-white/30 shrink-0">{products.length}</span>
              {!category.is_active && (
                <span className="text-xs text-white/30 shrink-0">· скрыта</span>
              )}
              {category.is_featured && (
                <span className="text-xs text-amber-400 shrink-0">· на главной</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setDraftName(category.name); setEditing(true) }}
              className="shrink-0 p-1.5 rounded-lg text-white/20 bg-white/[0.03] border border-white/[0.08] hover:text-white/60 transition-all"
              title="Переименовать"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={onEditCategory}
              className="shrink-0 p-1.5 rounded-lg text-white/20 bg-white/[0.03] border border-white/[0.08] hover:text-white/60 transition-all"
              title="Описание и поля подраздела"
            >
              <Settings size={13} />
            </button>
            <button
              type="button"
              onClick={onToggleFeatured}
              className={`shrink-0 p-1.5 rounded-lg transition-all ${
                category.is_featured
                  ? 'text-amber-400 bg-amber-400/10 border border-amber-400/30'
                  : 'text-white/20 bg-white/[0.03] border border-white/[0.08] hover:text-white/50'
              }`}
              title={category.is_featured ? 'Убрать с главной' : 'Закрепить на главной'}
            >
              <Pin size={13} className={category.is_featured ? 'fill-amber-400' : ''} />
            </button>
            <button
              type="button"
              onClick={onOpenBulkPrice}
              className="shrink-0 p-1.5 rounded-lg text-white/30 bg-white/[0.03] border border-white/[0.08] hover:text-white/60 transition-all"
              title="Изменить цены в категории"
            >
              <PercentSquare size={13} />
            </button>
            <button
              type="button"
              onClick={onDeleteCategory}
              className="shrink-0 p-1.5 rounded-lg text-white/20 bg-white/[0.03] border border-white/[0.08] hover:text-red-400 hover:border-red-400/30 transition-all"
              title="Удалить категорию"
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>

      {/* Тело: товары + быстрое добавление */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {products.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={products.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {products.map((product) => (
                    <SortableRow key={product.id} id={product.id} style={{ paddingLeft: 24 }}>
                      <div className="flex items-center gap-2 border rounded-xl px-2.5 py-2 bg-[#1a1f2e] border-white/[0.06]">
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => onEditProduct(product.id)}
                        >
                          <div className="text-sm text-white truncate">{product.name}</div>
                          <div className="text-xs text-white/40">
                            {product.delivery_type}
                            {product.stock !== null && ` · склад: ${product.stock}`}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-white shrink-0 mr-0.5">
                          {formatMoney(product.price)}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(product)}
                          disabled={togglingId === product.id}
                          className={`shrink-0 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all active:scale-[0.95] disabled:opacity-40 ${
                            product.is_active
                              ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25'
                              : 'text-white/40 bg-white/[0.04] border-white/[0.08]'
                          }`}
                          title={product.is_active ? 'Скрыть с витрины' : 'Показать на витрине'}
                        >
                          {product.is_active ? 'Активен' : 'Скрыт'}
                        </button>
                        <button
                          onClick={() => handleDuplicate(product.id)}
                          className="shrink-0 p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/40 hover:text-white/80 active:scale-[0.9] transition-all"
                          title="Дублировать"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          onClick={() => onEditProduct(product.id)}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-white/[0.08] active:scale-[0.9] transition-all"
                          title="Редактировать"
                        >
                          <Pencil size={14} className="text-white/40" />
                        </button>
                        <button
                          onClick={() => handleDelete(product.id, product.name)}
                          disabled={deletingId === product.id}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-red-500/20 active:scale-[0.9] transition-all disabled:opacity-40"
                          title="Удалить"
                        >
                          <Trash2 size={14} className="text-red-400/70" />
                        </button>
                      </div>
                    </SortableRow>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <QuickAddRow
            categoryId={category.id}
            onCreated={(product) => onProductsChange(prev => [...prev, product])}
          />
        </div>
      )}
    </div>
  )
}

// ── Уровень 2: Воркспейс игры ─────────────────────────────────────────────────

interface GameWorkspaceLevelProps {
  game: AdminGame
  onBack: () => void
}

function GameWorkspaceLevel({ game, onBack }: GameWorkspaceLevelProps) {
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [productsByCat, setProductsByCat] = useState<Record<string, AdminProductListItem[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [bulkPriceCat, setBulkPriceCat] = useState<string | null>(null)

  const [newCatName, setNewCatName] = useState('')
  const [creatingCat, setCreatingCat] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editor, setEditor] = useState<{ productId: string; categoryId: string } | null>(null)
  const [editCat, setEditCat] = useState<AdminCategory | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const cats = await adminApi.getCategories(game.id)
      const productLists = await Promise.all(
        cats.map(c =>
          adminApi
            .getProducts({ category_id: c.id, page_size: 100 })
            .then(r => r.items)
            .catch(() => [] as AdminProductListItem[]),
        ),
      )
      const map: Record<string, AdminProductListItem[]> = {}
      cats.forEach((c, i) => { map[c.id] = productLists[i] })
      setCategories(cats)
      setProductsByCat(map)
      // Первая категория раскрыта по умолчанию
      setExpanded(cats.length > 0 ? new Set([cats[0].id]) : new Set())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [game.id])

  useEffect(() => { load() }, [load])

  const toggleExpanded = (catId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  const updateCatProducts = (catId: string, updater: (prev: AdminProductListItem[]) => AdminProductListItem[]) => {
    setProductsByCat(prev => ({ ...prev, [catId]: updater(prev[catId] ?? []) }))
  }

  // Точечная перезагрузка товаров одной категории (без полного reload воркспейса)
  const reloadCategory = useCallback(async (catId: string) => {
    try {
      const r = await adminApi.getProducts({ category_id: catId, page_size: 100 })
      setProductsByCat(prev => ({ ...prev, [catId]: r.items }))
    } catch { /* тихо — данные останутся прежними */ }
  }, [])

  // Drag-порядок категорий (подразделов)
  const catSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  )
  const catSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCatDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setCategories((prev) => {
      const oldIndex = prev.findIndex((c) => c.id === active.id)
      const newIndex = prev.findIndex((c) => c.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      const reordered = arrayMove(prev, oldIndex, newIndex)
      if (catSaveTimeout.current) clearTimeout(catSaveTimeout.current)
      catSaveTimeout.current = setTimeout(async () => {
        try {
          await adminApi.reorderCategories(reordered.map((c, i) => ({ id: c.id, sort_order: i })))
        } catch {
          toast.error('Не удалось сохранить порядок')
        }
      }, 600)
      return reordered
    })
  }

  const handleToggleFeatured = async (cat: AdminCategory) => {
    try {
      const updated = await adminApi.updateCategory(cat.id, { is_featured: !cat.is_featured })
      setCategories(prev => prev.map(c => c.id === cat.id ? updated : c))
    } catch {
      toast.error('Не удалось обновить')
    }
  }

  const handleRenameCategory = async (cat: AdminCategory, name: string) => {
    const updated = await adminApi.updateCategory(cat.id, { name })
    setCategories(prev => prev.map(c => c.id === cat.id ? updated : c))
  }

  const handleDeleteCategory = async (cat: AdminCategory) => {
    if (!window.confirm(`Удалить категорию "${cat.name}"? Это действие нельзя отменить.`)) return
    try {
      await adminApi.deleteCategory(cat.id)
      setCategories(prev => prev.filter(c => c.id !== cat.id))
      setProductsByCat(prev => {
        const next = { ...prev }
        delete next[cat.id]
        return next
      })
      toast.success('Категория удалена')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Не удалось удалить категорию')
    }
  }

  const handleCreateCategory = async () => {
    const name = newCatName.trim()
    if (!name) return
    setCreatingCat(true)
    try {
      const created = await adminApi.createCategory({ game_id: game.id, name })
      setCategories(prev => [...prev, created])
      setProductsByCat(prev => ({ ...prev, [created.id]: [] }))
      setExpanded(prev => new Set(prev).add(created.id))
      setNewCatName('')
    } catch {
      toast.error('Не удалось создать категорию')
    } finally {
      setCreatingCat(false)
    }
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header + breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] active:scale-[0.95] transition-all shrink-0"
          >
            <ArrowLeft size={18} className="text-white/60" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-white/60 truncate">Каталог</div>
            <h1 className="text-lg font-bold text-white leading-tight truncate">{game.name}</h1>
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] active:scale-[0.97] text-xs font-medium text-white/60 transition-all shrink-0"
            title="Импорт CSV из ggsel"
          >
            <Upload size={14} />
            Импорт CSV
          </button>
        </div>

        {loading ? (
          <p className="text-white/40 text-sm py-8 text-center">Загрузка...</p>
        ) : error ? (
          <div className="flex flex-col items-center py-16 gap-3 text-white/40">
            <AlertCircle size={36} />
            <p className="text-sm">Ошибка загрузки каталога</p>
            <button onClick={load} className="text-xs text-white/50 hover:text-white/70 active:scale-[0.98] transition-transform">Попробовать снова</button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {categories.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-3 text-white/30">
                <FolderOpen size={36} />
                <p className="text-sm">Категорий пока нет</p>
              </div>
            ) : (
              <DndContext sensors={catSensors} collisionDetection={closestCenter} onDragEnd={handleCatDragEnd}>
                <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                  {categories.map((cat) => (
                    <SortableRow key={cat.id} id={cat.id} style={{ paddingLeft: 26, marginBottom: 10 }}>
                      <CategorySection
                        category={cat}
                        products={productsByCat[cat.id] ?? []}
                        expanded={expanded.has(cat.id)}
                        onToggleExpanded={() => toggleExpanded(cat.id)}
                        onProductsChange={(updater) => updateCatProducts(cat.id, updater)}
                        onToggleFeatured={() => handleToggleFeatured(cat)}
                        onDeleteCategory={() => handleDeleteCategory(cat)}
                        onRename={(name) => handleRenameCategory(cat, name)}
                        onOpenBulkPrice={() => setBulkPriceCat(cat.id)}
                        onEditProduct={(productId) => setEditor({ productId, categoryId: cat.id })}
                        onReloadCategory={() => reloadCategory(cat.id)}
                        onEditCategory={() => setEditCat(cat)}
                      />
                    </SortableRow>
                  ))}
                </SortableContext>
              </DndContext>
            )}

            {/* Создание категории */}
            <div className="flex items-center gap-2 rounded-2xl border border-dashed border-white/[0.15] bg-white/[0.02] px-3 py-2.5">
              <FolderOpen size={16} className="text-white/30 shrink-0" />
              <input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory() } }}
                placeholder="Новая категория"
                className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={!newCatName.trim() || creatingCat}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed text-xs font-semibold text-white/70 transition-all active:scale-[0.97]"
              >
                {creatingCat ? '…' : 'Добавить'}
              </button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {bulkPriceCat && (
          <BulkPriceModal
            categoryId={bulkPriceCat}
            onClose={() => setBulkPriceCat(null)}
            onApplied={load}
          />
        )}
      </AnimatePresence>

      {showImport && (
        <GgselImportModal
          gameId={game.id}
          gameName={game.name}
          onClose={() => setShowImport(false)}
          onDone={load}
        />
      )}

      {editor && (
        <ProductEditModal
          productId={editor.productId}
          categoryId={editor.categoryId}
          onClose={() => setEditor(null)}
          onSaved={(updated) => {
            reloadCategory(editor.categoryId)
            if (updated.category_id !== editor.categoryId) reloadCategory(updated.category_id)
          }}
        />
      )}

      {editCat && (
        <CategoryEditModal
          category={editCat}
          onClose={() => setEditCat(null)}
          onSaved={(updated) => setCategories(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))}
        />
      )}
    </>
  )
}

// ── Главный компонент ─────────────────────────────────────────────────────────

export default function CatalogPage() {
  const [step, setStep] = useState<Step>('games')
  const [selectedGame, setSelectedGame] = useState<AdminGame | null>(null)

  const handleSelectGame = (game: AdminGame) => {
    setSelectedGame(game)
    setStep('workspace')
  }

  const handleBackToGames = () => {
    setSelectedGame(null)
    setStep('games')
  }

  return (
    <>
      {step === 'games' && (
        <GamesLevel onSelect={handleSelectGame} />
      )}

      {step === 'workspace' && selectedGame && (
        <GameWorkspaceLevel
          game={selectedGame}
          onBack={handleBackToGames}
        />
      )}
    </>
  )
}
