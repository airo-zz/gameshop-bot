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

import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Tag,
  ChevronRight,
} from 'lucide-react'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { to: '/admin',           label: 'Dashboard',  icon: <LayoutDashboard size={22} /> },
  { to: '/admin/orders',    label: 'Заказы',      icon: <ShoppingCart size={22} /> },
  { to: '/admin/catalog',   label: 'Каталог',     icon: <Package size={22} /> },
  { to: '/admin/users',     label: 'Пользователи', icon: <Users size={22} /> },
  { to: '/admin/discounts', label: 'Скидки',      icon: <Tag size={22} /> },
]

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/admin'}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
          'hover:bg-white/5',
          isActive
            ? 'bg-blue-600/20 text-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.15)]'
            : 'text-white/60 hover:text-white/90',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? 'text-blue-400' : 'text-white/40'}>{item.icon}</span>
          <span className="flex-1">{item.label}</span>
          {isActive && <ChevronRight size={14} className="text-blue-400/60" />}
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
          'flex flex-col items-center gap-1.5 py-3 px-3 rounded-xl text-xs transition-all duration-200 flex-1 min-h-[56px] justify-center',
          isActive
            ? 'text-blue-400'
            : 'text-white/40 hover:text-white/60',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? 'text-blue-400' : 'text-white/40'}>{item.icon}</span>
          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

export default function AdminLayout() {
  const location = useLocation()

  return (
    <div className="flex min-h-screen bg-[#060f1e] text-white"
         style={{ paddingTop: 'calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px))' }}>
      {/* Sidebar — hidden on mobile */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-white/5 p-4 gap-1">
        <div className="px-3 py-3 mb-2">
          <span className="text-xs font-semibold text-white/30 uppercase tracking-widest">
            Admin Panel
          </span>
        </div>
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <header className="flex items-center h-14 px-4 border-b border-white/5 shrink-0">
          <NavLink to="/" className="text-xs text-white/40 hover:text-white/70 transition-colors mr-3">
            ← Магазин
          </NavLink>
          <span className="text-sm font-semibold text-white/70">
            Admin
          </span>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto md:pb-4" style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="p-4 md:p-6 max-w-6xl mx-auto"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>

      {/* Bottom nav — mobile only */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center bg-[#060f1e]/95 backdrop-blur-md border-t border-white/5 px-1"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {NAV_ITEMS.map((item) => (
          <BottomNavLink key={item.to} item={item} />
        ))}
      </nav>
    </div>
  )
}
