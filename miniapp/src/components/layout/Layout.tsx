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
    <div className="flex flex-col h-full">
      {/* Контент — прокручиваемая область */}
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      {/* Нижний навбар */}
      <nav
        className="fixed bottom-0 left-0 right-0 safe-bottom z-50"
        style={{ background: 'var(--bg)', borderTop: '1px solid var(--bg2)' }}
      >
        <div className="flex items-center justify-around py-2">
          {NAV.map(({ to, label, Icon, badge }) => {
            const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={clsx(
                  'flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition-colors',
                  isActive ? 'opacity-100' : 'opacity-40'
                )}
                style={{ color: isActive ? 'var(--btn)' : 'var(--text)' }}
              >
                <div className="relative">
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                  {badge && itemsCount > 0 && (
                    <span
                      className="absolute -top-1 -right-1.5 min-w-[16px] h-4 flex items-center justify-center
                                 rounded-full text-[10px] font-bold px-1"
                      style={{ background: 'var(--btn)', color: 'var(--btn-text)' }}
                    >
                      {itemsCount > 99 ? '99+' : itemsCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
