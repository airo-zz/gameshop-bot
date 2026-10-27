/**
 * src/components/admin/AdminLayout.tsx
 * Shell layout для admin-панели (графит, как клиентская часть).
 *
 * Desktop/планшет: боковая sidebar с группами разделов
 * Мобильный: header с кнопкой меню → slide-in drawer
 *
 * Счётчики в меню (новые оплаченные заказы, непрочитанные чаты) обновляются
 * раз в 15 с; число — и в заголовке вкладки. Ctrl+K / ⌘K — общий поиск.
 * Разделы «Сотрудники» и «Журнал» видны только при наличии прав.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { Icon as PhIcon } from '@phosphor-icons/react'
import {
  ArrowLeftIcon, ChartLineUpIcon, ChatsCircleIcon, ClockCounterClockwiseIcon, CurrencyRubIcon, GearSixIcon,
  HeadsetIcon, IdentificationBadgeIcon, LightningIcon, ListIcon, LockKeyIcon, MagnifyingGlassIcon, PackageIcon,
  ReceiptIcon, SignOutIcon, TagIcon, TextAaIcon, ThumbsUpIcon, UsersIcon, XIcon, HouseIcon, GiftIcon,
} from '@phosphor-icons/react'
import logoFull from '@/assets/logo-full.png'
import { adminWorkspaceApi } from '@/api/admin'
import { isAdminApp, SITE_URL } from '@/config/appTarget'
import { hasPerm, useAdminStore } from '@/store/adminStore'
import CommandPalette from '@/admin/CommandPalette'

type BadgeKey = 'new_orders' | 'unread_chats'

interface NavItem {
  to: string
  label: string
  Icon: PhIcon
  perm?: string
  badge?: BadgeKey
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Продажи',
    items: [
      { to: '/admin',         label: 'Обзор',     Icon: ChartLineUpIcon },
      { to: '/admin/orders',  label: 'Заказы',    Icon: ReceiptIcon, badge: 'new_orders' },
      { to: '/admin/chats',   label: 'Чаты',      Icon: ChatsCircleIcon, badge: 'unread_chats' },
      { to: '/admin/support', label: 'Поддержка', Icon: HeadsetIcon },
    ],
  },
  {
    title: 'Магазин',
    items: [
      { to: '/admin/catalog',   label: 'Каталог',      Icon: PackageIcon },
      { to: '/admin/decor',     label: 'Украшения Discord', Icon: GiftIcon, perm: 'catalog.edit' },
      { to: '/admin/discounts', label: 'Скидки',       Icon: TagIcon },
      { to: '/admin/users',     label: 'Пользователи', Icon: UsersIcon },
      { to: '/admin/reviews',   label: 'Отзывы',       Icon: ThumbsUpIcon },
    ],
  },
  {
    title: 'Настройки',
    items: [
      { to: '/admin/settings/loyalty',      label: 'Лояльность', Icon: GearSixIcon },
      { to: '/admin/settings/pricing',      label: 'Цены',       Icon: CurrencyRubIcon },
      { to: '/admin/settings/content',      label: 'Контент',    Icon: TextAaIcon },
      { to: '/admin/settings/home',         label: 'Главная сайта', Icon: HouseIcon },
      { to: '/admin/settings/integrations', label: 'Интеграции', Icon: LightningIcon },
    ],
  },
  {
    title: 'Команда',
    items: [
      { to: '/admin/staff',    label: 'Сотрудники',   Icon: IdentificationBadgeIcon, perm: 'staff.manage' },
      { to: '/admin/audit',    label: 'Журнал',       Icon: ClockCounterClockwiseIcon, perm: 'audit.view' },
      { to: '/admin/security', label: 'Безопасность', Icon: LockKeyIcon },
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

type Badges = Partial<Record<BadgeKey, number>>

function SidebarLink({ item, badges, onClick }: { item: NavItem; badges: Badges; onClick?: () => void }) {
  const { Icon } = item
  const count = item.badge ? badges[item.badge] ?? 0 : 0
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
          {count > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold num flex items-center justify-center text-white"
                  style={{ background: 'var(--accent)' }}>
              {count > 99 ? '99+' : count}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function NavList({ groups, badges, onNavigate }: { groups: typeof NAV_GROUPS; badges: Badges; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-5">
      {groups.map(group => (
        <div key={group.title} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1.5 text-xs font-medium text-[var(--hint)]">{group.title}</p>
          {group.items.map(item => (
            <SidebarLink key={item.to} item={item} badges={badges} onClick={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  )
}

/** Низ меню: на admin.redonate.gg — «На сайт» и «Выйти», в старой админке /app — «В магазин». */
function FooterLinks({ className = '' }: { className?: string }) {
  const linkCls = 'flex items-center gap-2 px-3 h-10 rounded-xl text-sm text-[var(--hint)] hover:text-[var(--text)] hover:bg-[var(--bg3)] transition-colors'
  if (!isAdminApp) {
    return (
      <NavLink to="/" className={linkCls + ' ' + className}>
        <ArrowLeftIcon size={18} /> В магазин
      </NavLink>
    )
  }
  const logout = async () => {
    try { await adminWorkspaceApi.logout() } finally { window.location.replace('/admin/login') }
  }
  return (
    <div className={'flex flex-col gap-0.5 ' + className}>
      <a href={SITE_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
        <ArrowLeftIcon size={18} /> На сайт
      </a>
      <button type="button" onClick={logout} className={linkCls + ' w-full text-left'}>
        <SignOutIcon size={18} /> Выйти
      </button>
    </div>
  )
}

export default function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const location = useLocation()
  const isChats = location.pathname.startsWith('/admin/chats')
  const me = useAdminStore(s => s.me)

  const groups = useMemo(
    () => NAV_GROUPS
      // «Команда» (сотрудники, журнал, сессии) — только в админке admin.redonate.gg
      .filter(g => isAdminApp || g.title !== 'Команда')
      .map(g => ({ ...g, items: g.items.filter(i => !i.perm || hasPerm(me, i.perm)) }))
      .filter(g => g.items.length > 0),
    [me],
  )
  const paletteNav = useMemo(() => groups.flatMap(g => g.items.map(i => ({ to: i.to, label: i.label }))), [groups])

  // Счётчики: новые оплаченные заказы без исполнителя и непрочитанные чаты
  const { data: badges = {} as Badges } = useQuery<Badges>({
    queryKey: ['admin', 'badges'],
    queryFn: adminWorkspaceApi.badges,
    refetchInterval: 15_000,
    staleTime: 10_000,
  })
  const total = (badges.new_orders ?? 0) + (badges.unread_chats ?? 0)

  // Новый оплаченный заказ — короткое уведомление (кроме первой загрузки)
  const prevOrders = useRef<number | null>(null)
  useEffect(() => {
    const n = badges.new_orders
    if (n === undefined) return
    if (prevOrders.current !== null && n > prevOrders.current) {
      toast(n - prevOrders.current === 1 ? 'Новый оплаченный заказ' : `Новых оплаченных заказов: ${n - prevOrders.current}`)
    }
    prevOrders.current = n
  }, [badges.new_orders])

  // Заголовок вкладки: «(3) Заказы — админка»
  useEffect(() => {
    document.title = `${total > 0 ? `(${total}) ` : ''}${currentTitle(location.pathname)} — админка`
  }, [total, location.pathname])

  // Ctrl+K / ⌘K — общий поиск
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // В админке текст выделяется и копируется (глобально в miniapp выделение выключено,
  // см. index.css). Класс на body — чтобы работало и в модалках, вынесенных порталом.
  useEffect(() => {
    document.body.classList.add('admin-ui')
    return () => document.body.classList.remove('admin-ui')
  }, [])

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
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} nav={paletteNav} />

      {/* ── Sidebar (md+) ── */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-[var(--border)] px-3 py-5 gap-6 sticky top-0 h-screen overflow-y-auto">
        <img src={logoFull} alt="reDonate" className="h-6 w-auto self-start ml-3" />
        <NavList groups={groups} badges={badges} />
        <FooterLinks className="mt-auto" />
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
          <NavList groups={groups} badges={badges} onNavigate={() => setDrawerOpen(false)} />
        </div>
        <FooterLinks className="mx-3 mb-4" />
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center h-14 px-4 md:px-6 border-b border-[var(--border)] shrink-0 gap-3 bg-[var(--bg)]" style={{ position: 'relative', zIndex: 202 }}>
          <button
            type="button"
            aria-label={drawerOpen ? 'Закрыть меню' : 'Меню'}
            className="md:hidden relative flex items-center justify-center w-10 h-10 -ml-2 rounded-xl text-[var(--text-2)] active:opacity-70"
            style={{ background: drawerOpen ? 'var(--bg3)' : 'transparent' }}
            onClick={() => setDrawerOpen(v => !v)}
          >
            {drawerOpen ? <XIcon size={22} /> : <ListIcon size={22} />}
            {!drawerOpen && total > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
            )}
          </button>
          <h1 className="text-base" style={{ margin: 0 }}>{currentTitle(location.pathname)}</h1>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto flex items-center gap-2 h-9 md:w-64 px-2.5 md:px-3 rounded-xl bg-[var(--bg2)] text-sm text-[var(--hint)] hover:text-[var(--text-2)] transition-colors"
            aria-label="Поиск"
          >
            <MagnifyingGlassIcon size={18} />
            <span className="hidden md:inline flex-1 text-left">Поиск</span>
            <kbd className="hidden md:inline text-[11px] border border-[var(--border)] rounded-md px-1.5 py-0.5">Ctrl K</kbd>
          </button>
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
