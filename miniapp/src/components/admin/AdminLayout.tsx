/**
 * src/components/admin/AdminLayout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Shell layout для admin-панели.
 *
 * Содержит:
 *   - Боковая навигация (sidebar) на планшетах/десктопе
 *   - Bottom-nav бар на мобильных
 *   - Outlet для дочерних страниц
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Tag,
  MessageSquare,
} from 'lucide-react'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { to: '/admin',           label: 'Dashboard',    icon: <LayoutDashboard size={22} /> },
  { to: '/admin/orders',    label: 'Заказы',        icon: <ShoppingCart size={22} /> },
  { to: '/admin/catalog',   label: 'Каталог',       icon: <Package size={22} /> },
  { to: '/admin/users',     label: 'Пользователи',  icon: <Users size={22} /> },
  { to: '/admin/discounts', label: 'Скидки',        icon: <Tag size={22} /> },
  { to: '/admin/support',   label: 'Поддержка',     icon: <MessageSquare size={22} /> },
]

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/admin'}
      className={({ isActive }) =>
        [
          'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
          'hover:bg-white/[0.05]',
          isActive
            ? 'bg-blue-600/20 text-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.12)]'
            : 'text-white/55 hover:text-white/85',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-blue-500" />
          )}
          <span className={isActive ? 'text-blue-400' : 'text-white/35'}>{item.icon}</span>
          <span className="flex-1">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

function BottomNavLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/admin'}
      className={({ isActive }) =>
        [
          'relative flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl transition-all duration-200 flex-1 min-h-[52px] justify-center',
          isActive
            ? 'text-blue-400'
            : 'text-white/35 hover:text-white/55',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? 'text-blue-400' : 'text-white/35'}>{item.icon}</span>
          {isActive && (
            <span className="w-1 h-1 rounded-full bg-blue-500" />
          )}
        </>
      )}
    </NavLink>
  )
}

export default function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-[#060f1e] text-white"
         style={{ paddingTop: 'calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px))' }}>
      {/* Sidebar — hidden on mobile */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-white/[0.06] p-4 gap-1">
        <div className="px-3 py-3 mb-2">
          <span className="text-[10px] font-semibold text-white/25 uppercase tracking-[0.15em]">
            Panel
          </span>
        </div>
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <header className="flex items-center h-13 px-4 border-b border-white/[0.06] shrink-0 gap-3">
          <NavLink to="/" className="text-xs text-white/35 hover:text-white/65 transition-colors">
            ← Магазин
          </NavLink>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto md:pb-4" style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}>
          <div className="p-4 md:p-6 max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Bottom nav — mobile only */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center bg-[#060f1e]/96 backdrop-blur-md border-t border-white/[0.06] px-1"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {NAV_ITEMS.map((item) => (
          <BottomNavLink key={item.to} item={item} />
        ))}
      </nav>
    </div>
  )
}
