/**
 * src/web/WebLayout.tsx
 * Шелл публичного сайта: шапка (меню, поиск, корзина, вход), подвал.
 * Контент рендерится через <Outlet/> с мягкой сменой страниц.
 */

import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Menu, X, Send, LogOut, ShoppingCart, Wallet, Search } from '@/components/ui/icons'
import { SHOP_NAME, MINIAPP_URL, SUPPORT_BOT_URL, SITE_URL } from '@/config/appTarget'
import { useWebAuth } from '@/web/auth/useWebAuth'
import { useWebCart } from '@/web/cart/useWebCart'
import { money } from '@/web/format'
import Avatar from '@/web/components/Avatar'
import logoFull from '@/assets/logo-full.png'

interface NavItem {
  label: string
  href: string
  external?: boolean
}

const NAV: NavItem[] = [
  { label: 'Каталог', href: '/catalog' },
  { label: 'Кэшбэк', href: '/cashback' },
  { label: 'Как это работает', href: '/#how' },
  { label: 'Вопросы', href: '/#faq' },
]

function Logo() {
  return (
    <Link to="/" className="flex items-center shrink-0" aria-label={SHOP_NAME}>
      <img src={logoFull} alt={SHOP_NAME} className="h-6 md:h-7 w-auto" />
    </Link>
  )
}

function NavItemLink({ item, onClick, className = '' }: { item: NavItem; onClick?: () => void; className?: string }) {
  const base = 'text-sm transition-colors ' + className
  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" onClick={onClick}
         className={base + ' text-[var(--text-2)] hover:text-[var(--text)]'}>
        {item.label}
      </a>
    )
  }
  if (item.href.includes('#')) {
    return (
      <Link to={item.href} onClick={onClick} className={base + ' text-[var(--text-2)] hover:text-[var(--text)]'}>
        {item.label}
      </Link>
    )
  }
  return (
    <NavLink
      to={item.href}
      onClick={onClick}
      className={({ isActive }) => base + (isActive ? ' text-[var(--text)]' : ' text-[var(--text-2)] hover:text-[var(--text)]')}
    >
      {item.label}
    </NavLink>
  )
}

function HeaderSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); navigate(q.trim() ? `/catalog?q=${encodeURIComponent(q.trim())}` : '/catalog') }}
      className="hidden lg:flex items-center gap-2 h-10 w-60 px-3 rounded-xl bg-[var(--bg2)] border border-transparent focus-within:border-[var(--accent)] transition-colors"
      role="search"
    >
      <Search size={18} className="text-[var(--hint)] shrink-0" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Найти игру"
        aria-label="Найти игру"
        className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[var(--text)] placeholder:text-[var(--hint)]"
      />
    </form>
  )
}

function CartButton({ onNavigate }: { onNavigate?: () => void }) {
  const { isAuthenticated } = useWebAuth()
  const { count } = useWebCart()
  if (!isAuthenticated) return null
  return (
    <Link
      to="/cart"
      onClick={onNavigate}
      className="relative w-10 h-10 flex items-center justify-center rounded-xl text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--bg2)] transition-colors"
      aria-label="Корзина"
    >
      <ShoppingCart size={21} />
      {count > 0 && (
        <span
          className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold text-[var(--text)] flex items-center justify-center"
          style={{ background: 'var(--accent)', boxShadow: '0 0 0 2px var(--bg)' }}
        >
          {count}
        </span>
      )}
    </Link>
  )
}

function AuthArea({ onNavigate }: { onNavigate?: () => void }) {
  const { user, isAuthenticated, logout, ready } = useWebAuth()
  if (!ready) return null

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-1.5">
        <Link
          to="/balance"
          onClick={onNavigate}
          title="Баланс"
          className="inline-flex items-center gap-1.5 h-10 rounded-xl px-3 text-sm font-medium num text-[var(--text)] bg-[var(--bg2)] hover:bg-[var(--bg3)] transition-colors"
        >
          <Wallet size={17} className="text-[var(--hint)]" />
          {money(user.balance)}
        </Link>
        <Link to="/profile" onClick={onNavigate} className="flex items-center gap-2 h-10 rounded-xl pl-1.5 pr-3 hover:bg-[var(--bg2)] transition-colors">
          <Avatar src={user.photo_url} name={user.first_name} size={28} />
          <span className="text-sm text-[var(--text-2)] max-w-[120px] truncate">{user.first_name}</span>
        </Link>
        <button
          onClick={() => { logout(); onNavigate?.() }}
          title="Выйти"
          aria-label="Выйти"
          className="w-10 h-10 flex items-center justify-center rounded-xl text-[var(--hint)] hover:text-[var(--text)] hover:bg-[var(--bg2)] transition-colors"
        >
          <LogOut size={18} />
        </button>
      </div>
    )
  }

  return (
    <Link
      to="/login"
      onClick={onNavigate}
      className="inline-flex items-center gap-2 h-10 rounded-xl px-4 text-sm font-semibold text-[var(--text)] bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors"
    >
      <Send size={17} />
      Войти через Telegram
    </Link>
  )
}

export default function WebLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const { isAuthenticated } = useWebAuth()
  const reduce = useReducedMotion()

  // Новая страница — наверх (кроме якорей вида /#faq)
  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0 })
    setMenuOpen(false)
  }, [location.pathname, location.hash])

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[var(--border)]" style={{ background: 'var(--bg)' }}>
        <div className="web-container flex items-center gap-8 h-16">
          <Logo />

          <nav className="hidden md:flex items-center gap-6">
            {NAV.map((item) => <NavItemLink key={item.href} item={item} />)}
          </nav>

          <div className="hidden md:flex items-center gap-2 ml-auto">
            <HeaderSearch />
            <CartButton />
            <AuthArea />
          </div>

          <div className="md:hidden flex items-center gap-1 ml-auto">
            <CartButton />
            <button
              className="w-10 h-10 flex items-center justify-center rounded-xl text-[var(--text-2)] hover:bg-[var(--bg2)] transition-colors"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? 'Закрыть меню' : 'Меню'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {menuOpen && (
            <motion.div
              key="mobile-menu"
              className="md:hidden overflow-hidden border-t border-[var(--border)]"
              style={{ background: 'var(--bg)' }}
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="web-container py-4 flex flex-col gap-4">
                {NAV.map((item) => <NavItemLink key={item.href} item={item} onClick={() => setMenuOpen(false)} />)}
                {isAuthenticated && (
                  <>
                    <Link to="/profile" className="text-sm text-[var(--text-2)]">Профиль</Link>
                    <Link to="/orders" className="text-sm text-[var(--text-2)]">Мои заказы</Link>
                  </>
                )}
                <AuthArea onNavigate={() => setMenuOpen(false)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <motion.main
        className="flex-1"
        key={location.pathname}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <Outlet />
      </motion.main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)] mt-24">
        <div className="web-container py-12 grid grid-cols-2 md:grid-cols-4 gap-10">
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="text-sm text-[var(--hint)] mt-4 leading-relaxed max-w-xs">
              Донат в мобильные и PC-игры, Telegram Stars и Premium. Оплата СБП, картой или криптой, живая поддержка.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-[var(--text)] mb-3">Магазин</p>
            <ul className="space-y-2.5">
              {NAV.map((item) => <li key={item.href}><NavItemLink item={item} /></li>)}
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-[var(--text)] mb-3">Документы</p>
            <ul className="space-y-2.5">
              <li>
                <a href={`${SITE_URL}/app/legal/terms.html`} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--text-2)] hover:text-[var(--text)] transition-colors">
                  Условия использования
                </a>
              </li>
              <li>
                <a href={`${SITE_URL}/app/legal/privacy.html`} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--text-2)] hover:text-[var(--text)] transition-colors">
                  Политика конфиденциальности
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-[var(--text)] mb-3">Связь</p>
            <ul className="space-y-2.5">
              <li>
                <a href={SUPPORT_BOT_URL} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--text-2)] hover:text-[var(--text)] transition-colors">
                  Поддержка в Telegram
                </a>
              </li>
              <li>
                <a href={MINIAPP_URL} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--text-2)] hover:text-[var(--text)] transition-colors">
                  Магазин в Telegram
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[var(--border)]">
          <div className="web-container py-5 text-xs text-[var(--hint)]">
            © {new Date().getFullYear()} {SHOP_NAME}
          </div>
        </div>
      </footer>
    </div>
  )
}
