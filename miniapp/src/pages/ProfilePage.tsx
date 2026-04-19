// src/pages/ProfilePage.tsx
import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Heart, Package, Share2, MessageCircle, Wallet, ShoppingBag, Users, Gift, Info, Settings, Shield, Star, Crown, Gem } from 'lucide-react'
import toast from 'react-hot-toast'
import { profileApi, ordersApi, catalogApi, supportApi, type LoyaltyLevelEntry } from '@/api'
import { adminApi, type AdminMe } from '@/api/admin'
import { useTelegram } from '@/hooks/useTelegram'

// ── Loyalty helpers ────────────────────────────────────────────────────────────

function getLevelIcon(idx: number, size = 12) {
  if (idx === 1) return <Star size={size} />
  if (idx === 2) return <Crown size={size} />
  if (idx >= 3) return <Gem size={size} />
  return <Shield size={size} />
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}

function getLoyaltyProgress(
  totalSpent: number,
  levels: LoyaltyLevelEntry[],
  currentLevelName: string,
) {
  if (!levels.length) return { current: null, next: null, percent: 0, remaining: 0 }

  const currentIdx = levels.findIndex(l => l.name === currentLevelName)
  const current = currentIdx >= 0 ? levels[currentIdx] : levels[0]
  const next = currentIdx >= 0 && currentIdx < levels.length - 1 ? levels[currentIdx + 1] : null

  if (!next) return { current, next: null, percent: 100, remaining: 0 }

  const rangeSize = next.min_spent - current.min_spent
  const progress = totalSpent - current.min_spent
  const percent = rangeSize > 0 ? Math.min(100, Math.round((progress / rangeSize) * 100)) : 100
  const remaining = Math.max(0, next.min_spent - totalSpent)

  return { current, next, percent, remaining }
}

// ── LoyaltyProgressBar ─────────────────────────────────────────────────────────

interface ProgressBarProps {
  totalSpent: number
  discountPercent: number
  loyaltyColorHex: string
  levels: LoyaltyLevelEntry[]
  currentLevelName: string
}

function LoyaltyProgressBar({ totalSpent, discountPercent, loyaltyColorHex, levels, currentLevelName }: ProgressBarProps) {
  const { current, next, percent, remaining } = getLoyaltyProgress(totalSpent, levels, currentLevelName)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = barRef.current
    if (!el) return
    el.style.width = '0%'
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => { el.style.width = `${percent}%` })
    })
    return () => cancelAnimationFrame(raf)
  }, [percent])

  if (!current) return null

  const currentIdx = levels.indexOf(current)
  const nextIdx = next ? levels.indexOf(next) : -1

  return (
    <div style={{ marginTop: 16 }}>
      {/* Метки уровней */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: loyaltyColorHex, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'flex' }}>{getLevelIcon(currentIdx)}</span>
          {current.name}
          <span style={{ color: 'var(--hint)', fontWeight: 400 }}>(ваш статус)</span>
        </span>
        {next ? (
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--hint)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'flex', color: next.color_hex }}>{getLevelIcon(nextIdx)}</span>
            {next.name}
          </span>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 500, color: loyaltyColorHex }}>MAX</span>
        )}
      </div>

      {/* Полоса прогресса */}
      <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div
          ref={barRef}
          style={{
            height: '100%',
            borderRadius: 99,
            background: `linear-gradient(90deg, rgba(${hexToRgb(loyaltyColorHex)},0.6), ${loyaltyColorHex})`,
            boxShadow: `0 0 8px rgba(${hexToRgb(loyaltyColorHex)},0.5)`,
            transition: 'width 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
            width: 0,
          }}
        />
      </div>

      {/* Подпись */}
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--hint)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {next ? (
          <>
            До{' '}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span style={{ display: 'flex', color: next.color_hex }}>{getLevelIcon(nextIdx)}</span>
              {next.name}:
            </span>
            {' '}
            <span style={{ color: loyaltyColorHex, fontWeight: 600 }}>
              {remaining.toLocaleString('ru')} ₽
            </span>
            {next.discount_percent > 0 && (
              <span> — скидка {next.discount_percent}%</span>
            )}
          </>
        ) : (
          <span style={{ color: loyaltyColorHex, fontWeight: 600 }}>
            Максимальный уровень
            {discountPercent > 0 && ` · скидка ${discountPercent}%`}
          </span>
        )}
      </div>
    </div>
  )
}

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME ?? 'redonate_bot'

const MENU_ITEMS = [
  { to: '/orders',    icon: <Package size={18} />,       label: 'Мои заказы' },
  { to: '/favorites', icon: <Heart size={18} />,         label: 'Избранное' },
  { to: '/support',   icon: <MessageCircle size={18} />, label: 'Поддержка' },
]

// ── Module-level components (stable identity across ProfilePage renders) ───────

interface AvatarBlockProps {
  showAvatar: boolean
  avatarSrc: string | null
  avatarInitial: string
  onError: () => void
}

function AvatarBlock({ showAvatar, avatarSrc, avatarInitial, onError }: AvatarBlockProps) {
  return showAvatar ? (
    <img
      src={avatarSrc!}
      alt=""
      className="w-16 h-16 rounded-full object-cover flex-shrink-0"
      style={{ boxShadow: '0 0 0 2px rgba(45,88,173,0.35)' }}
      onError={onError}
    />
  ) : (
    <div
      className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 text-2xl font-bold"
      style={{
        background: 'linear-gradient(135deg, #2d58ad, #7c3aed)',
        color: '#fff',
        boxShadow: '0 0 0 2px rgba(45,88,173,0.35)',
      }}
    >
      {avatarInitial}
    </div>
  )
}

function MenuBlock() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const navigating = useRef(false)

  async function handleMenuClick(to: string) {
    if (navigating.current) return
    navigating.current = true
    try {
      if (to === '/orders') {
        await Promise.all([
          import('@/pages/OrdersPage'),
          queryClient.prefetchQuery({ queryKey: ['orders'], queryFn: () => ordersApi.list(), staleTime: 30_000 }),
        ])
      } else if (to === '/favorites') {
        await Promise.all([
          import('@/pages/FavoritesPage'),
          queryClient.prefetchQuery({ queryKey: ['favorites'], queryFn: catalogApi.getFavorites, staleTime: 60_000 }),
        ])
      } else if (to === '/support') {
        await Promise.all([
          import('@/pages/SupportPage'),
          queryClient.prefetchQuery({ queryKey: ['tickets'], queryFn: supportApi.list, staleTime: 30_000 }),
        ])
      }
      navigate(to)
    } finally {
      navigating.current = false
    }
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {MENU_ITEMS.map(({ to, icon, label }) => (
        <div
          key={to}
          onClick={() => handleMenuClick(to)}
          className="flex flex-col items-center gap-2 py-4 px-2 rounded-2xl active:scale-[0.96] transition-transform"
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(107,157,232,0.12)',
              border: '1px solid rgba(107,157,232,0.18)',
              boxShadow: '0 0 12px rgba(107,157,232,0.08)',
            }}
          >
            <span style={{ color: '#6b9de8' }}>{icon}</span>
          </div>
          <span
            className="text-xs font-medium text-center leading-tight"
            style={{ color: 'var(--text)' }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function ProfilePage() {
  const { user, haptic, tg } = useTelegram()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const navigating = useRef(false)
  const [avatarError, setAvatarError] = useState(false)
  const [showLevels, setShowLevels] = useState(false)

  async function handleStatClick(to: string) {
    if (navigating.current) return
    navigating.current = true
    try {
      if (to === '/balance') {
        await Promise.all([
          import('@/pages/BalancePage'),
          queryClient.prefetchQuery({ queryKey: ['balance-history'], queryFn: profileApi.getBalanceHistory, staleTime: 60_000 }),
        ])
      } else if (to === '/orders') {
        await Promise.all([
          import('@/pages/OrdersPage'),
          queryClient.prefetchQuery({ queryKey: ['orders'], queryFn: () => ordersApi.list(), staleTime: 30_000 }),
        ])
      } else if (to === '/referrals') {
        await Promise.all([
          import('@/pages/ReferralsPage'),
          queryClient.prefetchQuery({ queryKey: ['referral-stats'], queryFn: profileApi.getReferralStats, staleTime: 60_000 }),
        ])
      }
      navigate(to)
    } finally {
      navigating.current = false
    }
  }
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.get,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  // Check if user is admin (silent, no error on 403)
  const { data: adminProfile } = useQuery<AdminMe>({
    queryKey: ['admin', 'me'],
    queryFn: adminApi.getMe,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  const refLink = profile ? `https://t.me/${BOT_USERNAME}?start=REF_${profile.telegram_id}` : ''

  const handleCopyLink = () => {
    navigator.clipboard.writeText(refLink)
    haptic.success()
    toast.success('Ссылка скопирована!')
  }

  const handleShareTelegram = () => {
    tg?.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(refLink))
  }

  const displayName = profile?.first_name ?? user?.first_name ?? user?.username ?? 'Гость'
  const displayUsername = profile?.username ?? user?.username ?? null
  const avatarInitial = displayName.charAt(0).toUpperCase()
  // Telegram WebApp photo_url не истекает, в отличие от API file_path
  const avatarSrc = user?.photo_url ?? profile?.photo_url ?? null
  const showAvatar = avatarSrc !== null && !avatarError

  const loyaltyLevels = profile?.loyalty_levels ?? []
  const loyaltyColorHex = profile?.loyalty_color_hex ?? '#CD7F32'
  const loyaltyLevelName = profile?.loyalty_level_name ?? ''

  if (!profile) {
    return (
      <motion.div
        className="px-4 pt-5 pb-6 space-y-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <div className="flex flex-col gap-3 p-4 rounded-2xl" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <AvatarBlock showAvatar={showAvatar} avatarSrc={avatarSrc} avatarInitial={avatarInitial} onError={() => setAvatarError(true)} />
            <div className="min-w-0">
              <p className="font-bold text-base truncate" style={{ color: 'var(--text)' }}>{displayName}</p>
              {displayUsername && (
                <p className="text-sm truncate" style={{ color: 'var(--hint)' }}>@{displayUsername}</p>
              )}
            </div>
          </div>
        </div>
        <div className="p-4 rounded-2xl" style={{ background: 'rgba(45,88,173,0.1)', border: '1px solid rgba(45,88,173,0.22)' }}>
          <p className="text-sm" style={{ color: 'var(--hint)' }}>Данные профиля временно недоступны. Попробуй позже.</p>
        </div>
        <MenuBlock />
      </motion.div>
    )
  }

  return (
    <motion.div
      className="px-4 pt-5 pb-6 space-y-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >

      {/* ── Карточка профиля ── */}
      <div className="flex flex-col gap-3 p-4 rounded-2xl" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
        {/* Аватар + имя */}
        <div className="flex items-center gap-3">
          <AvatarBlock showAvatar={showAvatar} avatarSrc={avatarSrc} avatarInitial={avatarInitial} onError={() => setAvatarError(true)} />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-base truncate" style={{ color: 'var(--text)' }}>
              {profile.first_name}
            </p>
            {profile.username && (
              <p className="text-sm truncate" style={{ color: 'var(--hint)' }}>@{profile.username}</p>
            )}
          </div>
        </div>

        {/* Прогресс-бар на всю ширину */}
        <div
          onClick={() => setShowLevels(v => !v)}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          <LoyaltyProgressBar
            totalSpent={profile.total_spent}
            discountPercent={profile.loyalty_discount_percent}
            loyaltyColorHex={loyaltyColorHex}
            levels={loyaltyLevels}
            currentLevelName={loyaltyLevelName}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--hint)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Info size={10} />
              {showLevels ? 'Скрыть уровни' : 'Все уровни'}
            </span>
          </div>
        </div>

        {/* Коллапсируемый список уровней */}
        <div style={{
          display: 'grid',
          gridTemplateRows: showLevels ? '1fr' : '0fr',
          opacity: showLevels ? 1 : 0,
          marginTop: showLevels ? 8 : 0,
          transition: 'grid-template-rows 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease, margin-top 0.32s ease',
        }}>
          <div style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {loyaltyLevels.map((level, idx) => {
              const isLast = idx === loyaltyLevels.length - 1
              const isCurrent = level.name === loyaltyLevelName
              const rgb = hexToRgb(level.color_hex)
              return (
                <div
                  key={level.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 10,
                    background: `rgba(${rgb},0.12)`,
                    border: `1px solid rgba(${rgb},${isCurrent ? '0.4' : '0.2'})`,
                    boxShadow: isCurrent ? `0 0 0 1px rgba(${rgb},0.25)` : 'none',
                  }}
                >
                  <span style={{ display: 'flex', flexShrink: 0, color: level.color_hex }}>{getLevelIcon(idx)}</span>
                  <span style={{ fontWeight: 600, fontSize: 12, color: level.color_hex, flex: 1 }}>
                    {level.name}
                    {isCurrent && <span style={{ fontWeight: 400, color: 'var(--hint)', marginLeft: 4, fontSize: 11 }}>— ваш</span>}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--hint)' }}>
                    от {level.min_spent.toLocaleString('ru')} ₽
                  </span>
                  {level.discount_percent > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: level.color_hex }}>
                      −{level.discount_percent}%
                    </span>
                  )}
                  {isLast && level.discount_percent === 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: level.color_hex }}>MAX</span>
                  )}
                </div>
              )
            })}
          </div>
          </div>
        </div>
      </div>

      {/* ── Статистика ── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Баланс',    value: `${Number(profile.balance).toLocaleString('ru')} ₽`, color: '#6b9de8', icon: <Wallet size={14} />, to: '/balance' },
          { label: 'Заказов',   value: String(profile.orders_count),   color: 'var(--text)', icon: <ShoppingBag size={14} />, to: '/orders' },
          { label: 'Рефералов', value: String(profile.referrals_count), color: '#34d399',    icon: <Users size={14} />, to: '/referrals' },
        ].map(({ label, value, color, icon, to }) => (
          <div
            key={label}
            onClick={() => handleStatClick(to)}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 10px', textAlign: 'center', display: 'block', cursor: 'pointer' }}
            className="active:scale-95 transition-transform"
          >
            <div style={{ color, opacity: 0.6, display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{icon}</div>
            <p className="text-base font-bold truncate" style={{ color }}>{value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* ── Реферальная программа ── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <Gift size={16} style={{ color: '#6b9de8' }} />
          <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Реферальная программа</p>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--hint)' }}>
          Поделись ссылкой и получи бонус за каждого друга
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center flex-1 p-3 rounded-xl active:scale-95 transition-transform"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', minWidth: 0 }}
          >
            <code className="text-xs font-bold truncate" style={{ color: '#6b9de8' }}>
              t.me/{BOT_USERNAME}?start=REF_{profile.telegram_id}
            </code>
          </button>
          <button
            type="button"
            onClick={handleShareTelegram}
            className="flex items-center justify-center active:scale-90 transition-transform flex-shrink-0"
            style={{
              width: 40, height: 40,
              borderRadius: 12,
              background: 'rgba(45,88,173,0.15)',
              border: '1px solid rgba(45,88,173,0.25)',
              color: '#6b9de8',
            }}
          >
            <Share2 size={16} />
          </button>
        </div>
      </div>

      {/* ── Меню ── */}
      <MenuBlock />

      {/* ── Админ-панель (только для админов) ── */}
      {adminProfile && (
        <Link
          to="/admin"
          className="flex items-center gap-3 p-4 rounded-2xl active:scale-[0.97] transition-transform"
          style={{
            background: 'rgba(45,88,173,0.12)',
            border: '1px solid rgba(45,88,173,0.25)',
            textDecoration: 'none',
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(45,88,173,0.2)',
              border: '1px solid rgba(45,88,173,0.35)',
            }}
          >
            <Settings size={18} style={{ color: '#6b9de8' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#6b9de8' }}>Админ-панель</p>
            <p className="text-xs" style={{ color: 'var(--hint)' }}>{adminProfile.role}</p>
          </div>
        </Link>
      )}
    </motion.div>
  )
}
