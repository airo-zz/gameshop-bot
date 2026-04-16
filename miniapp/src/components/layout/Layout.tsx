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

function IconUser({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

// Chat icon — slightly larger, used in the featured center button
function IconChat({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="12" cy="10" r="1" fill="currentColor" />
      <circle cx="15" cy="10" r="1" fill="currentColor" />
    </svg>
  )
}

// ── Nav config ───────────────────────────────────────────────────────────────

const NAV = [
  { to: '/',        label: 'Главная', IconComp: IconHome, badge: false, featured: false },
  { to: '/catalog', label: 'Каталог', IconComp: IconGrid, badge: false, featured: false },
  { to: '/chat',    label: 'Чат',     IconComp: IconChat, badge: false, featured: true  },
  { to: '/cart',    label: 'Корзина', IconComp: IconCart, badge: true,  featured: false },
  { to: '/profile', label: 'Профиль', IconComp: IconUser, badge: false, featured: false },
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
      {particlesEnabled && <ParticleCanvas />}

      <main
        className="flex-1 overflow-y-auto"
        style={{ position: 'relative', paddingBottom: '96px', paddingTop: 'calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px))' }}
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
                <Link
                  key={to}
                  to={to}
                  className="relative flex flex-col items-center justify-center active:scale-90"
                  style={{
                    flex: 1,
                    minHeight: 52,
                    gap: 0,
                    padding: '4px 4px 6px',
                    WebkitTapHighlightColor: 'transparent',
                    transition: 'transform 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
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
                    <IconChat active={isActive} />
                  </div>
                  <span
                    className="text-[10px] font-semibold leading-none select-none"
                    style={{
                      color: isActive ? '#60a5fa' : 'rgba(255,255,255,0.5)',
                      marginTop: 1,
                      transition: 'color 0.2s',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </span>
                </Link>
              )
            }

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
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
