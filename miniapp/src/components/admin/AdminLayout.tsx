/**
 * src/components/admin/AdminLayout.tsx
 * Shell layout для admin-панели.
 *
 * Desktop/планшет: боковая sidebar
 * Мобильный: header с кнопкой гамбургер → slide-in drawer
 */

import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Tag,
  MessageSquare,
  MessagesSquare,
  Settings,
  Menu,
  X,
} from 'lucide-react'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { to: '/admin',           label: 'Dashboard',       icon: <LayoutDashboard size={20} /> },
  { to: '/admin/orders',    label: 'Заказы',           icon: <ShoppingCart size={20} /> },
  { to: '/admin/catalog',   label: 'Каталог',          icon: <Package size={20} /> },
  { to: '/admin/users',     label: 'Пользователи',     icon: <Users size={20} /> },
  { to: '/admin/discounts', label: 'Скидки',           icon: <Tag size={20} /> },
  { to: '/admin/support',   label: 'Поддержка',        icon: <MessageSquare size={20} /> },
  { to: '/admin/chats',    label: 'Чаты',             icon: <MessagesSquare size={20} /> },
  { to: '/admin/settings/loyalty', label: 'Настройки', icon: <Settings size={20} /> },
]

function SidebarLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/admin'}
      onClick={onClick}
      className={({ isActive }) =>
        [
          'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
          'hover:bg-white/10',
          isActive
            ? 'bg-white/10 text-white'
            : 'text-white/55 hover:text-white/85',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-white/60" />
          )}
          <span className={isActive ? 'text-white/80' : 'text-white/35'}>{item.icon}</span>
          <span className="flex-1">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

export default function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  // Закрываем drawer при смене маршрута
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  // Блокируем scroll страницы когда drawer открыт
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  return (
    <div
      className="flex min-h-screen bg-[#111827] text-white"
      style={{
        paddingTop: 'calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px))',
      }}
    >
      {/* ── Sidebar (md+) ── */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-white/[0.06] p-4 gap-1">
        <div className="px-3 py-3 mb-2">
          <span className="text-[10px] font-semibold text-white/25 uppercase tracking-[0.15em]">Panel</span>
        </div>
        {NAV_ITEMS.map(item => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </aside>

      {/* ── Mobile Drawer overlay ── */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm"
          style={{ zIndex: 200 }}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Mobile Drawer ── */}
      <div
        className="md:hidden fixed top-0 left-0 bottom-0 flex flex-col bg-[#111827] border-r border-white/[0.06] transition-transform duration-300"
        style={{
          zIndex: 201,
          width: 240,
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          paddingTop: 'calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px) + 56px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
          {NAV_ITEMS.map(item => (
            <SidebarLink key={item.to} item={item} onClick={() => setDrawerOpen(false)} />
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <header className="flex items-center h-14 px-4 border-b border-white/[0.06] shrink-0 gap-3">
          {/* Hamburger — mobile only */}
          <button
            type="button"
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl transition-colors active:scale-95"
            style={{ background: drawerOpen ? 'rgba(255,255,255,0.1)' : 'transparent' }}
            onClick={() => setDrawerOpen(v => !v)}
          >
            {drawerOpen
              ? <X size={20} style={{ color: 'rgba(255,255,255,0.7)' }} />
              : <Menu size={20} style={{ color: 'rgba(255,255,255,0.5)' }} />
            }
          </button>

          <NavLink to="/" className="text-xs text-white/35 hover:text-white/65 transition-colors">
            ← Магазин
          </NavLink>
        </header>

        {/* Page */}
        <main className={location.pathname.startsWith('/admin/chats') ? 'flex-1 overflow-hidden flex flex-col' : 'flex-1 overflow-y-auto'}>
          {location.pathname.startsWith('/admin/chats')
            ? <Outlet />
            : <div className="p-4 md:p-6 max-w-6xl mx-auto pb-8"><Outlet /></div>
          }
        </main>
      </div>
    </div>
  )
}
