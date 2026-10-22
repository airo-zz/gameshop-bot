// src/pages/HomePage.tsx

import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shield, Star, Crown, Gem } from 'lucide-react'
import { catalogApi, profileApi } from '@/api'
import { useUIStore } from '@/store'
import { useTelegram } from '@/hooks/useTelegram'
import { useDragScroll } from '@/hooks/useDragScroll'
import logoFullSrc from '@/assets/logo-full.png'
import ImageWithSkeleton from '@/components/ui/ImageWithSkeleton'
import { normalizeImageUrl } from '@/utils/imageUrl'
import { NAV_HEIGHT } from '@/components/layout/Layout'

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
          transition: 'transform 0.35s ease',
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
          transition: 'transform 0.35s ease',
        }}
      />
    </svg>
  )
}

function IconSearch() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <path d="M21 21l-4.35-4.35"/>
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

// ── Loyalty icon (index-based, works with any custom level names) ─────────────

function getLevelIcon(idx: number, size = 12) {
  if (idx === 1) return <Star size={size} />
  if (idx === 2) return <Crown size={size} />
  if (idx >= 3) return <Gem size={size} />
  return <Shield size={size} />
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
        background: checked ? 'var(--accent)' : 'rgba(220,235,255,0.14)',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s ease',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 3,
        left: checked ? 19 : 3,
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.2s ease',
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

const SHEET_TRANSITION = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)'

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
    { icon: <IconSparkle />, label: 'Частицы на фоне', toggle: true, toggleKey: 'particles' },
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
      panelRef.current.style.transition = SHEET_TRANSITION
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
      panelRef.current.style.transition = SHEET_TRANSITION
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
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 90,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
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
          background: 'var(--bg2)',
          borderTop: '1px solid var(--border)',
          borderRadius: '20px 20px 0 0',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: SHEET_TRANSITION,
          paddingBottom: `calc(${NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
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
            background: 'rgba(220,235,255,0.18)',
          }} />
        </div>

        {/* Menu items */}
        <div style={{ padding: '8px 0 16px' }}>
          {MENU_GROUPS.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && (
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 16px' }} />
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
                    onTouchStart={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,235,255,0.04)' }}
                    onTouchEnd={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,235,255,0.04)' }}
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
                        background: 'var(--bg3)',
                        color: 'var(--link)',
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
                      <span style={{ color: 'var(--hint)', display: 'flex' }}>
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

  const { user } = useTelegram()
  const displayName = user?.first_name || user?.username || null

  // Particles toggle — глобальное состояние через Zustand (сохраняется в localStorage внутри store)
  const particlesEnabled = useUIStore(s => s.particlesEnabled)
  const setParticlesEnabled = useUIStore(s => s.setParticlesEnabled)

  const handleToggleParticles = (v: boolean) => {
    setParticlesEnabled(v)
  }

  const [homeType, setHomeType] = useState<'game' | 'service'>('game')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const navigating = useRef(false)

  async function handleGameClick(slug: string, specificCatId?: string) {
    if (navigating.current) return
    navigating.current = true
    try {
      const [, cats] = await Promise.all([
        import('@/pages/GamePage'),
        queryClient.fetchQuery({ queryKey: ['categories', slug], queryFn: () => catalogApi.getCategories(slug), staleTime: 5 * 60_000 }),
        queryClient.prefetchQuery({ queryKey: ['games'], queryFn: () => catalogApi.getGames(), staleTime: 5 * 60_000 }),
      ])
      const targetCatId = specificCatId ?? (cats as any[])[0]?.id
      if (targetCatId) {
        await queryClient.prefetchQuery({ queryKey: ['products', targetCatId], queryFn: () => catalogApi.getProducts(targetCatId), staleTime: 2 * 60_000 })
      }
      navigate(specificCatId ? `/catalog/${slug}?cat=${specificCatId}` : `/catalog/${slug}`)
    } finally {
      navigating.current = false
    }
  }

  const { data: games = [] } = useQuery({
    queryKey: ['games', homeType],
    queryFn: () => catalogApi.getGames(homeType),
    staleTime: 5 * 60 * 1000,
  })

  const trendingScrollRef = useRef<HTMLDivElement>(null)
  useDragScroll(trendingScrollRef)
  const [trendingAtEnd, setTrendingAtEnd] = useState(false)

  const { data: trendingCategories = [] } = useQuery({
    queryKey: ['trending-categories'],
    queryFn: catalogApi.getTrendingCategories,
    staleTime: 2 * 60 * 1000,
  })

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.get,
    staleTime: 0,
  })

  useEffect(() => {
    const el = trendingScrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    setTrendingAtEnd(maxScroll <= 0 || el.scrollLeft >= maxScroll - 4)
  }, [trendingCategories.length])

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
        className="z-40"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: 'calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px))',
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
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
          {/* Logo full */}
          <img
            src={logoFullSrc}
            alt="reDonate"
            style={{ height: 26, width: 'auto', display: 'block', flexShrink: 0 }}
          />

          {/* Right actions — поиск + меню */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Link
              to="/search"
              style={{
                width: 44,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                color: 'var(--hint)',
                textDecoration: 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <IconSearch />
            </Link>
            <button
              onClick={() => setMenuOpen(v => !v)}
              style={{
                width: 48,
                height: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                background: menuOpen ? 'var(--bg2)' : 'transparent',
                border: 'none',
                color: menuOpen ? 'var(--text)' : 'var(--hint)',
                cursor: 'pointer',
                transition: 'background 0.15s ease, color 0.15s ease',
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
              fontSize: '1.375rem',
              lineHeight: 1.25,
              letterSpacing: '-0.01em',
              color: 'var(--text)',
            }}
          >
            {displayName ? `Добро пожаловать, ${displayName}!` : 'Добро пожаловать!'}
          </h1>

          {profile && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {/* Баланс */}
              <Link
                to="/balance"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 12px 4px 10px',
                  borderRadius: 999,
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text)',
                  textDecoration: 'none',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--link)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                {Number(profile.balance).toLocaleString('ru')} ₽
              </Link>
              {/* Уровень лояльности */}
              {(() => {
                const loyaltyColor = profile.loyalty_color_hex ?? '#CD7F32'
                return (
                  <Link
                    to="/profile"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '4px 12px 4px 8px',
                      borderRadius: 999,
                      background: `${loyaltyColor}1A`,
                      border: '1px solid transparent',
                      fontSize: 12,
                      fontWeight: 600,
                      color: loyaltyColor,
                      textDecoration: 'none',
                    }}
                  >
                    <span style={{ display: 'flex', flexShrink: 0 }}>
                      {getLevelIcon(profile.loyalty_levels.findIndex(l => l.name === profile.loyalty_level_name))}
                    </span>
                    {profile.loyalty_level_name || 'Базовый'}
                  </Link>
                )
              })()}
            </div>
          )}
        </div>

        {/* ── Trending categories ───────────────────────────────────────────── */}
        <section className="mt-2 mb-8">
          <h2 style={{ margin: '0 0 12px', fontWeight: 600, fontSize: '1.0625rem', color: 'var(--text)' }}>
            Популярное
          </h2>

          <div
            ref={trendingScrollRef}
            onScroll={() => {
              const el = trendingScrollRef.current
              if (!el) return
              const maxScroll = el.scrollWidth - el.clientWidth
              setTrendingAtEnd(el.scrollLeft >= maxScroll - 4)
            }}
            style={{
              display: 'flex', gap: 12, overflowX: 'auto',
              paddingBottom: 6,
              marginLeft: -16, marginRight: -16,
              paddingLeft: 16, paddingRight: 16,
              scrollbarWidth: 'none', msOverflowStyle: 'none',
              WebkitMaskImage: trendingAtEnd
                ? 'none'
                : 'linear-gradient(to right, black 0%, black 72%, transparent 100%)',
              maskImage: trendingAtEnd
                ? 'none'
                : 'linear-gradient(to right, black 0%, black 72%, transparent 100%)',
            } as React.CSSProperties}
          >
            {trendingCategories.map(cat => {
              const imgSrc = normalizeImageUrl(cat.game_image_url)
              return (
                <div
                  key={cat.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleGameClick(cat.game_slug, cat.id)}
                  onTouchStart={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85' }}
                  onTouchEnd={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                  style={{
                    minWidth: 160,
                    height: 100,
                    borderRadius: 16,
                    flexShrink: 0,
                    textDecoration: 'none',
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    padding: '0 14px 12px',
                    position: 'relative',
                    overflow: 'hidden',
                    WebkitTapHighlightColor: 'transparent',
                  cursor: 'pointer',
                  }}
                >
                  {/* Game image — смещена вправо */}
                  {imgSrc && (
                    <img
                      src={imgSrc}
                      alt=""
                      style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        width: '100%', height: '100%',
                        objectFit: 'cover',
                        objectPosition: 'right center',
                        opacity: 0.6,
                        pointerEvents: 'none',
                        userSelect: 'none',
                      }}
                    />
                  )}
                  {/* Затемнение под текст: слева цвет карточки, справа видно фото */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(to right, #101C36 0%, rgba(16,28,54,0.8) 50%, rgba(16,28,54,0.1) 100%)' }} />
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)', position: 'relative', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {cat.name}
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--hint)', position: 'relative', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {cat.game_name}
                  </p>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Games section ────────────────────────────────────────────────── */}
        {/* ── Games horizontal scroll ──────────────────────────────────────── */}
        <section>
          {/* Открыть полный каталог */}
          <Link
            to="/catalog"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderRadius: 14,
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              textDecoration: 'none',
              marginBottom: 12,
              WebkitTapHighlightColor: 'transparent',
            }}
            onTouchStart={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg3)' }}
            onTouchEnd={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg2)' }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Открыть полный каталог</span>
            <span style={{ color: 'var(--hint)', display: 'flex' }}><IconChevronRight /></span>
          </Link>

          {/* Segment control */}
          <div
            className="flex p-1 rounded-2xl"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', marginBottom: 12 }}
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
                      style={{ background: 'var(--bg3)', zIndex: -1 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                    />
                  )}
                  {tab.label}
                </button>
              )
            })}
          </div>

          {games.length > 0 && <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
              }}
            >
              {games.map(game => (
                <div
                  key={game.id}
                  onClick={() => handleGameClick(game.slug)}
                  className="active:opacity-80"
                  style={{
                    borderRadius: 14,
                    overflow: 'hidden',
                    border: '1px solid var(--border)',
                    display: 'block',
                    background: 'var(--bg2)',
                    transition: 'opacity 0.1s ease',
                    cursor: 'pointer',
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
                          background: 'var(--bg2)',
                          color: 'var(--hint)',
                        }}
                      >
                        <IconGamepadSmall />
                      </div>
                    }
                  />
                  <div style={{ padding: '7px 6px 9px' }}>
                    <p
                      style={{
                        margin: 0,
                        textAlign: 'center',
                        fontSize: 12,
                        fontWeight: 500,
                        color: 'var(--text)',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {game.name}
                    </p>
                  </div>
                </div>
              ))}
            </div>}
        </section>

        {/* ── Open catalog CTA ─────────────────────────────────────────── */}
        <div className="mt-5">
          <Link
            to="/catalog"
            className="btn-primary"
            style={{ textDecoration: 'none' }}
          >
            Открыть весь каталог
          </Link>
        </div>

        {/* ── «Не нашли свою игру?» — заявка в чат ──────────────────────── */}
        <Link
          to="/custom-order?type=missing_game"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, marginTop: 12,
            padding: '12px 14px', borderRadius: 14, textDecoration: 'none',
            background: 'var(--bg2)', border: '1px solid var(--border)',
          }}
        >
          <span style={{ color: 'var(--link)', display: 'flex', flexShrink: 0 }}><IconSupport /></span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              Не нашли свою игру?
            </span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--hint)', marginTop: 2 }}>
              Напишите нам — договоримся и соберём индивидуально
            </span>
          </span>
          <span style={{ color: 'var(--hint)', display: 'flex' }}><IconChevronRight /></span>
        </Link>

      </div>
    </div>
  )
}
