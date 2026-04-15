/**
 * src/pages/admin/CatalogPage.tsx
 * Трёхуровневая навигация каталога: Игры → Категории → Товары.
 * Реализована как state-машина внутри одного компонента.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  AlertCircle,
  Package,
  Gamepad2,
  FolderOpen,
  ChevronRight,
  ArrowLeft,
  Trash2,
  Pencil,
  ImageOff,
  PercentSquare,
  X,
  Copy,
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
import toast from 'react-hot-toast'

type Step = 'games' | 'categories' | 'products'

function formatMoney(v: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(v)
}

const inputCls = 'w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-all duration-200'

// ── Модалка массового изменения цен ──────────────────────────────────────────

interface BulkPriceModalProps {
  categoryId: string
  onClose: () => void
  onApplied: () => void
}

function BulkPriceModal({ categoryId, onClose, onApplied }: BulkPriceModalProps) {
  const [mode, setMode] = useState<'percent' | 'fixed'>('percent')
  const [value, setValue] = useState('')
  const [includeLots, setIncludeLots] = useState(true)
  const [loading, setLoading] = useState(false)

  const handleApply = async () => {
    const numVal = parseFloat(value)
    if (isNaN(numVal) || numVal < 0) {
      toast.error('Введите корректное значение')
      return
    }
    setLoading(true)
    try {
      const res = await adminApi.bulkPriceUpdate({
        mode,
        value: numVal,
        scope: 'category',
        category_id: categoryId,
        include_lots: includeLots,
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
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ duration: 0.22 }}
        className="w-full max-w-lg bg-[#0a1628] border border-white/[0.1] rounded-t-2xl p-5 space-y-4"
      >
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
            min="0"
            step={mode === 'percent' ? '1' : '0.01'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={mode === 'percent' ? 'Например: 10' : 'Например: 299'}
            className={inputCls}
          />
          {mode === 'percent' && value && !isNaN(parseFloat(value)) && (
            <p className="text-xs text-white/40 mt-1">
              Цена будет умножена на коэффициент {(1 + parseFloat(value) / 100).toFixed(4)}
            </p>
          )}
        </div>

        {/* Включая лоты */}
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setIncludeLots((v) => !v)}
            className={[
              'w-10 h-6 rounded-full transition-colors flex items-center px-0.5',
              includeLots ? 'bg-blue-600' : 'bg-white/10',
            ].join(' ')}
          >
            <div
              className={[
                'w-5 h-5 rounded-full bg-white shadow transition-transform',
                includeLots ? 'translate-x-4' : 'translate-x-0',
              ].join(' ')}
            />
          </div>
          <span className="text-sm text-white/70">Включая лоты</span>
        </label>

        <button
          onClick={handleApply}
          disabled={loading || !value}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white transition-all duration-200 active:scale-[0.98]"
        >
          {loading ? 'Применяем...' : 'Применить'}
        </button>
      </motion.div>
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
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[72px] rounded-xl bg-white/[0.04] border border-white/[0.08] animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/40">
          <AlertCircle size={36} />
          <p className="text-sm">Ошибка загрузки игр</p>
          <button onClick={load} className="text-xs text-blue-400 active:scale-[0.98] transition-transform">Попробовать снова</button>
        </div>
      ) : games.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/30">
          <Gamepad2 size={36} />
          <p className="text-sm">Игр пока нет</p>
        </div>
      ) : (
        <div className="space-y-2">
          {games.map((game, i) => (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              onClick={() => onSelect(game)}
              className="flex items-center gap-3 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] rounded-2xl px-4 py-3.5 transition-all duration-200 cursor-pointer active:scale-[0.99]"
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
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Уровень 2: Категории ──────────────────────────────────────────────────────

interface CategoriesLevelProps {
  game: AdminGame
  onBack: () => void
  onSelect: (category: AdminCategory) => void
}

function CategoriesLevel({ game, onBack, onSelect }: CategoriesLevelProps) {
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    adminApi
      .getCategories(game.id)
      .then(setCategories)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [game.id])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      {/* Header + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] active:scale-[0.95] transition-all shrink-0"
        >
          <ArrowLeft size={18} className="text-white/60" />
        </button>
        <div className="min-w-0">
          <div className="text-xs text-white/60 truncate">Каталог / {game.name}</div>
          <h1 className="text-lg font-bold text-white leading-tight">Категории</h1>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-white/[0.04] border border-white/[0.08] animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/40">
          <AlertCircle size={36} />
          <p className="text-sm">Ошибка загрузки категорий</p>
          <button onClick={load} className="text-xs text-blue-400 active:scale-[0.98] transition-transform">Попробовать снова</button>
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-white/30">
          <FolderOpen size={36} />
          <p className="text-sm">Категорий пока нет</p>
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              onClick={() => onSelect(cat)}
              className="flex items-center gap-3 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] rounded-2xl px-4 py-3.5 transition-all duration-200 cursor-pointer active:scale-[0.99]"
            >
              <FolderOpen size={18} className="text-white/40 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{cat.name}</div>
                <div className="text-xs text-white/50">
                  <span className={cat.is_active ? 'text-emerald-400' : 'text-white/30'}>
                    {cat.is_active ? 'Активна' : 'Неактивна'}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Уровень 3: Товары ─────────────────────────────────────────────────────────

interface ProductsLevelProps {
  game: AdminGame
  category: AdminCategory
  onBack: () => void
}

function ProductsLevel({ game, category, onBack }: ProductsLevelProps) {
  const navigate = useNavigate()
  const [products, setProducts] = useState<AdminProductListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showBulkPrice, setShowBulkPrice] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  )

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    adminApi
      .getProducts({ category_id: category.id, page_size: 100 })
      .then((r) => setProducts(r.items))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [category.id])

  useEffect(() => { load() }, [load])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    if (selectMode) return

    setProducts(prev => {
      const oldIndex = prev.findIndex(p => p.id === active.id)
      const newIndex = prev.findIndex(p => p.id === over.id)
      const reordered = arrayMove(prev, oldIndex, newIndex)

      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveTimeout.current = setTimeout(async () => {
        try {
          await adminApi.reorderProducts(
            reordered.map((p, i) => ({ id: p.id, sort_order: i }))
          )
        } catch {
          toast.error('Не удалось сохранить порядок')
          load()
        }
      }, 600)

      return reordered
    })
  }

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Удалить товар "${name}"?`)) return
    setDeletingId(id)
    try {
      await adminApi.deleteProduct(id)
      setProducts((prev) => prev.filter((p) => p.id !== id))
      toast.success('Товар удалён')
    } catch {
      toast.error('Не удалось удалить товар')
    } finally {
      setDeletingId(null)
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkActivate() {
    await Promise.all([...selectedIds].map(id => adminApi.updateProduct(id, { is_active: true })))
    toast.success(`Активировано: ${selectedIds.size}`)
    setSelectedIds(new Set())
    load()
  }

  async function handleBulkDeactivate() {
    await Promise.all([...selectedIds].map(id => adminApi.updateProduct(id, { is_active: false })))
    toast.success(`Деактивировано: ${selectedIds.size}`)
    setSelectedIds(new Set())
    load()
  }

  async function handleBulkDelete() {
    if (!window.confirm(`Удалить ${selectedIds.size} товаров?`)) return
    await Promise.all([...selectedIds].map(id => adminApi.deleteProduct(id)))
    toast.success(`Удалено: ${selectedIds.size}`)
    setSelectedIds(new Set())
    setSelectMode(false)
    load()
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header + breadcrumb */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] active:scale-[0.95] transition-all shrink-0"
            >
              <ArrowLeft size={18} className="text-white/60" />
            </button>
            <div className="min-w-0">
              <div className="text-xs text-white/60 truncate">
                {game.name} / {category.name}
              </div>
              <h1 className="text-lg font-bold text-white leading-tight">Товары</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {selectMode ? (
              <button
                onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }}
                className="px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] active:scale-[0.97] text-xs font-medium text-white/60 transition-all duration-200"
              >
                Отмена
              </button>
            ) : (
              <>
                <button
                  onClick={() => setSelectMode(true)}
                  className="px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] active:scale-[0.97] text-xs font-medium text-white/60 transition-all duration-200"
                >
                  Выбрать
                </button>
                <button
                  onClick={() => setShowBulkPrice(true)}
                  title="Изменить цены"
                  className="p-2 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] active:scale-[0.95] transition-all duration-200"
                >
                  <PercentSquare size={18} className="text-white/60" />
                </button>
                <button
                  onClick={() => navigate(`/admin/catalog/products/new?category_id=${category.id}`)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-xs font-semibold text-white transition-all duration-200"
                >
                  <Plus size={15} />
                  Добавить
                </button>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-white/[0.04] border border-white/[0.08] animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center py-16 gap-3 text-white/40">
            <AlertCircle size={36} />
            <p className="text-sm">Ошибка загрузки товаров</p>
            <button onClick={load} className="text-xs text-blue-400 active:scale-[0.98] transition-transform">Попробовать снова</button>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-white/30">
            <Package size={36} />
            <p className="text-sm">Товаров в этой категории нет</p>
            <button
              onClick={() => navigate(`/admin/catalog/products/new?category_id=${category.id}`)}
              className="text-xs text-blue-400 active:scale-[0.98] transition-transform"
            >
              Добавить первый товар
            </button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={products.map(p => p.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {products.map((product, i) => (
                  <SortableRow
                    key={product.id}
                    id={product.id}
                    disabled={selectMode}
                    style={{ paddingLeft: selectMode ? 0 : 28 }}
                  >
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.03 }}
                      className={[
                        'flex items-center gap-3 border rounded-xl px-3 py-3 transition-all duration-200',
                        selectedIds.has(product.id)
                          ? 'bg-blue-600/10 border-blue-500/30'
                          : 'bg-white/[0.04] border-white/[0.08]',
                      ].join(' ')}
                    >
                      {selectMode && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(product.id)}
                          onChange={() => toggleSelect(product.id)}
                          className="w-4 h-4 rounded accent-blue-500 shrink-0 cursor-pointer"
                        />
                      )}
                      <div className="w-10 h-10 rounded-lg bg-white/[0.05] flex items-center justify-center shrink-0">
                        <Package size={18} className="text-white/20" />
                      </div>
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => selectMode ? toggleSelect(product.id) : navigate(`/admin/catalog/products/${product.id}`)}
                      >
                        <div className="text-sm font-medium text-white truncate">{product.name}</div>
                        <div className="text-xs text-white/40">
                          {product.delivery_type}
                          {product.stock !== null && ` · склад: ${product.stock}`}
                          {' · '}
                          <span className={product.is_active ? 'text-emerald-400' : 'text-white/30'}>
                            {product.is_active ? 'Активен' : 'Неактивен'}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-white shrink-0 mr-1">
                        {formatMoney(product.price)}
                      </div>
                      {!selectMode && (
                        <>
                          <button
                            onClick={async (e) => {
                              e.preventDefault()
                              try {
                                const copy = await adminApi.copyProduct(product.id)
                                toast.success('Товар скопирован')
                                navigate(`/admin/catalog/products/${copy.id}`)
                              } catch {
                                toast.error('Ошибка копирования')
                              }
                            }}
                            className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/40 hover:text-white/80 active:scale-[0.9] transition-all duration-200"
                            title="Дублировать"
                          >
                            <Copy size={15} />
                          </button>
                          <button
                            onClick={() => navigate(`/admin/catalog/products/${product.id}`)}
                            className="p-1.5 rounded-lg hover:bg-white/[0.08] active:scale-[0.9] transition-all duration-200"
                            title="Редактировать"
                          >
                            <Pencil size={15} className="text-white/40" />
                          </button>
                          <button
                            onClick={() => handleDelete(product.id, product.name)}
                            disabled={deletingId === product.id}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 active:scale-[0.9] transition-all duration-200 disabled:opacity-40"
                            title="Удалить"
                          >
                            <Trash2 size={15} className="text-red-400/70" />
                          </button>
                        </>
                      )}
                    </motion.div>
                  </SortableRow>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <AnimatePresence>
        {showBulkPrice && (
          <BulkPriceModal
            categoryId={category.id}
            onClose={() => setShowBulkPrice(false)}
            onApplied={load}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectMode && selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            className="fixed bottom-[72px] left-0 right-0 z-40 bg-[#0d1a2e] border-t border-white/[0.1] px-4 py-3 flex items-center gap-3"
          >
            <span className="text-xs text-white/50 flex-1">Выбрано: {selectedIds.size}</span>
            <button
              onClick={handleBulkActivate}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 active:scale-[0.97] transition-all duration-200"
            >
              Активировать
            </button>
            <button
              onClick={handleBulkDeactivate}
              className="px-3 py-1.5 rounded-lg bg-white/[0.05] text-white/60 text-xs font-medium hover:bg-white/[0.1] active:scale-[0.97] transition-all duration-200"
            >
              Деактивировать
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 active:scale-[0.97] transition-all duration-200"
            >
              Удалить
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ── Главный компонент ─────────────────────────────────────────────────────────

export default function CatalogPage() {
  const [step, setStep] = useState<Step>('games')
  const [selectedGame, setSelectedGame] = useState<AdminGame | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<AdminCategory | null>(null)

  const handleSelectGame = (game: AdminGame) => {
    setSelectedGame(game)
    setStep('categories')
  }

  const handleSelectCategory = (category: AdminCategory) => {
    setSelectedCategory(category)
    setStep('products')
  }

  const handleBackToGames = () => {
    setSelectedGame(null)
    setSelectedCategory(null)
    setStep('games')
  }

  const handleBackToCategories = () => {
    setSelectedCategory(null)
    setStep('categories')
  }

  return (
    <AnimatePresence mode="wait">
      {step === 'games' && (
        <motion.div
          key="games"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.18 }}
        >
          <GamesLevel onSelect={handleSelectGame} />
        </motion.div>
      )}

      {step === 'categories' && selectedGame && (
        <motion.div
          key="categories"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.18 }}
        >
          <CategoriesLevel
            game={selectedGame}
            onBack={handleBackToGames}
            onSelect={handleSelectCategory}
          />
        </motion.div>
      )}

      {step === 'products' && selectedGame && selectedCategory && (
        <motion.div
          key="products"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.18 }}
        >
          <ProductsLevel
            game={selectedGame}
            category={selectedCategory}
            onBack={handleBackToCategories}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
