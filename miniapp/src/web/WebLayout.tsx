/**
 * src/web/WebLayout.tsx
 * Шелл публичного сайта: шапка (меню, поиск, корзина, вход), подвал.
 * Контент рендерится через <Outlet/> с мягкой сменой страниц.
 */

import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Menu, X, LogOut, ShoppingCart, Wallet, User } from '@/components/ui/icons'
import { SHOP_NAME, MINIAPP_URL, SITE_URL } from '@/config/appTarget'
import ChatWidget from '@/web/chat/ChatWidget'
import CookieBanner from '@/web/components/CookieBanner'
import { openChat } from '@/web/chat/chatStore'
import { useWebAuth } from '@/web/auth/useWebAuth'
import { useWebCart } from '@/web/cart/useWebCart'
import { money } from '@/web/format'
import Avatar from '@/web/components/Avatar'
import GameSearch from '@/web/components/GameSearch'
import { PenLogo } from '@/components/brand/BrandMotion'
import { initMetrika, useMetrikaPageViews } from '@/web/seo'
import { preloadRoutesWhenIdle } from '@/web/prefetch'

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

// Логотип «пишется» в шапке один раз за сеанс (первый заход), дальше — статичный вектор
const INTRO_KEY = 'logo_intro_played'
function shouldPlayIntro(): boolean {
  try {
    if (sessionStorage.getItem(INTRO_KEY)) return false
    sessionStorage.setItem(INTRO_KEY, '1')
    return true
  } catch { return false }
}

function Logo({ intro = false }: { intro?: boolean }) {
  const [play] = useState(() => intro && shouldPlayIntro())
  return (
    <Link to="/" className="flex items-center shrink-0" aria-label={SHOP_NAME}>
      <PenLogo animate={play} className="h-6 md:h-7 w-auto" />
    </Link>
  )
}

function NavItemLink({ item, onClick, className = '' }: { item: NavItem; onClick?: () => void; className?: string }) {
  const base = 'text-sm whitespace-nowrap transition-colors ' + className
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
        <Link to="/profile" onClick={onNavigate} title="Профиль" className="flex items-center gap-2 h-10 rounded-xl pl-1.5 pr-1.5 xl:pr-3 max-md:pr-3 hover:bg-[var(--bg2)] transition-colors">
          <Avatar src={user.photo_url} name={user.first_name} size={28} />
          <span className="text-sm text-[var(--text-2)] max-w-[120px] truncate hidden xl:inline md:max-xl:hidden max-md:inline">{user.first_name}</span>
        </Link>
        <button
          onClick={() => { logout(); onNavigate?.() }}
          title="Выйти"
          aria-label="Выйти"
          className="w-10 h-10 md:max-xl:hidden flex items-center justify-center rounded-xl text-[var(--hint)] hover:text-[var(--text)] hover:bg-[var(--bg2)] transition-colors"
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
      <User size={17} />
      Войти
    </Link>
  )
}

export default function WebLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  // /game/<игра>/<раздел> — та же страница игры: смена раздела не анимирует и не прокручивает наверх
  const pageKey = location.pathname.replace(/^(\/game\/[^/]+)\/[^/]+\/?$/, '$1')
  const { isAuthenticated } = useWebAuth()
  const reduce = useReducedMotion()
  useEffect(() => { initMetrika(); preloadRoutesWhenIdle() }, [])
  useMetrikaPageViews()

  // Новая страница — наверх (кроме якорей вида /#faq)
  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0 })
    setMenuOpen(false)
  }, [pageKey, location.hash])

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[var(--border)]" style={{ background: 'var(--bg)' }}>
        <div className="web-container flex items-center gap-8 h-16">
          <Logo intro />

          <nav className="hidden md:flex items-center gap-5 lg:gap-6">
            {NAV.map((item) => <NavItemLink key={item.href} item={item} />)}
          </nav>

          <div className="hidden md:flex items-center gap-2 ml-auto">
            <GameSearch className="hidden lg:block w-52 xl:w-60" />
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
        className="flex-1 min-h-[calc(100dvh-64px)]"
        key={pageKey}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <Outlet />
      </motion.main>

      <ChatWidget />
      <CookieBanner />

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)] mt-24">
        <div className="web-container py-12 grid grid-cols-2 md:grid-cols-4 gap-10">
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="text-sm text-[var(--hint)] mt-4 leading-relaxed max-w-xs">
              Пополнение игр и цифровых сервисов. Оплата через СБП, банковской картой или криптовалютой.
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
              <li>
                <a href={`${SITE_URL}/app/legal/consent.html`} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--text-2)] hover:text-[var(--text)] transition-colors">
                  Согласие на обработку данных
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-[var(--text)] mb-3">Связь</p>
            <ul className="space-y-2.5">
              <li>
                <button type="button" onClick={() => openChat()} className="text-sm text-[var(--text-2)] hover:text-[var(--text)] transition-colors">
                  Чат с оператором
                </button>
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
