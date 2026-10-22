/**
 * src/web/pages/WebOrdersPage.tsx
 * Список заказов пользователя на сайте с пагинацией «Показать ещё».
 */

import { Link } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Package, ChevronRight } from '@/components/ui/icons'
import { ordersApi, type Order } from '@/api'
import { money, orderStatus, isAwaitingPayment } from '@/web/format'

const PAGE_SIZE = 20

export default function WebOrdersPage() {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['web', 'orders'],
    queryFn: ({ pageParam }) => ordersApi.list(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last: Order[], all) => (last.length >= PAGE_SIZE ? all.length : undefined),
    staleTime: 30_000,
  })
  const orders = data?.pages.flat() ?? []

  return (
    <div className="web-container py-8 md:py-12 max-w-3xl">
      <h1 className="text-2xl md:text-3xl font-semibold text-[var(--text)] mb-6">Мои заказы</h1>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl animate-pulse bg-[var(--bg2)]" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-[var(--hint)] py-16 text-center">Не удалось загрузить заказы</p>
      ) : orders.length === 0 ? (
        <div className="py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[var(--bg2)] flex items-center justify-center mx-auto mb-5 text-[var(--hint)]">
            <Package size={24} />
          </div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Заказов пока нет</h2>
          <p className="text-sm text-[var(--hint)] mt-2 mb-6">Выберите игру в каталоге — оформление займёт пару минут.</p>
          <Link to="/catalog" className="inline-flex rounded-xl px-5 py-3 text-sm font-semibold text-[var(--text)]" style={{ background: 'var(--gradient-primary)' }}>
            В каталог
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {orders.map((o) => {
            const st = orderStatus(o.status)
            return (
              <Link
                key={o.id}
                to={`/orders/${o.id}`}
                className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg2)] hover:bg-[var(--bg2)] hover:border-[var(--border)] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-[var(--text)]">Заказ {o.order_number}</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--hint)] mt-1">
                    {new Date(o.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                    {o.items_count ? ` · ${o.items_count} поз.` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold" style={{ color: 'var(--link)' }}>{money(o.total_amount)}</p>
                  {isAwaitingPayment(o.status) && <p className="text-[11px] text-amber-300 mt-0.5">Оплатить</p>}
                </div>
                <ChevronRight size={18} className="text-[var(--hint)] shrink-0" />
              </Link>
            )
          })}

          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full py-3 rounded-xl text-sm font-semibold text-[var(--text-2)] border border-[var(--border)] bg-[var(--bg2)] hover:bg-[var(--bg3)] disabled:opacity-50"
            >
              {isFetchingNextPage ? 'Загрузка...' : 'Показать ещё'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
