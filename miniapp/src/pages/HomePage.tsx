// src/pages/HomePage.tsx

import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { Icon as PhIcon } from '@phosphor-icons/react'
import {
  CaretRightIcon, ChatCenteredTextIcon, GameControllerIcon, HeadsetIcon, HouseIcon, ListIcon,
  MagnifyingGlassIcon, ReceiptIcon, ShoppingCartIcon, SquaresFourIcon, UserIcon, WalletIcon, XIcon,
} from '@phosphor-icons/react'
import { catalogApi, profileApi } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'
import { useDragScroll } from '@/hooks/useDragScroll'
import logoFullSrc from '@/assets/logo-full.png'
import ImageWithSkeleton from '@/components/ui/ImageWithSkeleton'
import { normalizeImageUrl } from '@/utils/imageUrl'
import { NAV_HEIGHT } from '@/components/layout/Layout'
import { fmtNum } from '@/utils/format'

const fmt = fmtNum

// ── Menu Sheet (bottom sheet) ─────────────────────────────────────────────────

const SHEET_TRANSITION = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)'

const MENU_GROUPS: { Icon: PhIcon; label: string; path: string }[][] = [
  [
    { Icon: HouseIcon,        label: 'Главная',   path: '/' },
    { Icon: SquaresFourIcon,  label: 'Каталог',   path: '/catalog' },
  ],
  [
    { Icon: ShoppingCartIcon, label: 'Корзина',   path: '/cart' },
    { Icon: ReceiptIcon,      label: 'Заказы',    path: '/orders' },
    { Icon: UserIcon,         label: 'Профиль',   path: '/profile' },
  ],
  [
    { Icon: HeadsetIcon,      label: 'Поддержка', path: '/support' },
  ],
]

function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const handleNav = (path: string) => { onClose(); navigate(path) }
  const touchStartY = useRef<number>(0)
  const dragDelta = useRef<number>(0)
  const panelRef = useRef<HTMLDivElement>(null)

  // Lock scroll while sheet is open
  useEffect(() => {
    const main = document.querySelector('main') as HTMLElement | null
    const value = open ? 'hidden' : ''
    if (main) main.style.overflow = value
    document.body.style.overflow = value
    document.documentElement.style.overflow = value
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
    if (panelRef.current) panelRef.current.style.transition = SHEET_TRANSITION
    if (dragDelta.current > 80) onClose()
    else if (panelRef.current) panelRef.current.style.transform = 'translateY(0)'
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
          background: 'rgba(0,0,0,0.55)',
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
          borderRadius: 'var(--r-sheet) var(--r-sheet) 0 0',
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
          style={{ display: 'flex', justifyContent: 'center', padding: '12px 0', cursor: 'grab' }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 99, background: 'rgba(220,235,255,0.16)' }} />
        </div>

        <div style={{ padding: '4px 0 12px' }}>
          {MENU_GROUPS.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '6px 20px' }} />}
              {group.map(({ Icon, label, path }) => (
                <button
                  key={label}
                  onClick={() => handleNav(path)}
                  className="active:bg-[var(--bg3)]"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    minHeight: 50,
                    padding: '0 20px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text)',
                  }}
                >
                  <Icon size={22} style={{ color: 'var(--hint)', flexShrink: 0 }} />
                  <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 500 }}>{label}</span>
                  <CaretRightIcon size={16} style={{ color: 'var(--hint)' }} />
                </button>
              ))}
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

  const headerIconBtn: React.CSSProperties = {
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--r-control)',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'background 0.15s ease, color 0.15s ease',
  }

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>

      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 6px 16px', height: 56 }}>
          <img src={logoFullSrc} alt="reDonate" style={{ height: 22, width: 'auto', display: 'block', flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Link to="/search" aria-label="Поиск" style={{ ...headerIconBtn, color: 'var(--hint)' }}>
              <MagnifyingGlassIcon size={22} />
            </Link>
            <button
              aria-label={menuOpen ? 'Закрыть меню' : 'Меню'}
              onClick={() => setMenuOpen(v => !v)}
              style={{
                ...headerIconBtn,
                background: menuOpen ? 'var(--bg2)' : 'transparent',
                color: menuOpen ? 'var(--text)' : 'var(--hint)',
              }}
            >
              {menuOpen ? <XIcon size={22} /> : <ListIcon size={22} />}
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4" style={{ paddingTop: 56 }}>

        {/* ── Приветствие + баланс и уровень ───────────────────────────────── */}
        <div className="pt-5 pb-6">
          <h1 style={{ margin: 0, fontSize: '1.25rem', lineHeight: 1.3, color: 'var(--text)' }}>
            {displayName ? `Добро пожаловать, ${displayName}!` : 'Добро пожаловать!'}
          </h1>

          {profile && (
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Link
                to="/balance"
                className="active:opacity-80"
                style={{
                  display: 'flex', flexDirection: 'column', gap: 6,
                  padding: '12px 14px', borderRadius: 'var(--r-card)',
                  background: 'var(--bg2)', textDecoration: 'none',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--hint)' }}>
                  <WalletIcon size={16} /> Баланс
                </span>
                <span className="font-display num" style={{ fontSize: 17, color: 'var(--text)' }}>
                  {fmt(profile.balance)} ₽
                </span>
              </Link>
              <Link
                to="/profile"
                className="active:opacity-80"
                style={{
                  position: 'relative', overflow: 'hidden',
                  display: 'flex', flexDirection: 'column', gap: 6,
                  padding: '12px 14px 12px 18px', borderRadius: 'var(--r-card)',
                  background: 'var(--bg2)', textDecoration: 'none',
                }}
              >
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: profile.loyalty_color_hex }} />
                <span style={{ fontSize: 13, color: 'var(--hint)' }}>
                  Кэшбэк {fmt(profile.loyalty_cashback_percent)}%
                </span>
                <span className="font-display" style={{ fontSize: 17, color: profile.loyalty_color_hex, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profile.loyalty_level_name}
                </span>
              </Link>
            </div>
          )}
        </div>

        {/* ── Популярное ────────────────────────────────────────────────────── */}
        {trendingCategories.length > 0 && (
          <section className="mb-7">
            <p style={{ margin: '0 0 10px', fontWeight: 600, fontSize: 16, color: 'var(--text)' }}>Популярное</p>
            <div
              ref={trendingScrollRef}
              onScroll={() => {
                const el = trendingScrollRef.current
                if (!el) return
                setTrendingAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 4)
              }}
              style={{
                display: 'flex', gap: 8, overflowX: 'auto',
                marginLeft: -16, marginRight: -16,
                paddingLeft: 16, paddingRight: 16,
                scrollbarWidth: 'none', msOverflowStyle: 'none',
                WebkitMaskImage: trendingAtEnd ? 'none' : 'linear-gradient(to right, black 0%, black 80%, transparent 100%)',
                maskImage: trendingAtEnd ? 'none' : 'linear-gradient(to right, black 0%, black 80%, transparent 100%)',
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
                    className="active:opacity-80"
                    style={{
                      width: 150,
                      flexShrink: 0,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      height: 84, borderRadius: 'var(--r-control)', overflow: 'hidden',
                      background: 'var(--bg3)', boxShadow: 'inset 0 0 0 1px var(--border)',
                    }}>
                      {imgSrc && (
                        <img src={imgSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      )}
                    </div>
                    <p style={{ margin: '8px 0 0', fontSize: 14, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {cat.name}
                    </p>
                    <p style={{ margin: '1px 0 0', fontSize: 12, color: 'var(--hint)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {cat.game_name}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Игры / Сервисы ────────────────────────────────────────────────── */}
        <section>
          <Link
            to="/catalog"
            className="active:opacity-80"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderRadius: 'var(--r-card)',
              background: 'var(--bg2)',
              textDecoration: 'none',
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>Открыть полный каталог</span>
            <CaretRightIcon size={16} style={{ color: 'var(--hint)' }} />
          </Link>

          {/* Segment control */}
          <div className="flex p-1 rounded-xl" style={{ background: 'var(--bg2)', marginBottom: 14 }}>
            {([
              { value: 'game' as const, label: 'Игры' },
              { value: 'service' as const, label: 'Сервисы' },
            ]).map(tab => {
              const isActive = homeType === tab.value
              return (
                <button
                  key={tab.value}
                  onClick={() => setHomeType(tab.value)}
                  className="relative flex-1 flex items-center justify-center py-2 text-sm font-medium"
                  style={{
                    color: isActive ? 'var(--text)' : 'var(--hint)',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    zIndex: 1,
                    borderRadius: 8,
                    transition: 'color 0.15s ease',
                  }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="home-tab-pill"
                      className="absolute inset-0"
                      style={{ background: 'var(--bg3)', zIndex: -1, borderRadius: 8 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                    />
                  )}
                  {tab.label}
                </button>
              )
            })}
          </div>

          {games.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', columnGap: 10, rowGap: 14 }}>
              {games.map(game => (
                <div
                  key={game.id}
                  onClick={() => handleGameClick(game.slug)}
                  className="active:opacity-80"
                  style={{ cursor: 'pointer', transition: 'opacity 0.1s ease' }}
                >
                  <ImageWithSkeleton
                    src={game.image_url}
                    alt={game.name}
                    aspectRatio="1 / 1"
                    objectFit="cover"
                    loading="lazy"
                    style={{ width: '100%', borderRadius: 'var(--r-control)', boxShadow: 'inset 0 0 0 1px var(--border)' }}
                    fallback={
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hint)' }}>
                        <GameControllerIcon size={24} />
                      </div>
                    }
                  />
                  <p style={{
                    margin: '7px 0 0', fontSize: 13, fontWeight: 500, lineHeight: 1.3,
                    color: 'var(--text)', overflow: 'hidden', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>
                    {game.name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Каталог целиком ──────────────────────────────────────────────── */}
        <div className="mt-6">
          <Link to="/catalog" className="btn-primary" style={{ textDecoration: 'none' }}>
            Открыть весь каталог
          </Link>
        </div>

        {/* ── «Не нашли свою игру?» — заявка в чат ──────────────────────── */}
        <Link
          to="/custom-order?type=missing_game"
          className="active:opacity-80"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, marginTop: 10,
            padding: '12px 14px', borderRadius: 'var(--r-card)', textDecoration: 'none',
            background: 'var(--bg2)',
          }}
        >
          <ChatCenteredTextIcon size={22} style={{ color: 'var(--link)', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              Не нашли свою игру?
            </span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--hint)', marginTop: 2 }}>
              Напишите нам — соберём заказ индивидуально
            </span>
          </span>
          <CaretRightIcon size={16} style={{ color: 'var(--hint)' }} />
        </Link>

      </div>
    </div>
  )
}
