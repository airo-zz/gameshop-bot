// src/pages/ProfilePage.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Heart, Package, Copy, MessageCircle, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { profileApi } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'

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
