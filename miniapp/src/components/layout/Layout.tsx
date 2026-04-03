// src/components/layout/Layout.tsx
import { Outlet, useLocation, Link } from 'react-router-dom'
import { ShoppingBag, ShoppingCart, Package, User } from 'lucide-react'
import { useCartStore } from '@/store'
import clsx from 'clsx'

const NAV = [
  { to: '/',        label: 'Магазин',  Icon: ShoppingBag },
  { to: '/cart',    label: 'Корзина',  Icon: ShoppingCart, badge: true },
  { to: '/orders',  label: 'Заказы',   Icon: Package },
  { to: '/profile', label: 'Профиль',  Icon: User },
]

export default function Layout() {
  const { pathname } = useLocation()
  const { itemsCount } = useCartStore()

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Контент — прокручиваемая область */}
      <main className="flex-1 overflow-y-auto pb-[72px]">
        <Outlet />
      </main>

      {/* Нижний навбар */}
      <nav
        className="fixed bottom-0 left-0 right-0 safe-bottom z-50"
        style={{
          background: 'rgba(10,10,15,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center justify-around py-1.5">
          {NAV.map(({ to, label, Icon, badge }) => {
            const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={clsx(
                  'flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-2xl',
                  'transition-all duration-200',
                  isActive ? 'opacity-100' : 'opacity-40 hover:opacity-70'
                )}
              >
                <div className="relative">
                  {/* Glow-подсветка активного таба */}
                  {isActive && (
                    <span
                      className="absolute inset-0 rounded-full blur-md"
                      style={{ background: 'rgba(99,102,241,0.4)', transform: 'scale(1.8)' }}
                    />
                  )}
                  <Icon
                    size={22}
                    strokeWidth={isActive ? 2.5 : 1.8}
                    style={{ color: isActive ? '#818cf8' : 'var(--hint)', position: 'relative' }}
                  />
                  {badge && itemsCount > 0 && (
                    <span
                      className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] flex items-center justify-center
                                 rounded-full text-[9px] font-bold px-1"
                      style={{
                        background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
                        color: '#fff',
                        boxShadow: '0 0 8px rgba(99,102,241,0.6)',
                      }}
                    >
                      {itemsCount > 99 ? '99+' : itemsCount}
                    </span>
                  )}
                </div>
                <span
                  className="text-[10px] font-medium"
                  style={{ color: isActive ? '#818cf8' : 'var(--hint)' }}
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
