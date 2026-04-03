// src/pages/HomePage.tsx
import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { catalogApi, profileApi } from '@/api'
import { useShopStore } from '@/store'
import { useTelegram } from '@/hooks/useTelegram'

// ── Inline SVG icons ─────────────────────────────────────────────────────────

function IconGamepadLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="12" rx="5" />
      <path d="M7 13v-2m0 2v2m0-2h2m-2 0H5" stroke="white" />
      <circle cx="16" cy="12" r="1.2" fill="white" stroke="none" />
      <circle cx="18.5" cy="14" r="1.2" fill="white" stroke="none" />
    </svg>
  )
}

function IconGamepadSmall() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="8" width="20" height="10" rx="5" />
      <path d="M7 12v-2m0 2v2m0-2h2m-2 0H5" />
      <circle cx="16" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="13" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6"  x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function IconBell() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function IconZap() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
  )
}

// ── Menu groups ───────────────────────────────────────────────────────────────

const MENU_GROUPS = [
  [
    { emoji: '🏠', label: 'Главная',   path: '/' },
    { emoji: '🎮', label: 'Каталог',   path: '/catalog' },
  ],
  [
    { emoji: '🛒', label: 'Корзина',   path: '/cart' },
    { emoji: '📋', label: 'Заказы',    path: '/orders' },
    { emoji: '👤', label: 'Профиль',   path: '/profile' },
  ],
  [
    { emoji: '🆘', label: 'Поддержка', path: '/support' },
  ],
]

// ── Dropdown Menu ─────────────────────────────────────────────────────────────

interface DropdownMenuProps {
  open: boolean
  onClose: () => void
}

function DropdownMenu({ open, onClose }: DropdownMenuProps) {
  const navigate = useNavigate()
  const handleNav = (path: string) => { onClose(); navigate(path) }

  return (
    <div
      style={{
        position: 'absolute',
        top: 'calc(100% + 10px)',
        right: 0,
        minWidth: 220,
        background: 'rgba(10,10,22,0.97)',
        border: '1px solid rgba(124,58,237,0.3)',
        borderRadius: 20,
        boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(124,58,237,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        overflow: 'hidden',
        zIndex: 100,
        opacity: open ? 1 : 0,
        transform: open ? 'translateY(0) scale(1)' : 'translateY(-10px) scale(0.96)',
        transformOrigin: 'top right',
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 0.2s cubic-bezier(0.4,0,0.2,1), transform 0.2s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {/* Caret arrow */}
      <div style={{
        position: 'absolute',
        top: -6,
        right: 14,
        width: 12,
        height: 6,
        overflow: 'hidden',
      }}>
        <div style={{
          width: 12,
          height: 12,
          background: 'rgba(10,10,22,0.97)',
          border: '1px solid rgba(124,58,237,0.3)',
          transform: 'rotate(45deg)',
          transformOrigin: 'center',
          marginTop: 6,
        }} />
      </div>

      {MENU_GROUPS.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && (
            <div style={{ height: 1, background: 'rgba(124,58,237,0.12)', margin: '0 12px' }} />
          )}
          {group.map((item) => (
            <button
              key={item.path}
              onClick={() => handleNav(item.path)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                height: 50,
                padding: '0 16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124,58,237,0.1)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
              onTouchStart={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124,58,237,0.14)' }}
              onTouchEnd={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
            >
              <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, width: 24, textAlign: 'center' }}>
                {item.emoji}
              </span>
              <span style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em' }}>
                {item.label}
              </span>
              <span style={{ color: 'rgba(167,139,250,0.4)', display: 'flex' }}>
                <IconChevronRight />
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const shopName = useShopStore(s => s.name)
  const { user } = useTelegram()
  const displayName = user?.first_name || user?.username || null

  const { data: games = [], isLoading: gamesLoading } = useQuery({
    queryKey: ['games'],
    queryFn: catalogApi.getGames,
  })

  const { data: featured = [] } = useQuery({
    queryKey: ['featured'],
    queryFn: () => catalogApi.search('', 0),
  })

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.get,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>

      {/* ── Fixed header ────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-40 animate-slide-down"
        style={{
          background: 'rgba(8,8,16,0.9)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            height: 56,
          }}
        >
          {/* Logo + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                border: '1px solid rgba(167,139,250,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 0 16px rgba(124,58,237,0.4)',
              }}
            >
              <IconGamepadLogo />
            </div>
            <span
              style={{
                fontWeight: 700,
                fontSize: '1.05rem',
                letterSpacing: '-0.01em',
                background: 'linear-gradient(135deg, #ffffff, #c4b5fd)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {shopName}
            </span>
          </div>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              style={{
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.45)',
                cursor: 'pointer',
              }}
            >
              <IconBell />
            </button>

            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                style={{
                  width: 40,
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 12,
                  background: menuOpen ? 'rgba(124,58,237,0.15)' : 'none',
                  border: menuOpen ? '1px solid rgba(124,58,237,0.3)' : '1px solid transparent',
                  color: menuOpen ? '#a78bfa' : 'rgba(255,255,255,0.45)',
                  cursor: 'pointer',
                  transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                }}
              >
                <IconMenu />
              </button>
              <DropdownMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4">

        {/* ── Hero greeting — одна строка, одинаковый размер ──────────────── */}
        <div className="pt-5 pb-4 animate-fade-in">
          <h1
            style={{
              margin: 0,
              fontWeight: 700,
              fontSize: '1.3rem',
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              background: 'linear-gradient(135deg, #ffffff 0%, #c4b5fd 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {displayName ? `Добро пожаловать, ${displayName}!` : 'Добро пожаловать!'}
          </h1>

          {/* Loyalty badge */}
          {profile && (
            <div style={{ marginTop: 10 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 12px 3px 8px',
                  borderRadius: 999,
                  background: 'rgba(124,58,237,0.15)',
                  border: '1px solid rgba(124,58,237,0.3)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#c4b5fd',
                }}
              >
                <span style={{ fontSize: 13 }}>
                  {profile.loyalty_level_emoji || '⭐'}
                </span>
                {profile.loyalty_level_name || 'Базовый'}
              </span>
            </div>
          )}
        </div>

        {/* ── Games horizontal scroll — крупные карточки ──────────────────── */}
        <section className="mb-5 animate-fade-in delay-150">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: '1rem',
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <span style={{ color: '#a78bfa', display: 'flex' }}>
                <IconGamepadSmall />
              </span>
              Игры
            </h2>
            <Link
              to="/catalog"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 13,
                fontWeight: 500,
                color: '#a78bfa',
                textDecoration: 'none',
              }}
            >
              Все
              <IconChevronRight />
            </Link>
          </div>

          <div
            className="no-scrollbar"
            style={{
              display: 'flex',
              gap: 12,
              overflowX: 'auto',
              marginLeft: -16,
              marginRight: -16,
              paddingLeft: 16,
              paddingRight: 16,
              paddingBottom: 4,
            }}
          >
            {gamesLoading
              ? Array(5).fill(0).map((_, i) => (
                  <div
                    key={i}
                    className="skeleton flex-shrink-0"
                    style={{ width: 110, height: 138, borderRadius: 18 }}
                  />
                ))
              : games.map(game => (
                  <Link
                    key={game.id}
                    to={`/catalog/${game.slug}`}
                    className="flex-shrink-0 active:scale-95 transition-transform"
                    style={{
                      width: 110,
                      borderRadius: 18,
                      overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.07)',
                      textDecoration: 'none',
                      display: 'block',
                      background: 'var(--bg2)',
                    }}
                  >
                    <div
                      style={{
                        width: 110,
                        height: 110,
                        background: 'var(--bg3)',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      {game.image_url ? (
                        <img
                          src={game.image_url}
                          alt={game.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, #12121f, #1a1a2e)',
                            color: 'rgba(167,139,250,0.5)',
                          }}
                        >
                          <IconGamepadSmall />
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '6px 6px 9px', background: 'var(--bg2)' }}>
                      <p
                        style={{
                          margin: 0,
                          textAlign: 'center',
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'rgba(255,255,255,0.75)',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {game.name}
                      </p>
                    </div>
                  </Link>
                ))
            }
          </div>
        </section>

        {/* ── Featured products — компактный список ───────────────────────── */}
        <section className="animate-fade-in delay-225">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: '1rem',
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <span style={{ color: '#fbbf24', display: 'flex' }}>
                <IconZap />
              </span>
              Популярное
            </h2>
            <Link
              to="/catalog"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 13,
                fontWeight: 500,
                color: '#a78bfa',
                textDecoration: 'none',
              }}
            >
              Все
              <IconChevronRight />
            </Link>
          </div>

          {featured.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {featured.slice(0, 6).map((product, i) => {
                const minPrice = product.lots.length
                  ? Math.min(...product.lots.map((l: { price: number }) => l.price))
                  : product.price
                return (
                  <Link
                    key={product.id}
                    to={`/product/${product.id}`}
                    className={`animate-fade-in delay-${Math.min(i * 50, 300)}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      background: 'var(--bg2)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 16,
                      textDecoration: 'none',
                      transition: 'transform 0.15s',
                    }}
                  >
                    {/* Thumbnail */}
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 10,
                        overflow: 'hidden',
                        flexShrink: 0,
                        background: 'var(--bg3)',
                      }}
                    >
                      {product.images?.[0] ? (
                        <img
                          src={product.images[0]}
                          alt={product.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, #12121f, #1a1a2e)',
                            color: 'rgba(167,139,250,0.4)',
                          }}
                        >
                          <IconGamepadSmall />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'rgba(255,255,255,0.9)',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {product.name}
                      </p>
                      <p
                        style={{
                          margin: '2px 0 0',
                          fontSize: 12,
                          fontWeight: 700,
                          background: 'linear-gradient(135deg, #a78bfa, #818cf8)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text',
                        }}
                      >
                        от {minPrice.toLocaleString('ru')} ₽
                      </p>
                    </div>

                    {/* Arrow */}
                    <span style={{ color: 'rgba(167,139,250,0.4)', display: 'flex', flexShrink: 0 }}>
                      <IconChevronRight />
                    </span>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array(4).fill(0).map((_, i) => (
                <div key={i} className="skeleton rounded-2xl" style={{ height: 68 }} />
              ))}
            </div>
          )}
        </section>

        {/* ── Open catalog CTA ─────────────────────────────────────────── */}
        <div className="mt-5 animate-fade-in delay-300">
          <Link
            to="/catalog"
            className="btn-primary"
            style={{ textDecoration: 'none' }}
          >
            Открыть весь каталог
          </Link>
        </div>

      </div>
    </div>
  )
}
