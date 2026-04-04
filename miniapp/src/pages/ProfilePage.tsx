// src/pages/ProfilePage.tsx
import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Heart, Package, Copy, Share2, MessageCircle, Wallet, ShoppingBag, Users, Shield, Star, Crown, Gem, Gift, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import { profileApi } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'

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
  const [showRefSheet, setShowRefSheet] = useState(false)
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.get,
    retry: false,
  })

  const refLink = profile ? `https://t.me/${BOT_USERNAME}?start=REF_${profile.telegram_id}` : ''

  const handleCopyLink = () => {
    navigator.clipboard.writeText(refLink)
    haptic.success()
    toast.success('Ссылка скопирована!')
    setShowRefSheet(false)
  }

  const handleShareTelegram = () => {
    tg?.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(refLink))
    setShowRefSheet(false)
  }

  const handleNativeShare = () => {
    navigator.share({ url: refLink }).catch(() => {})
    setShowRefSheet(false)
  }

  const displayName = profile?.first_name ?? user?.first_name ?? user?.username ?? 'Гость'
  const displayUsername = profile?.username ?? user?.username ?? null
  const avatarInitial = displayName.charAt(0).toUpperCase()
  const avatarSrc = profile?.photo_url ?? user?.photo_url ?? null
  const showAvatar = avatarSrc !== null && !avatarError

  const loyaltyInfo = profile ? getLoyaltyProgress(profile.total_spent) : null

  if (isLoading) return (
    <div className="px-4 pt-5 space-y-3">
      <div className="skeleton h-32 rounded-2xl" />
      <div className="skeleton h-20 rounded-2xl" />
      <div className="skeleton h-20 rounded-2xl" />
    </div>
  )

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
      <div className="px-4 pt-5 pb-6 space-y-4 animate-fade-in">
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
      </div>
    )
  }

  return (
    <div className="px-4 pt-5 pb-6 space-y-3 animate-fade-in">

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
        {showLevels && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
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
        )}
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
        <button
          onClick={() => setShowRefSheet(true)}
          className="flex items-center justify-between w-full p-3 rounded-xl active:scale-95 transition-transform"
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}
        >
          <code className="text-xs font-bold truncate mr-2" style={{ color: '#6b9de8', maxWidth: '65%' }}>
            t.me/{BOT_USERNAME}?start=REF_{profile.telegram_id}
          </code>
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-shrink-0 text-xs font-medium"
            style={{ background: 'rgba(45,88,173,0.2)', color: '#6b9de8' }}
          >
            <Share2 size={12} />
            Поделиться
          </div>
        </button>
      </div>

      {/* ── Referral share sheet ── */}
      {/* Backdrop */}
      <div
        onClick={() => setShowRefSheet(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 92,
          opacity: showRefSheet ? 1 : 0,
          pointerEvents: showRefSheet ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />
      {/* Sheet panel */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 93,
          background: 'rgba(16,14,38,0.97)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(45,88,173,0.28)',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(45,88,173,0.06)',
          transform: showRefSheet ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.18)' }} />
        </div>

        {/* Title */}
        <div style={{ padding: '8px 20px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Share2 size={15} style={{ color: '#6b9de8', flexShrink: 0 }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Поделиться ссылкой</span>
        </div>

        {/* Link preview */}
        <div style={{ margin: '8px 20px 4px', padding: '8px 12px', borderRadius: 10, background: 'rgba(45,88,173,0.10)', border: '1px solid rgba(45,88,173,0.20)' }}>
          <code style={{ fontSize: 11, color: '#6b9de8', wordBreak: 'break-all' }}>
            t.me/{BOT_USERNAME}?start=REF_{profile.telegram_id}
          </code>
        </div>

        {/* Actions */}
        <div style={{ padding: '8px 0 20px' }}>
          {/* Copy */}
          <button
            onClick={handleCopyLink}
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
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, background: 'rgba(107,157,232,0.10)', border: '1px solid rgba(107,157,232,0.15)', color: '#6b9de8', flexShrink: 0 }}>
              <Copy size={16} />
            </span>
            <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 500 }}>Скопировать ссылку</span>
          </button>

          {/* Telegram share */}
          <button
            onClick={handleShareTelegram}
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
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, background: 'rgba(107,157,232,0.10)', border: '1px solid rgba(107,157,232,0.15)', color: '#6b9de8', flexShrink: 0 }}>
              <MessageCircle size={16} />
            </span>
            <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 500 }}>Поделиться в Telegram</span>
          </button>

          {/* Native share — only if supported */}
          {typeof navigator !== 'undefined' && navigator.share !== undefined && (
            <button
              onClick={handleNativeShare}
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
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, background: 'rgba(107,157,232,0.10)', border: '1px solid rgba(107,157,232,0.15)', color: '#6b9de8', flexShrink: 0 }}>
                <Share2 size={16} />
              </span>
              <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 500 }}>Поделиться...</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Меню ── */}
      <MenuBlock />
    </div>
  )
}
