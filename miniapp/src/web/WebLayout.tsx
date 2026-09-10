/**
 * src/web/WebLayout.tsx
 * Шелл публичного сайта: адаптивный хедер (десктоп-меню + мобильный бургер)
 * и футер. Контент рендерится через <Outlet/>.
 */

import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Menu, X, Send } from 'lucide-react'
import { SHOP_NAME, MINIAPP_URL, SUPPORT_BOT_URL, SITE_URL } from '@/config/appTarget'

interface NavItem {
  label: string
  href: string
  external?: boolean
}

const NAV: NavItem[] = [
  { label: 'Каталог', href: '/catalog' },
  { label: 'Как это работает', href: '/#how' },
  { label: 'Вопросы', href: '/#faq' },
  { label: 'Поддержка', href: SUPPORT_BOT_URL, external: true },
]

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 shrink-0">
      <span
        className="text-xl font-extrabold tracking-tight"
        style={{ background: 'var(--gradient-gaming)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
      >
        {SHOP_NAME}
      </span>
    </Link>
  )
}

function TelegramCta({ className = '' }: { className?: string }) {
  return (
    <a
      href={MINIAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={
        'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.97] hover:brightness-110 ' +
        className
      }
      style={{ background: 'var(--gradient-primary)' }}
    >
      <Send size={16} />
      Открыть в Telegram
    </a>
  )
}

export default function WebLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  // Ссылка навигации: якоря работают на главной, внешние — открываются в новой вкладке.
  function renderNavLink(item: NavItem, onClick?: () => void) {
    if (item.external) {
      return (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
          className="text-sm text-white/60 hover:text-white transition-colors"
        >
          {item.label}
        </a>
      )
    }
    return (
      <Link
        key={item.href}
        to={item.href}
        onClick={onClick}
        className="text-sm text-white/60 hover:text-white transition-colors"
      >
        {item.label}
      </Link>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 border-b border-white/[0.06] backdrop-blur-xl"
        style={{ background: 'rgba(1,5,9,0.72)' }}
      >
        <div className="web-container flex items-center justify-between h-16">
          <Logo />

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7">
            {NAV.map((item) => renderNavLink(item))}
          </nav>

          <div className="hidden md:block">
            <TelegramCta />
          </div>

          {/* Mobile burger */}
          <button
            className="md:hidden p-2 rounded-lg text-white/70 hover:bg-white/[0.06] transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Меню"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-white/[0.06]" style={{ background: 'var(--bg)' }}>
            <div className="web-container py-4 flex flex-col gap-4">
              {NAV.map((item) => renderNavLink(item, () => setMenuOpen(false)))}
              <TelegramCta className="w-full justify-center" />
            </div>
          </div>
        )}
      </header>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <main className="flex-1" key={location.pathname}>
        <Outlet />
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] mt-20">
        <div className="web-container py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="text-sm text-white/40 mt-3 leading-relaxed">
              Магазин игрового доната. Быстро, безопасно, с поддержкой 24/7.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Навигация</h4>
            <ul className="space-y-2">
              {NAV.map((item) => (
                <li key={item.href}>{renderNavLink(item)}</li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Документы</h4>
            <ul className="space-y-2">
              <li>
                <a href={`${SITE_URL}/app/legal/terms.html`} target="_blank" rel="noopener noreferrer" className="text-sm text-white/60 hover:text-white transition-colors">
                  Условия использования
                </a>
              </li>
              <li>
                <a href={`${SITE_URL}/app/legal/privacy.html`} target="_blank" rel="noopener noreferrer" className="text-sm text-white/60 hover:text-white transition-colors">
                  Политика конфиденциальности
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Связь</h4>
            <TelegramCta className="w-full justify-center" />
          </div>
        </div>

        <div className="border-t border-white/[0.05]">
          <div className="web-container py-5 text-xs text-white/30">
            © {new Date().getFullYear()} {SHOP_NAME}. Все права защищены.
          </div>
        </div>
      </footer>
    </div>
  )
}
