// src/components/layout/Layout.tsx
import { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCartStore, useUIStore } from '@/store'
import ParticleCanvas from '@/components/ui/ParticleCanvas'
import TopProgressBar from '@/components/ui/TopProgressBar'
import logo from '@/assets/logo.png'
import { catalogApi, cartApi, profileApi, chatApi } from '@/api'

// ── SVG Icons ────────────────────────────────────────────────────────────────

function IconHome({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12L12 3l9 9" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-5h4v5h4a1 1 0 0 0 1-1v-9" />
    </svg>
  )
}

function IconGrid({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

function IconCart({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 3h2l1 5" />
      <path d="M5.5 8h13l-1.5 8H7L5.5 8z" />
      <circle cx="9" cy="19.5" r="1.5" />
      <circle cx="16" cy="19.5" r="1.5" />
    </svg>
  )
}

function IconUser({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

// ── Nav config ───────────────────────────────────────────────────────────────

const NAV = [
  { to: '/',        label: 'Главная', IconComp: IconHome, badge: false, featured: false },
  { to: '/catalog', label: 'Каталог', IconComp: IconGrid, badge: false, featured: false },
  { to: '/chat',    label: 'Чат',     IconComp: null,     badge: false, featured: true  },
  { to: '/cart',    label: 'Корзина', IconComp: IconCart, badge: true,  featured: false },
  { to: '/profile', label: 'Профиль', IconComp: IconUser, badge: false, featured: false },
]

// ── Layout ───────────────────────────────────────────────────────────────────

export default function Layout() {
  const { pathname } = useLocation()
  const { itemsCount } = useCartStore()
  const particlesEnabled = useUIStore(s => s.particlesEnabled)

  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [chatLoading, setChatLoading] = useState(false)
  const [navLoading, setNavLoading] = useState<string | null>(null)
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
    // Already on this page
    if (pathname === to || (to !== '/' && pathname.startsWith(to))) return
    // Already loading
    if (navLoading) return
    // No prefetch — navigate immediately
    if (!prefetchFn) { navigate(to); return }
    setNavLoading(to)
    try {
      await prefetchFn()
    } finally {
      setNavLoading(null)
      navigate(to)
    }
  }, [pathname, navigate, navLoading, queryClient])

  const activeIndex = NAV.findIndex(({ to }) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to)
  )
  const safeActiveIndex = activeIndex === -1 ? 0 : activeIndex
  const isChatPage = pathname.startsWith('/chat')

  const handleChatClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (isChatPage) return
    if (navLoading) return
    // Already cached → navigate immediately
    if (queryClient.getQueryData(['chat'])) { navigate('/chat'); return }
    setChatLoading(true)
    setNavLoading('/chat')
    try {
      await queryClient.prefetchQuery({ queryKey: ['chat'], queryFn: chatApi.getOrCreate, staleTime: Infinity })
    } finally {
      setChatLoading(false)
      setNavLoading(null)
      navigate('/chat')
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      <TopProgressBar active={navLoading !== null || chatLoading} />
      {particlesEnabled && <ParticleCanvas />}

      <main
        className={`flex-1 ${isChatPage ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}
        style={{
          position: 'relative',
          paddingBottom: isChatPage || keyboardOpen ? 0 : 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
          paddingTop: 'calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px))',
        }}
      >
        <Outlet />
      </main>

      {/* ── Floating bottom navigation ─────────────────────────────────── */}
      <nav
        className="fixed left-3 right-3"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          zIndex: 110,
          background: 'rgba(8,14,28,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '28px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(45,88,173,0.12)',
        }}
      >
        <div className="relative flex items-center justify-around px-2 py-2">

          {/* ── Sliding pill indicator (skip for featured) ───────────── */}
          {!NAV[safeActiveIndex]?.featured && (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 8,
                bottom: 8,
                left: 8,
                width: `calc((100% - 16px) / ${NAV.length})`,
                transform: `translateX(calc(${safeActiveIndex} * 100%))`,
                transition: 'transform 0.4s cubic-bezier(0.34, 1.2, 0.64, 1)',
                background: 'rgba(45,88,173,0.22)',
                border: '1px solid rgba(45,88,173,0.35)',
                borderRadius: '20px',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* ── Nav items ────────────────────────────────────────────── */}
          {NAV.map(({ to, label, IconComp, badge, featured }, index) => {
            const isActive = index === safeActiveIndex

            if (featured) {
              // ── Featured Chat button ──────────────────────────────
              return (
                <a
                  key={to}
                  href={to}
                  onClick={handleChatClick}
                  className="relative flex items-center justify-center active:scale-90"
                  style={{
                    flex: 1,
                    minHeight: 52,
                    padding: '4px',
                    WebkitTapHighlightColor: 'transparent',
                    transition: 'transform 0.15s ease',
                    textDecoration: 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                      width: 56,
                      height: 46,
                      borderRadius: 16,
                      background: isActive
                        ? 'linear-gradient(135deg, #1d4ed8, #2563eb)'
                        : 'linear-gradient(135deg, #1e3a8a, #1d4ed8)',
                      boxShadow: isActive
                        ? '0 4px 20px rgba(37,99,235,0.7), 0 0 0 1px rgba(96,165,250,0.3)'
                        : '0 4px 16px rgba(29,78,216,0.5), 0 0 0 1px rgba(59,130,246,0.25)',
                      color: '#fff',
                      transition: 'box-shadow 0.2s, background 0.2s',
                      transform: 'translateY(-6px)',
                    }}
                  >
                    {chatLoading
                      ? <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      : <img src={logo} alt="" style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 4 }} />
                    }
                    <span
                      className="text-[9px] font-semibold leading-none select-none"
                      style={{ color: '#fff', whiteSpace: 'nowrap' }}
                    >
                      {label}
                    </span>
                  </div>
                  {chatUnreadCount > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        right: 6,
                        minWidth: 16,
                        height: 16,
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, #2d58ad, #1e3f8a)',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 4px',
                        boxShadow: '0 2px 8px rgba(45,88,173,0.55)',
                        zIndex: 1,
                      }}
                    >
                      {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                    </span>
                  )}
                </a>
              )
            }

            // ── Regular nav button ────────────────────────────────────
            const handleClick = () => {
              if (to === '/') {
                prefetchAndNavigate(to, () => Promise.all([
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
                ]).then(() => {}))
              } else if (to === '/catalog') {
                prefetchAndNavigate(to, () =>
                  queryClient.prefetchQuery({
                    queryKey: ['games', 'game'],
                    queryFn: () => catalogApi.getGames('game'),
                    staleTime: 30_000,
                  })
                )
              } else if (to === '/cart') {
                prefetchAndNavigate(to, () =>
                  queryClient.prefetchQuery({
                    queryKey: ['cart'],
                    queryFn: cartApi.get,
                    staleTime: 10_000,
                  })
                )
              } else if (to === '/profile') {
                prefetchAndNavigate(to, () =>
                  queryClient.prefetchQuery({
                    queryKey: ['profile'],
                    queryFn: profileApi.get,
                    staleTime: 30_000,
                  })
                )
              } else {
                prefetchAndNavigate(to)
              }
            }

            return (
              <button
                key={to}
                type="button"
                onClick={handleClick}
                className="relative flex flex-col items-center justify-center active:scale-90"
                style={{
                  flex: 1,
                  minHeight: 52,
                  gap: 0,
                  padding: '8px 4px',
                  transition: 'transform 0.15s ease',
                  WebkitTapHighlightColor: 'transparent',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <div className="relative flex items-center justify-center">
                  <span
                    style={{
                      display: 'flex',
                      color: isActive ? '#6b9de8' : 'rgba(255,255,255,0.35)',
                      filter: isActive ? 'drop-shadow(0 0 8px rgba(107,157,232,0.8))' : 'none',
                      transform: isActive ? 'scale(1.15)' : 'scale(1)',
                      transition: 'color 0.2s, filter 0.2s, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    }}
                  >
                    {IconComp && <IconComp active={isActive} />}
                  </span>

                  {badge && itemsCount > 0 && (
                    <span
                      className="absolute -top-1 -right-2 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold px-1"
                      style={{
                        background: 'linear-gradient(135deg, #2d58ad, #1e3f8a)',
                        color: '#fff',
                        boxShadow: '0 2px 8px rgba(45,88,173,0.55)',
                        zIndex: 1,
                      }}
                    >
                      {itemsCount > 99 ? '99+' : itemsCount}
                    </span>
                  )}
                </div>

                <span
                  className="text-[10px] font-medium leading-none select-none"
                  style={{
                    color: isActive ? '#6b9de8' : 'rgba(255,255,255,0.35)',
                    marginTop: 3,
                    transition: 'color 0.2s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
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
