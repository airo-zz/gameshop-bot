/**
 * src/components/admin/SortableRow.tsx
 * Обёртка для строки с Drag & Drop сортировкой (dnd-kit/sortable).
 * Использование: оберни любой элемент списка в <SortableRow id={item.id}>.
 */

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode, CSSProperties } from 'react'

interface SortableRowProps {
  id: string
  children: ReactNode
  /** Дополнительные стили контейнера */
  style?: CSSProperties
  className?: string
  /** Скрыть handle и отключить drag */
  disabled?: boolean
}

export default function SortableRow({ id, children, style, className, disabled }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })

  const containerStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
    ...style,
  }

  return (
    <div ref={setNodeRef} style={containerStyle} className={className}>
      {/* Drag handle — полоска слева, касание за неё инициирует drag */}
      {!disabled && (
      <button
        {...attributes}
        {...listeners}
        aria-label="Перетащить"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isDragging ? 'grabbing' : 'grab',
          background: 'none',
          border: 'none',
          padding: 0,
          touchAction: 'none',
          color: 'rgba(255,255,255,0.2)',
          zIndex: 1,
        }}
        onMouseEnter={e => { (e.currentTarget).style.color = 'rgba(255,255,255,0.5)' }}
        onMouseLeave={e => { (e.currentTarget).style.color = 'rgba(255,255,255,0.2)' }}
      >
        {/* Grip icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>
      )}
      {children}
    </div>
  )
}
