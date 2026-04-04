// src/components/layout/Layout.tsx
import { Outlet, useLocation, Link } from 'react-router-dom'
import { useCartStore, useUIStore } from '@/store'
import ParticleCanvas from '@/components/ui/ParticleCanvas'

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

function IconHeart({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor"
         strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21C12 21 3 14.5 3 8.5a5 5 0 0 1 9-3 5 5 0 0 1 9 3C21 14.5 12 21 12 21z" />
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
  { to: '/',          label: 'Главная',  IconComp: IconHome,  badge: false },
  { to: '/catalog',   label: 'Каталог',  IconComp: IconGrid,  badge: false },
  { to: '/cart',      label: 'Корзина',  IconComp: IconCart,  badge: true  },
  { to: '/favorites', label: 'Избранное', IconComp: IconHeart, badge: false },
  { to: '/profile',   label: 'Профиль',  IconComp: IconUser,  badge: false },
]

// ── Layout ───────────────────────────────────────────────────────────────────

export default function Layout() {
  const { pathname } = useLocation()
  const { itemsCount } = useCartStore()
  const particlesEnabled = useUIStore(s => s.particlesEnabled)

  const activeIndex = NAV.findIndex(({ to }) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to)
  )
  const safeActiveIndex = activeIndex === -1 ? 0 : activeIndex

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Star particle background */}
      {particlesEnabled && <ParticleCanvas />}

      {/* Page content — padded so it sits above the floating nav */}
      <main
        className="flex-1 overflow-y-auto"
        style={{ position: 'relative', paddingBottom: '96px' }}
      >
        <Outlet />
      </main>

      {/* ── Floating bottom navigation ─────────────────────────────────── */}
      <nav
        className="fixed bottom-4 left-3 right-3"
        style={{
          zIndex: 110,
          background: 'rgba(8,14,28,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '28px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(45,88,173,0.12)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="relative flex items-center justify-around px-2 py-2">

          {/* ── Sliding pill indicator ────────────────────────────────── */}
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

          {/* ── Nav items ────────────────────────────────────────────── */}
          {NAV.map(({ to, label, IconComp, badge }, index) => {
            const isActive = index === safeActiveIndex
            return (
              <Link
                key={to}
                to={to}
                className="relative flex flex-col items-center justify-center active:scale-90"
                style={{
                  flex: 1,
                  minHeight: 52,
                  gap: 0,
                  padding: '8px 4px',
                  transition: 'transform 0.15s ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {/* Icon + badge */}
                <div className="relative flex items-center justify-center">
                  <span
                    style={{
                      display: 'flex',
                      color: isActive ? '#6b9de8' : 'rgba(255,255,255,0.35)',
                      filter: isActive
                        ? 'drop-shadow(0 0 8px rgba(107,157,232,0.8))'
                        : 'none',
                      transform: isActive ? 'scale(1.15) translateY(-2px)' : 'scale(1) translateY(0px)',
                      transition: 'color 0.2s, filter 0.2s, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    }}
                  >
                    <IconComp active={isActive} />
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

                {/* Label — visible only for active item */}
                <span
                  className="text-[10px] font-medium leading-none select-none"
                  style={{
                    color: 'rgba(255,255,255,0.35)',
                    opacity: isActive ? 0 : 1,
                    maxHeight: isActive ? '0px' : '14px',
                    marginTop: isActive ? '0px' : '3px',
                    overflow: 'hidden',
                    transition: 'opacity 0.2s ease, max-height 0.2s ease, margin-top 0.2s ease',
                    whiteSpace: 'nowrap',
                  }}
                  aria-hidden={isActive}
                >
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
