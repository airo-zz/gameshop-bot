/**
 * src/pages/admin/catalog/CategorySection.tsx
 * Раздел игры в воркспейсе (аккордеон): товары раздела, сортировка, копирование, удаление, массовые цены.
 * Часть страницы «Каталог» (pages/admin/CatalogPage.tsx).
 */

import { useState, useRef } from 'react'
import { FolderOpen, ChevronRight, ChevronDown, Trash2, Pencil, PercentSquare, X, Copy, Pin, Check, Settings, Zap } from '@/components/ui/icons'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { adminApi } from '@/api/admin'
import { type AdminCategory, type AdminProductListItem } from '@/api/admin'
import SortableRow from '@/components/admin/SortableRow'
import toast from 'react-hot-toast'
import { QuickAddRow } from './QuickAddRow'
import { formatMoney } from './helpers'

export interface CategorySectionProps {
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
  onOpenFazer: () => void
}

export function CategorySection({
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
  onOpenFazer,
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
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg2)] overflow-hidden">
      {/* Заголовок категории */}
      <div className="flex items-center gap-2 px-3 py-3">
        {editing ? (
          <>
            <FolderOpen size={16} className="text-[var(--hint)] shrink-0" />
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); saveRename() }
                if (e.key === 'Escape') { setEditing(false); setDraftName(category.name) }
              }}
              maxLength={128}
              className="flex-1 min-w-0 bg-[var(--bg2)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
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
              className="shrink-0 p-1.5 rounded-lg text-[var(--hint)] bg-[var(--bg2)] border border-[var(--border)] hover:text-[var(--text-2)] transition-all"
              title="Отмена"
            >
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onToggleExpanded}
              className="flex items-center gap-2 flex-1 min-w-0 text-left active:scale-[0.97] transition-transform"
            >
              {expanded
                ? <ChevronDown size={16} className="text-[var(--hint)] shrink-0" />
                : <ChevronRight size={16} className="text-[var(--hint)] shrink-0" />}
              <FolderOpen size={16} className="text-[var(--hint)] shrink-0" />
              <span className="text-sm font-medium text-[var(--text)] truncate">{category.name}</span>
              <span className="text-xs text-[var(--hint)] shrink-0">{products.length}</span>
              {!category.is_active && (
                <span className="text-xs text-[var(--hint)] shrink-0">· скрыта</span>
              )}
              {category.is_featured && (
                <span className="text-xs text-amber-400 shrink-0">· на главной</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setDraftName(category.name); setEditing(true) }}
              className="shrink-0 p-1.5 rounded-lg text-[var(--hint)] bg-[var(--bg2)] border border-[var(--border)] hover:text-[var(--text-2)] transition-all"
              title="Переименовать"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={onEditCategory}
              className="shrink-0 p-1.5 rounded-lg text-[var(--hint)] bg-[var(--bg2)] border border-[var(--border)] hover:text-[var(--text-2)] transition-all"
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
                  : 'text-[var(--hint)] bg-[var(--bg2)] border border-[var(--border)] hover:text-[var(--hint)]'
              }`}
              title={category.is_featured ? 'Убрать с главной' : 'Закрепить на главной'}
            >
              <Pin size={13} className={category.is_featured ? 'fill-amber-400' : ''} />
            </button>
            <button
              type="button"
              onClick={onOpenFazer}
              className="shrink-0 p-1.5 rounded-lg text-[var(--hint)] bg-[var(--bg2)] border border-[var(--border)] hover:text-[var(--link)] transition-all"
              title="Добавить товары из FazerCards (автовыдача)"
            >
              <Zap size={13} />
            </button>
            <button
              type="button"
              onClick={onOpenBulkPrice}
              className="shrink-0 p-1.5 rounded-lg text-[var(--hint)] bg-[var(--bg2)] border border-[var(--border)] hover:text-[var(--text-2)] transition-all"
              title="Изменить цены в категории"
            >
              <PercentSquare size={13} />
            </button>
            <button
              type="button"
              onClick={onDeleteCategory}
              className="shrink-0 p-1.5 rounded-lg text-[var(--hint)] bg-[var(--bg2)] border border-[var(--border)] hover:text-red-400 hover:border-red-400/30 transition-all"
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
                      <div className="flex items-center gap-2 border rounded-xl px-2.5 py-2 bg-[var(--bg2)] border-[var(--border)]">
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => onEditProduct(product.id)}
                        >
                          <div className="text-sm text-[var(--text)] truncate">{product.name}</div>
                          <div className="text-xs text-[var(--hint)] flex items-center gap-1.5 min-w-0">
                            {product.meta?.fazer ? (
                              <span
                                className="inline-flex items-center gap-0.5 text-[var(--link)] shrink-0"
                                title={`FazerCards: ${product.meta.fazer.category_name ?? ''} ${(product.meta.fazer.offer_names ?? []).join(' + ')}`}
                              >
                                <Zap size={11} /> FazerCards
                              </span>
                            ) : (
                              <span>{product.delivery_type}</span>
                            )}
                            {product.stock !== null && <span>· склад: {product.stock}</span>}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-[var(--text)] shrink-0 mr-0.5">
                          {formatMoney(product.price)}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(product)}
                          disabled={togglingId === product.id}
                          className={`shrink-0 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all active:scale-[0.97] disabled:opacity-40 ${
                            product.is_active
                              ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25'
                              : 'text-[var(--hint)] bg-[var(--bg2)] border-[var(--border)]'
                          }`}
                          title={product.is_active ? 'Скрыть с витрины' : 'Показать на витрине'}
                        >
                          {product.is_active ? 'Активен' : 'Скрыт'}
                        </button>
                        <button
                          onClick={() => handleDuplicate(product.id)}
                          className="shrink-0 p-1.5 rounded-lg bg-[var(--bg2)] hover:bg-[var(--bg3)] text-[var(--hint)] hover:text-[var(--text-2)] active:scale-[0.97] transition-all"
                          title="Дублировать"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          onClick={() => onEditProduct(product.id)}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-[var(--bg3)] active:scale-[0.97] transition-all"
                          title="Редактировать"
                        >
                          <Pencil size={14} className="text-[var(--hint)]" />
                        </button>
                        <button
                          onClick={() => handleDelete(product.id, product.name)}
                          disabled={deletingId === product.id}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-red-500/20 active:scale-[0.97] transition-all disabled:opacity-40"
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
