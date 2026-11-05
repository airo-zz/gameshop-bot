/**
 * src/pages/admin/catalog/GameWorkspaceLevel.tsx
 * Уровень 2 каталога — воркспейс одной игры: все её разделы и товары на одном экране, импорт GGSEL и FazerCards.
 * Часть страницы «Каталог» (pages/admin/CatalogPage.tsx).
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { AlertCircle, FolderOpen, ArrowLeft, Upload } from '@/components/ui/icons'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { adminApi } from '@/api/admin'
import { type AdminGame, type AdminCategory, type AdminProductListItem } from '@/api/admin'
import SortableRow from '@/components/admin/SortableRow'
import GgselImportModal from '@/pages/admin/GgselImportModal'
import ProductEditModal from '@/pages/admin/ProductEditModal'
import CategoryEditModal from '@/pages/admin/CategoryEditModal'
import FazerImportModal from '@/pages/admin/FazerImportModal'
import toast from 'react-hot-toast'
import { BulkPriceModal } from './BulkPriceModal'
import { CategorySection } from './CategorySection'

export interface GameWorkspaceLevelProps {
  game: AdminGame
  onBack: () => void
}

export function GameWorkspaceLevel({ game, onBack }: GameWorkspaceLevelProps) {
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
  const [fazerCat, setFazerCat] = useState<AdminCategory | null>(null)

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
            className="p-2 rounded-xl bg-[var(--bg2)] border border-[var(--border)] hover:bg-[var(--bg3)] active:scale-[0.97] transition-all shrink-0"
          >
            <ArrowLeft size={18} className="text-[var(--text-2)]" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-[var(--text-2)] truncate">Каталог</div>
            <h1 className="text-lg font-bold text-[var(--text)] leading-tight truncate">{game.name}</h1>
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg2)] border border-[var(--border)] hover:bg-[var(--bg3)] active:scale-[0.97] text-xs font-medium text-[var(--text-2)] transition-all shrink-0"
            title="Импорт CSV из ggsel"
          >
            <Upload size={14} />
            Импорт CSV
          </button>
        </div>

        {loading ? (
          <p className="text-[var(--hint)] text-sm py-8 text-center">Загрузка...</p>
        ) : error ? (
          <div className="flex flex-col items-center py-16 gap-3 text-[var(--hint)]">
            <AlertCircle size={36} />
            <p className="text-sm">Ошибка загрузки каталога</p>
            <button onClick={load} className="text-xs text-[var(--hint)] hover:text-[var(--text-2)] active:scale-[0.97] transition-transform">Попробовать снова</button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {categories.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-3 text-[var(--hint)]">
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
                        onOpenFazer={() => setFazerCat(cat)}
                      />
                    </SortableRow>
                  ))}
                </SortableContext>
              </DndContext>
            )}

            {/* Создание категории */}
            <div className="flex items-center gap-2 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg2)] px-3 py-2.5">
              <FolderOpen size={16} className="text-[var(--hint)] shrink-0" />
              <input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory() } }}
                placeholder="Новая категория"
                className="flex-1 min-w-0 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={!newCatName.trim() || creatingCat}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--bg3)] hover:bg-[var(--bg3)] border border-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed text-xs font-semibold text-[var(--text-2)] transition-all active:scale-[0.97]"
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

      {fazerCat && (
        <FazerImportModal
          category={fazerCat}
          onClose={() => setFazerCat(null)}
          onDone={() => {
            reloadCategory(fazerCat.id)
            setExpanded(prev => new Set(prev).add(fazerCat.id))
            // поля покупателя категории могли обновиться
            adminApi.getCategories(game.id).then(setCategories).catch(() => undefined)
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
