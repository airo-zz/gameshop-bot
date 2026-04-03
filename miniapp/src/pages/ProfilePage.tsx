// src/pages/ProfilePage.tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Heart, Package, Copy, MessageCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { profileApi } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'

export default function ProfilePage() {
  const { user, haptic } = useTelegram()
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.get,
  })

  const copyRef = () => {
    if (!profile) return
    const link = `https://t.me/your_bot?start=${profile.referral_code}`
    navigator.clipboard.writeText(link)
    haptic.success()
    toast.success('Ссылка скопирована!')
  }

  if (isLoading) return (
    <div className="px-4 pt-4 space-y-3">
      <div className="skeleton h-32 rounded-2xl" />
      <div className="skeleton h-20 rounded-2xl" />
      <div className="skeleton h-20 rounded-2xl" />
    </div>
  )

  if (!profile) return null

  return (
    <div className="px-4 pt-4 pb-6 space-y-4 animate-fade-in">
      {/* Аватар + имя */}
      <div className="flex items-center gap-4">
        {user?.photo_url ? (
          <img src={user.photo_url} alt="" className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
               style={{ background: 'var(--bg2)' }}>
            👤
          </div>
        )}
        <div>
          <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{profile.first_name}</p>
          {profile.username && (
            <p className="text-sm" style={{ color: 'var(--hint)' }}>@{profile.username}</p>
          )}
          <span className="badge mt-1">
            {profile.loyalty_level_emoji} {profile.loyalty_level_name}
          </span>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Баланс', value: `${profile.balance.toLocaleString('ru')} ₽`, color: 'var(--btn)' },
          { label: 'Заказов', value: profile.orders_count, color: 'var(--text)' },
          { label: 'Потрачено', value: `${profile.total_spent.toLocaleString('ru')} ₽`, color: 'var(--text)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card text-center">
            <p className="text-base font-bold" style={{ color }}>{value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Лояльность */}
      {(profile.loyalty_discount_percent > 0 || profile.loyalty_cashback_percent > 0) && (
        <div className="card">
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>
            {profile.loyalty_level_emoji} Привилегии {profile.loyalty_level_name}
          </p>
          <div className="flex gap-4">
            {profile.loyalty_discount_percent > 0 && (
              <div>
                <p className="text-lg font-bold" style={{ color: 'var(--btn)' }}>
                  {profile.loyalty_discount_percent}%
                </p>
                <p className="text-xs" style={{ color: 'var(--hint)' }}>скидка</p>
              </div>
            )}
            {profile.loyalty_cashback_percent > 0 && (
              <div>
                <p className="text-lg font-bold" style={{ color: '#10b981' }}>
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
        <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>
          🎁 Реферальная программа
        </p>
        <p className="text-xs mb-3" style={{ color: 'var(--hint)' }}>
          Поделись ссылкой и получи бонус за каждого друга
        </p>
        <button
          onClick={copyRef}
          className="flex items-center justify-between w-full p-3 rounded-xl active:scale-95 transition-transform"
          style={{ background: 'var(--bg)' }}
        >
          <code className="text-sm font-bold" style={{ color: 'var(--btn)' }}>
            {profile.referral_code}
          </code>
          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--hint)' }}>
            <Copy size={14} />
            Скопировать ссылку
          </div>
        </button>
      </div>

      {/* Меню */}
      {[
        { to: '/orders',   icon: <Package size={18} />,       label: 'Мои заказы' },
        { to: '/favorites', icon: <Heart size={18} />,         label: 'Избранное' },
        { to: '/support',  icon: <MessageCircle size={18} />,  label: 'Поддержка' },
      ].map(({ to, icon, label }) => (
        <Link
          key={to}
          to={to}
          className="flex items-center gap-3 p-4 rounded-2xl active:scale-98 transition-transform"
          style={{ background: 'var(--bg2)' }}
        >
          <span style={{ color: 'var(--btn)' }}>{icon}</span>
          <span className="font-medium text-sm" style={{ color: 'var(--text)' }}>{label}</span>
        </Link>
      ))}
    </div>
  )
}
