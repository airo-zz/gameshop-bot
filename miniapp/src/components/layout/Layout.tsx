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

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Star particle background */}
      {particlesEnabled && <ParticleCanvas />}

      {/* Page content — padded so it sits above the floating nav */}
      <main
        className="flex-1 overflow-y-auto"
        style={{ position: 'relative', zIndex: 1, paddingBottom: '96px' }}
      >
        <Outlet />
      </main>

      {/* ── Floating bottom navigation ─────────────────────────────────── */}
      <nav
        className="fixed bottom-4 left-3 right-3 z-50"
        style={{
          background: 'rgba(19,17,42,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '28px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(79,70,229,0.12)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="flex items-center justify-around px-2 py-2">
          {NAV.map(({ to, label, IconComp, badge }) => {
            const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl transition-all duration-200 active:scale-90"
                style={{
                  background: isActive ? 'rgba(79,70,229,0.18)' : 'transparent',
                  minWidth: 52,
                }}
              >
                {/* Icon + badge */}
                <div className="relative flex items-center justify-center">
                  <span
                    style={{
                      color: isActive ? '#818cf8' : 'rgba(255,255,255,0.38)',
                      filter: isActive ? 'drop-shadow(0 0 6px rgba(129,140,248,0.65))' : 'none',
                      transition: 'color 0.2s, filter 0.2s',
                      display: 'flex',
                    }}
                  >
                    <IconComp active={isActive} />
                  </span>

                  {badge && itemsCount > 0 && (
                    <span
                      className="absolute -top-1 -right-2 min-w-[16px] h-4 flex items-center justify-center
                                 rounded-full text-[10px] font-bold px-1"
                      style={{
                        background: 'linear-gradient(135deg, #4f46e5, #6d28d9)',
                        color: '#fff',
                        boxShadow: '0 2px 8px rgba(79,70,229,0.55)',
                      }}
                    >
                      {itemsCount > 99 ? '99+' : itemsCount}
                    </span>
                  )}
                </div>

                <span
                  className="text-[10px] font-medium transition-colors duration-200"
                  style={{ color: isActive ? '#818cf8' : 'rgba(255,255,255,0.35)' }}
                >
                  {label}
                </span>
                {isActive && (
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#4f46e5', marginTop: 1, boxShadow: '0 0 6px rgba(79,70,229,0.8)' }} />
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
