// src/pages/ProfilePage.tsx
import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Heart, Package, Copy, MessageCircle, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { profileApi } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'

// ── Loyalty levels ─────────────────────────────────────────────────────────────

interface LoyaltyLevel {
  name: string
  emoji: string
  min: number
  max: number | null
  nextDiscount: number
}

const LOYALTY_LEVELS: LoyaltyLevel[] = [
  { name: 'Bronze',   emoji: '🥉', min: 0,     max: 1000,  nextDiscount: 3  },
  { name: 'Silver',   emoji: '🥈', min: 1000,  max: 5000,  nextDiscount: 5  },
  { name: 'Gold',     emoji: '🥇', min: 5000,  max: 15000, nextDiscount: 10 },
  { name: 'Platinum', emoji: '💎', min: 15000, max: null,  nextDiscount: 0  },
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
    // Запускаем анимацию через requestAnimationFrame после монтирования
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
    <div style={{ marginTop: 12 }}>
      {/* Метки уровней */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#818cf8' }}>
          {current.emoji} {current.name}
        </span>
        {next ? (
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--hint)' }}>
            {next.emoji} {next.name}
          </span>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b' }}>MAX</span>
        )}
      </div>

      {/* Полоса прогресса */}
      <div
        style={{
          height: 6,
          borderRadius: 99,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          ref={barRef}
          style={{
            height: '100%',
            borderRadius: 99,
            background: 'linear-gradient(90deg, #4f46e5, #818cf8)',
            boxShadow: '0 0 8px rgba(79,70,229,0.6)',
            transition: 'width 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
            width: 0,
          }}
        />
      </div>

      {/* Подпись */}
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--hint)' }}>
        {next ? (
          <>
            До {next.emoji} {next.name}:{' '}
            <span style={{ color: '#818cf8', fontWeight: 600 }}>
              {remaining.toLocaleString('ru')} ₽
            </span>
            {next.nextDiscount > 0 && (
              <span style={{ color: 'var(--hint)' }}> — скидка {next.nextDiscount}%</span>
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

export default function ProfilePage() {
  const { user, haptic } = useTelegram()
  const [avatarError, setAvatarError] = useState(false)
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.get,
    // Не бросаем ошибку наружу — обрабатываем gracefully внутри компонента
    retry: false,
  })

  const copyRef = () => {
    if (!profile) return
    const link = `https://t.me/${BOT_USERNAME}?start=REF_${profile.telegram_id}`
    navigator.clipboard.writeText(link)
    haptic.success()
    toast.success('Ссылка скопирована!')
  }

  // Используем данные из profile если есть, иначе fallback на данные из Telegram initData
  const displayName = profile?.first_name ?? user?.first_name ?? user?.username ?? 'Гость'
  const displayUsername = profile?.username ?? user?.username ?? null
  const avatarInitial = displayName.charAt(0).toUpperCase()
  // Приоритет: photo_url из backend (Bot API) → photo_url из initDataUnsafe
  const avatarSrc = profile?.photo_url ?? user?.photo_url ?? null
  const showAvatar = avatarSrc !== null && !avatarError

  if (isLoading) return (
    <div className="px-4 pt-5 space-y-3">
      <div className="skeleton h-24 rounded-2xl" />
      <div className="skeleton h-20 rounded-2xl" />
      <div className="skeleton h-20 rounded-2xl" />
    </div>
  )

  // Если profile не загрузился (401 или API недоступен) — показываем заглушку с данными из Telegram
  if (!profile) {
    return (
      <div className="px-4 pt-5 pb-6 space-y-4 animate-fade-in">
        {/* Аватар + имя (заглушка) */}
        <div
          className="flex items-center gap-4 p-4 rounded-2xl"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
        >
          {showAvatar ? (
            <img
              src={avatarSrc!}
              alt=""
              className="w-14 h-14 rounded-full object-cover flex-shrink-0"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 text-xl font-bold"
              style={{ background: 'linear-gradient(135deg, #4f46e5, #4f46e5)', color: '#fff' }}
            >
              {avatarInitial}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-bold text-base truncate" style={{ color: 'var(--text)' }}>
              {displayName}
            </p>
            {displayUsername && (
              <p className="text-sm truncate" style={{ color: 'var(--hint)' }}>@{displayUsername}</p>
            )}
          </div>
        </div>

        {/* Уведомление о недоступности данных */}
        <div
          className="p-4 rounded-2xl"
          style={{
            background: 'rgba(79,70,229,0.1)',
            border: '1px solid rgba(79,70,229,0.22)',
          }}
        >
          <p className="text-sm" style={{ color: 'var(--hint)' }}>
            Данные профиля временно недоступны. Попробуй позже.
          </p>
        </div>

        {/* Меню */}
        <div className="space-y-2">
          {[
            { to: '/orders',    icon: <Package size={18} />,       label: 'Мои заказы' },
            { to: '/favorites', icon: <Heart size={18} />,         label: 'Избранное' },
            { to: '/support',   icon: <MessageCircle size={18} />, label: 'Поддержка' },
          ].map(({ to, icon, label }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 p-4 rounded-2xl active:scale-[0.98] transition-transform"
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
            >
              <span style={{ color: '#818cf8' }}>{icon}</span>
              <span className="font-medium text-sm flex-1" style={{ color: 'var(--text)' }}>{label}</span>
              <ChevronRight size={16} style={{ color: 'var(--hint)' }} />
            </Link>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-5 pb-6 space-y-4 animate-fade-in">
      {/* Аватар + имя */}
      <div
        className="flex items-center gap-4 p-4 rounded-2xl"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
      >
        {showAvatar ? (
          <img
            src={avatarSrc!}
            alt=""
            className="w-14 h-14 rounded-full object-cover flex-shrink-0"
            onError={() => setAvatarError(true)}
          />
        ) : (
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 text-xl font-bold"
            style={{ background: 'linear-gradient(135deg, #4f46e5, #4f46e5)', color: '#fff' }}
          >
            {avatarInitial}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-bold text-base truncate" style={{ color: 'var(--text)' }}>
            {profile.first_name}
          </p>
          {profile.username && (
            <p className="text-sm truncate" style={{ color: 'var(--hint)' }}>@{profile.username}</p>
          )}
          <span className="badge mt-1.5 inline-flex">
            {profile.loyalty_level_emoji} {profile.loyalty_level_name}
          </span>
          <LoyaltyProgressBar
            totalSpent={profile.total_spent}
            discountPercent={profile.loyalty_discount_percent}
          />
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Баланс',    value: `${Number(profile.balance).toLocaleString('ru')} ₽`, color: '#818cf8' },
          { label: 'Заказов',   value: String(profile.orders_count),                          color: 'var(--text)' },
          { label: 'Рефералов', value: String(profile.referrals_count),                       color: '#34d399' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '14px 16px',
              textAlign: 'center',
            }}
          >
            <p className="text-lg font-bold truncate" style={{ color }}>{value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Привилегии лояльности */}
      {(profile.loyalty_discount_percent > 0 || profile.loyalty_cashback_percent > 0) && (
        <div
          className="p-4 rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(79,70,229,0.16), rgba(79,70,229,0.15))',
            border: '1px solid rgba(79,70,229,0.28)',
          }}
        >
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
            {profile.loyalty_level_emoji} Привилегии {profile.loyalty_level_name}
          </p>
          <div className="flex gap-6">
            {profile.loyalty_discount_percent > 0 && (
              <div>
                <p className="text-2xl font-extrabold" style={{ color: '#818cf8' }}>
                  {profile.loyalty_discount_percent}%
                </p>
                <p className="text-xs" style={{ color: 'var(--hint)' }}>скидка</p>
              </div>
            )}
            {profile.loyalty_cashback_percent > 0 && (
              <div>
                <p className="text-2xl font-extrabold" style={{ color: '#34d399' }}>
                  {profile.loyalty_cashback_percent}%
                </p>
                <p className="text-xs" style={{ color: 'var(--hint)' }}>кэшбек</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Реферальный код */}
      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">🎁</span>
          <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
            Реферальная программа
          </p>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--hint)' }}>
          Поделись ссылкой и получи бонус за каждого друга
        </p>
        <button
          onClick={copyRef}
          className="flex items-center justify-between w-full p-3 rounded-xl active:scale-95 transition-transform"
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}
        >
          <code
            className="text-xs font-bold truncate mr-2"
            style={{ color: '#818cf8', maxWidth: '70%' }}
          >
            t.me/{BOT_USERNAME}?start=REF_{profile.telegram_id}
          </code>
          <div className="flex items-center gap-1.5 text-xs flex-shrink-0" style={{ color: 'var(--hint)' }}>
            <Copy size={13} />
            Скопировать
          </div>
        </button>
      </div>

      {/* Меню */}
      <div className="space-y-2">
        {[
          { to: '/orders',    icon: <Package size={18} />,       label: 'Мои заказы' },
          { to: '/favorites', icon: <Heart size={18} />,         label: 'Избранное' },
          { to: '/support',   icon: <MessageCircle size={18} />, label: 'Поддержка' },
        ].map(({ to, icon, label }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-3 p-4 rounded-2xl active:scale-[0.98] transition-transform"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
          >
            <span style={{ color: '#818cf8' }}>{icon}</span>
            <span className="font-medium text-sm flex-1" style={{ color: 'var(--text)' }}>{label}</span>
            <ChevronRight size={16} style={{ color: 'var(--hint)' }} />
          </Link>
        ))}
      </div>
    </div>
  )
}
