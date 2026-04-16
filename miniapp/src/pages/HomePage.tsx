// src/pages/HomePage.tsx
import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Star, Crown, Gem } from 'lucide-react'
import { catalogApi, profileApi } from '@/api'
import { getLoyaltyColor, getLoyaltyIconName } from '@/utils/loyalty'
import { useShopStore, useUIStore } from '@/store'
import { useTelegram } from '@/hooks/useTelegram'
import logoSrc from '@/assets/logo.png'
import ImageWithSkeleton from '@/components/ui/ImageWithSkeleton'

// ── Inline SVG icons ─────────────────────────────────────────────────────────

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

function IconMenu({ open }: { open: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line
        x1="3" y1="6" x2="21" y2="6"
        style={{
          transformBox: 'fill-box' as any,
          transformOrigin: 'center',
          transform: open ? 'translateY(6px) rotate(45deg)' : 'translateY(0) rotate(0deg)',
          transition: 'transform 0.35s cubic-bezier(0.34, 1.2, 0.64, 1)',
        }}
      />
      <line
        x1="3" y1="12" x2="21" y2="12"
        style={{
          transformBox: 'fill-box' as any,
          transformOrigin: 'center',
          transform: open ? 'scaleX(0)' : 'scaleX(1)',
          opacity: open ? 0 : 1,
          transition: 'transform 0.25s ease, opacity 0.2s ease',
        }}
      />
      <line
        x1="3" y1="18" x2="21" y2="18"
        style={{
          transformBox: 'fill-box' as any,
          transformOrigin: 'center',
          transform: open ? 'translateY(-6px) rotate(-45deg)' : 'translateY(0) rotate(0deg)',
          transition: 'transform 0.35s cubic-bezier(0.34, 1.2, 0.64, 1)',
        }}
      />
    </svg>
  )
}

function IconZap() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
  )
}

// ── Icons для меню (lucide-style inline) ──────────────────────────────────────

function IconHome() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function IconCatalog() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="12" rx="5" />
      <path d="M7 13v-2m0 2v2m0-2h2m-2 0H5" />
      <circle cx="16" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="14" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconCart() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  )
}

function IconOrders() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function IconProfile() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function IconSupport() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconSparkle() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  )
}

// ── Loyalty icon helper ───────────────────────────────────────────────────────

function getLoyaltyIcon(levelName: string | null) {
  const iconName = getLoyaltyIconName(levelName)
  switch (iconName) {
    case 'Star':    return <Star size={12} />
    case 'Crown':   return <Crown size={12} />
    case 'Gem':     return <Gem size={12} />
    default:        return <Shield size={12} />
  }
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={e => { e.stopPropagation(); onChange(!checked) }}
      style={{
        width: 38,
        height: 22,
        borderRadius: 11,
        background: checked ? 'rgba(45,88,173,0.85)' : 'rgba(255,255,255,0.12)',
        border: checked ? '1px solid rgba(107,157,232,0.5)' : '1px solid rgba(255,255,255,0.1)',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s, border-color 0.2s',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 2,
        left: checked ? 18 : 2,
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }} />
    </div>
  )
}

// ── Menu config ───────────────────────────────────────────────────────────────

interface MenuItem {
  icon: React.ReactNode
  label: string
  path?: string
  toggle?: boolean
  toggleKey?: string
}

// ── Menu Sheet (bottom sheet) ─────────────────────────────────────────────────

interface MenuSheetProps {
  open: boolean
  onClose: () => void
  particlesEnabled: boolean
  onToggleParticles: (v: boolean) => void
}

const MENU_GROUPS: MenuItem[][] = [
  [
    { icon: <IconHome />,    label: 'Главная',   path: '/' },
    { icon: <IconCatalog />, label: 'Каталог',   path: '/catalog' },
  ],
  [
    { icon: <IconCart />,    label: 'Корзина',   path: '/cart' },
    { icon: <IconOrders />,  label: 'Заказы',    path: '/orders' },
    { icon: <IconProfile />, label: 'Профиль',   path: '/profile' },
  ],
  [
    { icon: <IconSupport />, label: 'Поддержка', path: '/support' },
    { icon: <IconSparkle />, label: 'Эффекты частиц', toggle: true, toggleKey: 'particles' },
  ],
]

function MenuSheet({ open, onClose, particlesEnabled, onToggleParticles }: MenuSheetProps) {
  const navigate = useNavigate()
  const handleNav = (path: string) => { onClose(); navigate(path) }
  const touchStartY = useRef<number>(0)
  const dragDelta = useRef<number>(0)
  const panelRef = useRef<HTMLDivElement>(null)

  // Lock scroll while sheet is open
  useEffect(() => {
    const main = document.querySelector('main') as HTMLElement | null
    if (open) {
      if (main) main.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
    } else {
      if (main) main.style.overflow = ''
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
    }
    return () => {
      if (main) main.style.overflow = ''
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
    }
  }, [open])

  // Reset panel transform when open state changes
  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
      panelRef.current.style.transform = open ? 'translateY(0)' : 'translateY(100%)'
    }
  }, [open])

  const handleDragStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    dragDelta.current = 0
    if (panelRef.current) panelRef.current.style.transition = 'none'
  }

  const handleDragMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - touchStartY.current
    if (delta < 0) return
    dragDelta.current = delta
    if (panelRef.current) panelRef.current.style.transform = `translateY(${delta}px)`
  }

  const handleDragEnd = () => {
    if (panelRef.current) {
      panelRef.current.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
    }
    if (dragDelta.current > 80) {
      onClose()
    } else {
      if (panelRef.current) panelRef.current.style.transform = 'translateY(0)'
    }
    dragDelta.current = 0
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 90,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 91,
          background: 'rgba(16,14,38,0.97)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(45,88,173,0.28)',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(45,88,173,0.06)',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Drag handle — swipe down here to close */}
        <div
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
          style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 12, cursor: 'grab' }}
        >
          <div style={{
            width: 36,
            height: 4,
            borderRadius: 99,
            background: 'rgba(255,255,255,0.18)',
          }} />
        </div>

        {/* Menu items */}
        <div style={{ padding: '8px 0 16px' }}>
          {MENU_GROUPS.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && (
                <div style={{ height: 1, background: 'rgba(45,88,173,0.15)', margin: '4px 16px' }} />
              )}
              {group.map((item) => {
                const isToggle = !!item.toggle
                const checked = item.toggleKey === 'particles' ? particlesEnabled : false

                return (
                  <button
                    key={item.label}
                    onClick={() => {
                      if (isToggle) {
                        if (item.toggleKey === 'particles') onToggleParticles(!checked)
                      } else if (item.path) {
                        handleNav(item.path)
                      }
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      minHeight: 52,
                      padding: '0 20px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text)',
                      transition: 'background 0.15s',
                    }}
                    onTouchStart={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(45,88,173,0.12)' }}
                    onTouchEnd={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(45,88,173,0.10)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        background: 'rgba(107,157,232,0.10)',
                        border: '1px solid rgba(107,157,232,0.15)',
                        color: '#6b9de8',
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </span>
                    <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em' }}>
                      {item.label}
                    </span>
                    {isToggle ? (
                      <ToggleSwitch checked={checked} onChange={v => {
                        if (item.toggleKey === 'particles') onToggleParticles(v)
                      }} />
                    ) : (
                      <span style={{ color: 'rgba(107,157,232,0.35)', display: 'flex' }}>
                        <IconChevronRight />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const shopName = useShopStore(s => s.name)
  const { user } = useTelegram()
  const displayName = user?.first_name || user?.username || null

  // Particles toggle — глобальное состояние через Zustand (сохраняется в localStorage внутри store)
  const particlesEnabled = useUIStore(s => s.particlesEnabled)
  const setParticlesEnabled = useUIStore(s => s.setParticlesEnabled)

  const handleToggleParticles = (v: boolean) => {
    setParticlesEnabled(v)
  }

  const [homeType, setHomeType] = useState<'game' | 'service'>('game')

  const { data: games = [], isLoading: gamesLoading } = useQuery({
    queryKey: ['games', homeType],
    queryFn: () => catalogApi.getGames(homeType),
    staleTime: 5 * 60 * 1000,
  })

  const { data: featured = [] } = useQuery({
    queryKey: ['trending'],
    queryFn: catalogApi.getTrending,
    staleTime: 2 * 60 * 1000,
  })

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.get,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>

      {/* ── Bottom sheet menu ───────────────────────────────────────────── */}
      <MenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        particlesEnabled={particlesEnabled}
        onToggleParticles={handleToggleParticles}
      />

      {/* ── Fixed header ────────────────────────────────────────────────── */}
      <div
        className="z-40 animate-slide-down"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: 'calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px))',
          background: 'rgba(12,11,29,0.92)',
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
            <img
              src={logoSrc}
              alt="logo"
              style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'block' }}
            />
            <span
              style={{
                fontWeight: 800,
                fontSize: '1.5rem',
                letterSpacing: '-0.01em',
                background: 'linear-gradient(135deg, #ffffff, #93b8f0)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {shopName}
            </span>
          </div>

          {/* Right actions — только меню */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              style={{
                width: 48,
                height: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                background: menuOpen ? 'rgba(45,88,173,0.18)' : 'transparent',
                border: menuOpen ? '1px solid rgba(45,88,173,0.38)' : '1px solid transparent',
                color: menuOpen ? '#6b9de8' : 'rgba(255,255,255,0.6)',
                cursor: 'pointer',
                transition: 'background 0.2s, border-color 0.2s, color 0.2s',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <IconMenu open={menuOpen} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4" style={{ paddingTop: 56 }}>

        {/* ── Hero greeting ────────────────────────────────────────────────── */}
        <div className="pt-5 pb-4">
          <h1
            style={{
              margin: 0,
              fontWeight: 700,
              fontSize: '1.6rem',
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              background: 'linear-gradient(135deg, #ffffff 0%, #93b8f0 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {displayName ? `Добро пожаловать, ${displayName}!` : 'Добро пожаловать!'}
          </h1>

          {profile && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {/* Баланс */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 12px 4px 10px',
                  borderRadius: 999,
                  background: 'rgba(45,88,173,0.16)',
                  border: '1px solid rgba(45,88,173,0.32)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#93b8f0',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#93b8f0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                {Number(profile.balance).toLocaleString('ru')} ₽
              </span>
              {/* Уровень лояльности */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 12px 4px 8px',
                  borderRadius: 999,
                  background: `${getLoyaltyColor(profile.loyalty_level_name ?? null)}22`,
                  border: `1px solid ${getLoyaltyColor(profile.loyalty_level_name ?? null)}44`,
                  fontSize: 12,
                  fontWeight: 600,
                  color: getLoyaltyColor(profile.loyalty_level_name ?? null),
                }}
              >
                <span style={{ display: 'flex', width: 13, height: 13, flexShrink: 0, color: getLoyaltyColor(profile.loyalty_level_name ?? null) }}>
                  {getLoyaltyIcon(profile.loyalty_level_name ?? null)}
                </span>
                {profile.loyalty_level_name || 'Базовый'}
              </span>
            </div>
          )}
        </div>

        {/* ── Featured products ────────────────────────────────────────────── */}
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(45,88,173,0.2) 30%, rgba(45,88,173,0.2) 70%, transparent)', marginBottom: 24 }} />
        <section className="mb-8">
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
                fontSize: '1.05rem',
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
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
                color: '#6b9de8',
                textDecoration: 'none',
              }}
            >
              Все
              <IconChevronRight />
            </Link>
          </div>

          {featured.length > 0 ? (
            <div style={{ background: 'var(--bg2)', borderRadius: 12, overflow: 'hidden' }}>
              {featured.slice(0, 6).map((product, i) => (
                <Link
                  key={product.id}
                  to={product.game_slug ? `/catalog/${product.game_slug}` : `/product/${product.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 16px',
                    height: 64,
                    textDecoration: 'none',
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    transition: 'background 0.15s',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                  onTouchStart={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
                  onTouchEnd={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {product.name}
                    </p>
                    {product.game_name && (
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--hint)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {product.game_name}
                      </p>
                    )}
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.2)', display: 'flex', flexShrink: 0, marginLeft: 8 }}>
                    <IconChevronRight />
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
        </section>

        {/* ── Games horizontal scroll ──────────────────────────────────────── */}
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(45,88,173,0.2) 30%, rgba(45,88,173,0.2) 70%, transparent)', marginBottom: 24 }} />
        <section>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            {/* Segment control */}
            <div
              className="flex flex-1 p-1 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', marginRight: 12 }}
            >
              {([
                { value: 'game' as const, label: 'Игры' },
                { value: 'service' as const, label: 'Сервисы' },
              ]).map(tab => {
                const isActive = homeType === tab.value
                return (
                  <button
                    key={tab.value}
                    onClick={() => setHomeType(tab.value)}
                    className="relative flex-1 flex items-center justify-center rounded-xl py-2 text-sm font-semibold transition-colors"
                    style={{
                      color: isActive ? 'var(--text)' : 'var(--hint)',
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      zIndex: 1,
                    }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="home-tab-pill"
                        className="absolute inset-0 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.1)', zIndex: -1 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      />
                    )}
                    {tab.label}
                  </button>
                )
              })}
            </div>

            <Link
              to="/catalog"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 13,
                fontWeight: 500,
                color: '#6b9de8',
                textDecoration: 'none',
              }}
            >
              Все
              <IconChevronRight />
            </Link>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={homeType}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
              }}
            >
              {games.map(game => (
                    <Link
                      key={game.id}
                      to={`/catalog/${game.slug}`}
                      className="active:scale-95 transition-transform"
                      style={{
                        borderRadius: 18,
                        overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.08)',
                        textDecoration: 'none',
                        display: 'block',
                        background: 'rgba(12,11,26,0.50)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                      }}
                    >
                      <ImageWithSkeleton
                        src={game.image_url}
                        alt={game.name}
                        aspectRatio="1 / 1"
                        objectFit="cover"
                        loading="lazy"
                        style={{ width: '100%' }}
                        fallback={
                          <div
                            style={{
                              width: '100%',
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'linear-gradient(135deg, #060f1e, #0a1428)',
                              color: 'rgba(107,157,232,0.5)',
                            }}
                          >
                            <IconGamepadSmall />
                          </div>
                        }
                      />
                      <div style={{ padding: '6px 6px 9px', background: 'rgba(8,7,20,0.6)', borderTop: '1px solid rgba(45,88,173,0.15)' }}>
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
            </motion.div>
          </AnimatePresence>
        </section>

        {/* ── Open catalog CTA ─────────────────────────────────────────── */}
        <div className="mt-5">
          <Link
            to="/catalog"
            className="btn-primary"
            style={{ textDecoration: 'none', boxShadow: '0 0 24px rgba(45,88,173,0.45), 0 4px 24px rgba(45,88,173,0.3)' }}
          >
            Открыть весь каталог
          </Link>
        </div>

      </div>
    </div>
  )
}
