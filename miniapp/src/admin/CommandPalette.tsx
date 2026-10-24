/**
 * src/admin/CommandPalette.tsx — общий поиск админки (Ctrl+K / ⌘K):
 * заказ по номеру, покупатель по @нику / почте / ID, товар, игра, разделы админки.
 * Основа — библиотека cmdk (клавиатурная навигация, доступность).
 */

import { useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Loader2, Search } from '@/components/ui/icons'
import { adminWorkspaceApi } from '@/api/admin'

export interface PaletteNavItem {
  to: string
  label: string
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const ORDER_STATUS: Record<string, string> = {
  new: 'новый', pending_payment: 'ждёт оплаты', paid: 'оплачен', processing: 'в работе',
  clarification: 'уточнение', completed: 'выполнен', cancelled: 'отменён', refunded: 'возврат',
}

const groupCls = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-[var(--hint)]'
const itemCls = 'flex items-center gap-3 px-3 h-11 rounded-xl text-sm text-[var(--text-2)] cursor-pointer data-[selected=true]:bg-[var(--bg3)] data-[selected=true]:text-[var(--text)]'

export default function CommandPalette({ open, onOpenChange, nav }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  nav: PaletteNavItem[]
}) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim(), 250)
  const { data, isFetching } = useQuery({
    queryKey: ['admin', 'search', dq],
    queryFn: () => adminWorkspaceApi.search(dq),
    enabled: open && dq.length >= 2,
    staleTime: 30_000,
  })

  useEffect(() => { if (!open) setQ('') }, [open])

  const go = (to: string) => { onOpenChange(false); navigate(to) }
  const navMatches = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? nav.filter((n) => n.label.toLowerCase().includes(s)) : nav
  }, [q, nav])
  const empty = dq.length >= 2 && !isFetching && data &&
    !data.orders.length && !data.users.length && !data.products.length && !data.games.length && !navMatches.length

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      shouldFilter={false}
      label="Поиск по админке"
      overlayClassName="fixed inset-0 bg-black/60"
      // z-index — в index.css по атрибутам [cmdk-overlay]/[cmdk-dialog] (Tailwind z-[N] в WebView ненадёжен)
      contentClassName="fixed left-1/2 top-[12vh] -translate-x-1/2 w-[min(640px,calc(100vw-24px))] rounded-2xl bg-[var(--bg2)] shadow-2xl overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 border-b border-[var(--border)]">
        {isFetching ? <Loader2 size={18} className="animate-spin text-[var(--hint)]" /> : <Search size={18} className="text-[var(--hint)]" />}
        <Command.Input
          value={q}
          onValueChange={setQ}
          placeholder="Заказ, покупатель, товар или раздел…"
          className="flex-1 h-14 bg-transparent text-[15px] text-[var(--text)] placeholder:text-[var(--hint)] outline-none"
        />
        <kbd className="hidden md:inline text-[11px] text-[var(--hint)] border border-[var(--border)] rounded-md px-1.5 py-0.5">Esc</kbd>
      </div>
      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        {empty && <Command.Empty className="py-8 text-center text-sm text-[var(--hint)]">Ничего не нашли</Command.Empty>}
        {dq.length < 2 && !q && (
          <p className="px-3 pt-2 pb-1 text-xs text-[var(--hint)]">Номер заказа, @ник, почта или Telegram ID покупателя, название товара</p>
        )}

        {data && data.orders.length > 0 && (
          <Command.Group heading="Заказы" className={groupCls}>
            {data.orders.map((o) => (
              <Command.Item key={o.id} value={`o-${o.id}`} onSelect={() => go(`/admin/orders/${o.id}`)} className={itemCls}>
                <span className="font-medium text-[var(--text)] num">{o.order_number}</span>
                <span className="truncate">{o.user ?? ''}</span>
                <span className="ml-auto text-xs text-[var(--hint)] whitespace-nowrap">{ORDER_STATUS[o.status] ?? o.status} · {Math.round(o.total).toLocaleString('ru-RU')} ₽</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {data && data.users.length > 0 && (
          <Command.Group heading="Покупатели" className={groupCls}>
            {data.users.map((u) => (
              <Command.Item key={u.id} value={`u-${u.id}`} onSelect={() => go(`/admin/users/${u.id}`)} className={itemCls}>
                <span className="font-medium text-[var(--text)] truncate">{u.name}</span>
                <span className="truncate text-xs">{u.email ?? (u.telegram_id > 0 ? `ID ${u.telegram_id}` : '')}</span>
                <span className="ml-auto text-xs text-[var(--hint)] whitespace-nowrap">заказов: {u.orders_count}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {data && data.products.length > 0 && (
          <Command.Group heading="Товары" className={groupCls}>
            {data.products.map((p) => (
              <Command.Item key={p.id} value={`p-${p.id}`} onSelect={() => go(`/admin/catalog/products/${p.id}`)} className={itemCls}>
                <span className="text-[var(--text)] truncate">{p.name}</span>
                <span className="truncate text-xs">{p.game}</span>
                <span className="ml-auto text-xs text-[var(--hint)] whitespace-nowrap">{p.is_active ? `${Math.round(p.price).toLocaleString('ru-RU')} ₽` : 'скрыт'}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {data && data.games.length > 0 && (
          <Command.Group heading="Игры" className={groupCls}>
            {data.games.map((g) => (
              <Command.Item key={g.id} value={`g-${g.id}`} onSelect={() => go(`/admin/catalog/games/${g.id}`)} className={itemCls}>
                <span className="text-[var(--text)]">{g.name}</span>
                {!g.is_active && <span className="ml-auto text-xs text-[var(--hint)]">скрыта</span>}
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {navMatches.length > 0 && (
          <Command.Group heading="Разделы" className={groupCls}>
            {navMatches.map((n) => (
              <Command.Item key={n.to} value={`n-${n.to}`} onSelect={() => go(n.to)} className={itemCls}>
                {n.label}
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  )
}
