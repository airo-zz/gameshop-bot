// src/pages/ProfilePage.tsx
import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Heart, Package, Share2, MessageCircle, Wallet, ShoppingBag, Users, Shield, Star, Crown, Gem, Gift, Info, Settings } from 'lucide-react'
import toast from 'react-hot-toast'
import { profileApi } from '@/api'
import { adminApi, type AdminMe } from '@/api/admin'
import { useTelegram } from '@/hooks/useTelegram'
import PageLoader from '@/components/ui/PageLoader'

// ── Loyalty levels ─────────────────────────────────────────────────────────────

interface LoyaltyLevel {
  name: string
  icon: React.ReactNode
  min: number
  max: number | null
  nextDiscount: number
  color: string
  bg: string
  border: string
}

const LOYALTY_LEVELS: LoyaltyLevel[] = [
  { name: 'Bronze',   icon: <Shield size={12} />,  min: 0,     max: 1000,  nextDiscount: 3,  color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.25)' },
  { name: 'Silver',   icon: <Star size={12} />,    min: 1000,  max: 5000,  nextDiscount: 5,  color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.25)' },
  { name: 'Gold',     icon: <Crown size={12} />,   min: 5000,  max: 15000, nextDiscount: 10, color: '#eab308', bg: 'rgba(234,179,8,0.15)',   border: 'rgba(234,179,8,0.25)' },
  { name: 'Platinum', icon: <Gem size={12} />,     min: 15000, max: null,  nextDiscount: 0,  color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', border: 'rgba(167,139,250,0.25)' },
]

function getLoyaltyProgress(totalSpent: number) {
  const current = [...LOYALTY_LEVELS].reverse().find(l => totalSpent >= l.min) ?? LOYALTY_LEVELS[0]
  const currentIndex = LOYALTY_LEVELS.indexOf(current)
  const next = currentIndex < LOYALTY_LEVELS.length - 1 ? LOYALTY_LEVELS[currentIndex + 1] : null

  if (!next || current.max === null) {
    return { current, next: null, percent: 100, remaining: 0 }
  }

  const rangeSize = current.max - current.min
  const progress = totalSpent - current.min
  const percent = Math.min(100, Math.round((progress / rangeSize) * 100))
  const remaining = current.max - totalSpent

  return { current, next, percent, remaining }
}

// ── LoyaltyProgressBar ─────────────────────────────────────────────────────────

function LoyaltyProgressBar({ totalSpent, discountPercent }: { totalSpent: number; discountPercent: number }) {
  const { current, next, percent, remaining } = getLoyaltyProgress(totalSpent)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = barRef.current
    if (!el) return
    el.style.width = '0%'
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.width = `${percent}%`
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [percent])

  return (
    <div style={{ marginTop: 16 }}>
      {/* Метки уровней */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: '#6b9de8', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'flex', color: current.color }}>{current.icon}</span>
          {current.name}
          <span style={{ color: 'var(--hint)', fontWeight: 400 }}>(ваш статус)</span>
        </span>
        {next ? (
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--hint)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'flex', color: next.color }}>{next.icon}</span>
            {next.name}
          </span>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 500, color: '#f59e0b' }}>MAX</span>
        )}
      </div>

      {/* Полоса прогресса */}
      <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div
          ref={barRef}
          style={{
            height: '100%',
            borderRadius: 99,
            background: 'linear-gradient(90deg, #2d58ad, #6b9de8)',
            boxShadow: '0 0 8px rgba(45,88,173,0.6)',
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
              <span style={{ display: 'flex', color: next.color }}>{next.icon}</span>
              {next.name}:
            </span>
            {' '}
            <span style={{ color: '#6b9de8', fontWeight: 600 }}>
              {remaining.toLocaleString('ru')} ₽
            </span>
            {next.nextDiscount > 0 && (
              <span> — скидка {next.nextDiscount}%</span>
            )}
          </>
        ) : (
          <span style={{ color: '#f59e0b', fontWeight: 600 }}>
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

export default function ProfilePage() {
  const { user, haptic, tg } = useTelegram()
  const [avatarError, setAvatarError] = useState(false)
  const [showLevels, setShowLevels] = useState(false)
  const { data: profile, isLoading } = useQuery({
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

  const loyaltyInfo = profile ? getLoyaltyProgress(profile.total_spent) : null

  if (isLoading) return <PageLoader />

  // Аватар-блок (общий)
  const AvatarBlock = () => showAvatar ? (
    <img
      src={avatarSrc!}
      alt=""
      className="w-16 h-16 rounded-full object-cover flex-shrink-0"
      style={{ boxShadow: '0 0 0 2px rgba(45,88,173,0.35)' }}
      onError={() => setAvatarError(true)}
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

  // Меню-блок (общий)
  const MenuBlock = () => (
    <div className="grid grid-cols-3 gap-2">
      {MENU_ITEMS.map(({ to, icon, label }) => (
        <Link
          key={to}
          to={to}
          className="flex flex-col items-center gap-2 py-4 px-2 rounded-2xl active:scale-[0.96] transition-transform"
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            textDecoration: 'none',
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
        </Link>
      ))}
    </div>
  )

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
            <AvatarBlock />
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
          <AvatarBlock />
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
            {LOYALTY_LEVELS.map(level => (
              <div
                key={level.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: level.bg,
                  border: `1px solid ${level.border}`,
                }}
              >
                <span style={{ display: 'flex', color: level.color, flexShrink: 0 }}>{level.icon}</span>
                <span style={{ fontWeight: 600, fontSize: 12, color: level.color, flex: 1 }}>{level.name}</span>
                <span style={{ fontSize: 11, color: 'var(--hint)' }}>
                  от {level.min.toLocaleString('ru')} ₽
                </span>
                {level.nextDiscount > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: level.color }}>
                    −{level.nextDiscount}%
                  </span>
                )}
                {level.max === null && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: level.color }}>MAX</span>
                )}
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>

      {/* ── Статистика ── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Баланс',    value: `${Number(profile.balance).toLocaleString('ru')} ₽`, color: '#6b9de8', icon: <Wallet size={14} /> },
          { label: 'Заказов',   value: String(profile.orders_count),   color: 'var(--text)', icon: <ShoppingBag size={14} /> },
          { label: 'Рефералов', value: String(profile.referrals_count), color: '#34d399',    icon: <Users size={14} /> },
        ].map(({ label, value, color, icon }) => (
          <div
            key={label}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 10px', textAlign: 'center' }}
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
            onClick={handleCopyLink}
            className="flex items-center flex-1 p-3 rounded-xl active:scale-95 transition-transform"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', minWidth: 0 }}
          >
            <code className="text-xs font-bold truncate" style={{ color: '#6b9de8' }}>
              t.me/{BOT_USERNAME}?start=REF_{profile.telegram_id}
            </code>
          </button>
          <button
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
