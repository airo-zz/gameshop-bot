/**
 * src/components/admin/AdminLayout.tsx
 * Shell layout для admin-панели (графит, как клиентская часть).
 *
 * Desktop/планшет: боковая sidebar с группами разделов
 * Мобильный: header с кнопкой меню → slide-in drawer
 */

import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import type { Icon as PhIcon } from '@phosphor-icons/react'
import {
  ArrowLeftIcon, ChartLineUpIcon, ChatsCircleIcon, CurrencyRubIcon, GearSixIcon, HeadsetIcon,
  LightningIcon, ListIcon, PackageIcon, ReceiptIcon, TagIcon, TextAaIcon, UsersIcon, XIcon,
} from '@phosphor-icons/react'
import logoFull from '@/assets/logo-full.png'

interface NavItem {
  to: string
  label: string
  Icon: PhIcon
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Продажи',
    items: [
      { to: '/admin',         label: 'Обзор',     Icon: ChartLineUpIcon },
      { to: '/admin/orders',  label: 'Заказы',    Icon: ReceiptIcon },
      { to: '/admin/chats',   label: 'Чаты',      Icon: ChatsCircleIcon },
      { to: '/admin/support', label: 'Поддержка', Icon: HeadsetIcon },
    ],
  },
  {
    title: 'Магазин',
    items: [
      { to: '/admin/catalog',   label: 'Каталог',      Icon: PackageIcon },
      { to: '/admin/discounts', label: 'Скидки',       Icon: TagIcon },
      { to: '/admin/users',     label: 'Пользователи', Icon: UsersIcon },
    ],
  },
  {
    title: 'Настройки',
    items: [
      { to: '/admin/settings/loyalty',      label: 'Лояльность', Icon: GearSixIcon },
      { to: '/admin/settings/pricing',      label: 'Цены',       Icon: CurrencyRubIcon },
      { to: '/admin/settings/content',      label: 'Контент',    Icon: TextAaIcon },
      { to: '/admin/settings/integrations', label: 'Интеграции', Icon: LightningIcon },
    ],
  },
]
const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items)

function currentTitle(pathname: string): string {
  const match = [...ALL_ITEMS]
    .sort((a, b) => b.to.length - a.to.length)
    .find(i => (i.to === '/admin' ? pathname === '/admin' || pathname === '/admin/' : pathname.startsWith(i.to)))
  return match?.label ?? 'Админка'
}

function SidebarLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const { Icon } = item
  return (
    <NavLink
      to={item.to}
      end={item.to === '/admin'}
      onClick={onClick}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 px-3 h-10 rounded-xl text-sm font-medium transition-colors duration-150',
          isActive
            ? 'bg-[var(--bg3)] text-[var(--text)]'
            : 'text-[var(--text-2)] hover:bg-[var(--bg2)] hover:text-[var(--text)]',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={20} weight={isActive ? 'fill' : 'regular'} className={isActive ? 'text-[var(--link)]' : ''} />
          <span className="flex-1">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-5">
      {NAV_GROUPS.map(group => (
        <div key={group.title} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1.5 text-xs font-medium text-[var(--hint)]">{group.title}</p>
          {group.items.map(item => (
            <SidebarLink key={item.to} item={item} onClick={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  )
}

export default function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const isChats = location.pathname.startsWith('/admin/chats')

  // Закрываем drawer при смене маршрута
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  // Блокируем scroll страницы когда drawer открыт
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  return (
    <div
      className="flex min-h-screen bg-[var(--bg)] text-[var(--text)]"
      style={{
        paddingTop: 'calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px))',
      }}
    >
      {/* ── Sidebar (md+) ── */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-[var(--border)] px-3 py-5 gap-6 sticky top-0 h-screen overflow-y-auto">
        <img src={logoFull} alt="reDonate" className="h-6 w-auto self-start ml-3" />
        <NavList />
        <NavLink
          to="/"
          className="mt-auto flex items-center gap-2 px-3 h-10 rounded-xl text-sm text-[var(--hint)] hover:text-[var(--text)] hover:bg-[var(--bg2)] transition-colors"
        >
          <ArrowLeftIcon size={18} /> В магазин
        </NavLink>
      </aside>

      {/* ── Mobile Drawer overlay ── */}
      <div
        className="md:hidden fixed inset-0 bg-black/60 transition-opacity duration-200"
        style={{ zIndex: 200, opacity: drawerOpen ? 1 : 0, pointerEvents: drawerOpen ? 'auto' : 'none' }}
        onClick={() => setDrawerOpen(false)}
      />

      {/* ── Mobile Drawer ── */}
      <div
        className="md:hidden fixed top-0 left-0 bottom-0 flex flex-col bg-[var(--bg2)] border-r border-[var(--border)]"
        style={{
          zIndex: 201,
          width: 260,
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          paddingTop: 'calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px) + 64px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavList onNavigate={() => setDrawerOpen(false)} />
        </div>
        <NavLink
          to="/"
          className="flex items-center gap-2 mx-3 mb-4 px-3 h-10 rounded-xl text-sm text-[var(--hint)] hover:bg-[var(--bg3)]"
        >
          <ArrowLeftIcon size={18} /> В магазин
        </NavLink>
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center h-14 px-4 md:px-6 border-b border-[var(--border)] shrink-0 gap-3 bg-[var(--bg)]" style={{ position: 'relative', zIndex: 202 }}>
          <button
            type="button"
            aria-label={drawerOpen ? 'Закрыть меню' : 'Меню'}
            className="md:hidden flex items-center justify-center w-10 h-10 -ml-2 rounded-xl text-[var(--text-2)] active:opacity-70"
            style={{ background: drawerOpen ? 'var(--bg3)' : 'transparent' }}
            onClick={() => setDrawerOpen(v => !v)}
          >
            {drawerOpen ? <XIcon size={22} /> : <ListIcon size={22} />}
          </button>
          <h1 className="text-base" style={{ margin: 0 }}>{currentTitle(location.pathname)}</h1>
        </header>

        <main className={isChats ? 'flex-1 overflow-hidden flex flex-col' : 'flex-1 overflow-y-auto'}>
          {isChats
            ? <Outlet />
            : <div className="p-4 md:p-6 max-w-6xl mx-auto pb-8"><Outlet /></div>
          }
        </main>
      </div>
    </div>
  )
}
