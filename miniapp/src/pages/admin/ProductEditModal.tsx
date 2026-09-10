/**
 * src/pages/admin/ProductEditModal.tsx
 * Всплывающее окно редактирования товара — переиспользует ProductEditPage
 * в модальном режиме (без навигации). Открывается из воркспейса каталога.
 */

import ProductEditPage from './ProductEditPage'
import type { AdminProductDetail } from '@/api/admin'

interface ProductEditModalProps {
  productId: string
  categoryId?: string
  onClose: () => void
  onSaved: (product: AdminProductDetail) => void
}

export default function ProductEditModal({ productId, categoryId, onClose, onSaved }: ProductEditModalProps) {
  return (
    <div
      className="fixed inset-0 flex justify-center overflow-y-auto bg-black/60 backdrop-blur-sm"
      style={{ zIndex: 200 }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg my-6 mx-4 h-fit rounded-2xl border border-white/[0.1] bg-[#0b1220] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <ProductEditPage
          modalId={productId}
          modalCategoryId={categoryId}
          onClose={onClose}
          onSaved={onSaved}
        />
      </div>
    </div>
  )
}
