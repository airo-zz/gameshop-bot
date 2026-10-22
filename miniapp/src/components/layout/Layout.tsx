// src/components/layout/Layout.tsx
import { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCartStore } from '@/store'
import type { Icon as PhIcon } from '@phosphor-icons/react'
import { HouseIcon, ShoppingCartIcon, SquaresFourIcon, UserIcon } from '@phosphor-icons/react'
import logo from '@/assets/logo-mark.png'
import { catalogApi, cartApi, profileApi, chatApi } from '@/api'

// ── Icons (Phosphor: контур — неактивный, заливка — активный) ───────────────

type NavIconProps = { active: boolean }
const navIcon = (Ph: PhIcon) => ({ active }: NavIconProps) => (
  <Ph size={24} weight={active ? 'fill' : 'regular'} />
)
const IconHome = navIcon(HouseIcon)
const IconGrid = navIcon(SquaresFourIcon)
const IconCart = navIcon(ShoppingCartIcon)
const IconUser = navIcon(UserIcon)

// ── Nav config ───────────────────────────────────────────────────────────────

const NAV = [
  { to: '/',        label: 'Главная', IconComp: IconHome, badge: false, featured: false },
  { to: '/catalog', label: 'Каталог', IconComp: IconGrid, badge: false, featured: false },
  { to: '/chat',    label: 'Чат',     IconComp: null,     badge: false, featured: true  },
  { to: '/cart',    label: 'Корзина', IconComp: IconCart, badge: true,  featured: false },
  { to: '/profile', label: 'Профиль', IconComp: IconUser, badge: false, featured: false },
]

/** Высота нижней навигации без safe-area (страницы с фиксированным низом отступают на неё) */
export const NAV_HEIGHT = 58

// ── Layout ───────────────────────────────────────────────────────────────────

export default function Layout() {
  const { pathname } = useLocation()
  const { itemsCount } = useCartStore()

  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  const isChatPageEarly = pathname.startsWith('/chat')

  // Polling unread_count для бейджа на кнопке чата (не поллим когда открыт сам чат)
  const { data: chatInfo } = useQuery({
    queryKey: ['chat'],
    queryFn: chatApi.getOrCreate,
    staleTime: 30_000,
    refetchInterval: isChatPageEarly ? false : 10_000,
  })
  const chatUnreadCount = (chatInfo as any)?.unread_count ?? 0

  useEffect(() => {
    let maxHeight = window.visualViewport?.height ?? window.innerHeight

    const check = () => {
      const h = window.visualViewport?.height ?? window.innerHeight
      if (h > maxHeight) maxHeight = h
      setKeyboardOpen(maxHeight - h > 100)
    }

    const tgWA = (window as any).Telegram?.WebApp
    tgWA?.onEvent?.('viewportChanged', check)
    window.visualViewport?.addEventListener('resize', check)

    return () => {
      tgWA?.offEvent?.('viewportChanged', check)
      window.visualViewport?.removeEventListener('resize', check)
    }
  }, [])

  const prefetchAndNavigate = useCallback(async (to: string, prefetchFn?: () => Promise<void>) => {
    if (pathname === to || (to !== '/' && pathname.startsWith(to))) return
    if (!prefetchFn) { navigate(to); return }
    await prefetchFn()
    navigate(to)
  }, [pathname, navigate])

  const activeIndex = NAV.findIndex(({ to }) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to)
  )
  // Вне разделов навбара (оформление, заказы…) ничего не подсвечиваем
  const isChatPage = pathname.startsWith('/chat')

  const handleChatClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (isChatPage) return
    await Promise.all([
      import('@/pages/ChatPage'),
      queryClient.getQueryData(['chat'])
        ? Promise.resolve()
        : queryClient.prefetchQuery({ queryKey: ['chat'], queryFn: chatApi.getOrCreate, staleTime: Infinity }),
      queryClient.getQueryData(['chat-messages'])
        ? Promise.resolve()
        : queryClient.prefetchQuery({ queryKey: ['chat-messages'], queryFn: () => chatApi.getMessages() }),
    ])
    navigate('/chat')
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      <main
        className={`flex-1 ${isChatPage ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}
        style={{
          position: 'relative',
          paddingBottom: isChatPage || keyboardOpen ? 0 : `calc(env(safe-area-inset-bottom, 0px) + ${NAV_HEIGHT + 16}px)`,
          paddingTop: 'calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px))',
        }}
      >
        <Outlet />
      </main>

      {/* ── Bottom navigation ──────────────────────────────────────────── */}
      <nav
        className="fixed left-0 right-0 bottom-0"
        style={{
          zIndex: 110,
          opacity: keyboardOpen && isChatPage ? 0 : 1,
          pointerEvents: keyboardOpen && isChatPage ? 'none' : undefined,
          transition: 'opacity 0.15s ease',
          background: 'var(--bg2)',
          borderTop: '1px solid var(--border)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="flex items-stretch justify-around px-1" style={{ height: NAV_HEIGHT }}>
          {NAV.map(({ to, label, IconComp, badge, featured }, index) => {
            const isActive = index === activeIndex
            const color = isActive ? 'var(--text)' : 'var(--hint)'

            if (featured) {
              // ── Чат: выделен заливкой бренда, но в общей сетке ─────
              return (
                <a
                  key={to}
                  href={to}
                  onClick={handleChatClick}
                  className="relative flex flex-col items-center justify-center active:opacity-70"
                  style={{
                    flex: 1,
                    gap: 4,
                    textDecoration: 'none',
                    transition: 'opacity 0.1s ease',
                  }}
                >
                  <span
                    className="relative flex items-center justify-center"
                    style={{
                      width: 44,
                      height: 30,
                      borderRadius: 10,
                      background: isActive ? 'var(--btn-hover)' : 'var(--accent)',
                    }}
                  >
                    <img src={logo} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                    {chatUnreadCount > 0 && (
                      <NavBadge count={chatUnreadCount} color="var(--destructive)" />
                    )}
                  </span>
                  <span className="text-[10px] font-medium leading-none" style={{ color, whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                </a>
              )
            }

            // ── Regular nav button ────────────────────────────────────
            const handleClick = () => {
              if (to === '/') {
                prefetchAndNavigate(to, () => Promise.all([
                  import('@/pages/HomePage'),
                  queryClient.prefetchQuery({
                    queryKey: ['games', 'game'],
                    queryFn: () => catalogApi.getGames('game'),
                    staleTime: 30_000,
                  }),
                  queryClient.prefetchQuery({
                    queryKey: ['trending-categories'],
                    queryFn: catalogApi.getTrendingCategories,
                    staleTime: 30_000,
                  }),
                  queryClient.prefetchQuery({
                    queryKey: ['profile'],
                    queryFn: profileApi.get,
                    staleTime: 30_000,
                  }),
                ]).then(() => {}))
              } else if (to === '/catalog') {
                prefetchAndNavigate(to, () => Promise.all([
                  import('@/pages/CatalogPage'),
                  queryClient.prefetchQuery({
                    queryKey: ['games', 'game'],
                    queryFn: () => catalogApi.getGames('game'),
                    staleTime: 30_000,
                  }),
                ]).then(() => {}))
              } else if (to === '/cart') {
                prefetchAndNavigate(to, () => Promise.all([
                  import('@/pages/CartPage'),
                  queryClient.prefetchQuery({
                    queryKey: ['cart'],
                    queryFn: cartApi.get,
                    staleTime: 10_000,
                  }),
                ]).then(() => {}))
              } else if (to === '/profile') {
                prefetchAndNavigate(to, () => Promise.all([
                  import('@/pages/ProfilePage'),
                  queryClient.prefetchQuery({
                    queryKey: ['profile'],
                    queryFn: profileApi.get,
                    staleTime: 30_000,
                  }),
                ]).then(() => {}))
              } else {
                prefetchAndNavigate(to)
              }
            }

            return (
              <button
                key={to}
                type="button"
                onClick={handleClick}
                className="relative flex flex-col items-center justify-center active:opacity-70"
                style={{
                  flex: 1,
                  gap: 4,
                  color,
                  transition: 'color 0.15s ease, opacity 0.1s ease',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <span className="relative flex">
                  {IconComp && <IconComp active={isActive} />}
                  {badge && itemsCount > 0 && <NavBadge count={itemsCount} color="var(--accent)" />}
                </span>
                <span className="text-[10px] font-medium leading-none" style={{ whiteSpace: 'nowrap' }}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

function NavBadge({ count, color }: { count: number; color: string }) {
  return (
    <span
      className="absolute flex items-center justify-center rounded-full text-[10px] font-semibold"
      style={{
        top: -5,
        right: -8,
        minWidth: 16,
        height: 16,
        padding: '0 4px',
        background: color,
        color: '#fff',
        boxShadow: '0 0 0 2px var(--bg2)',
      }}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
