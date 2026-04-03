// src/pages/ProfilePage.tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Heart, Package, Copy, MessageCircle, ChevronRight } from 'lucide-react'
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
    <div className="px-4 pt-5 space-y-4">
      <div className="skeleton h-20 rounded-2xl" />
      <div className="skeleton h-24 rounded-2xl" />
      <div className="skeleton h-24 rounded-2xl" />
      <div className="skeleton h-14 rounded-2xl" />
      <div className="skeleton h-14 rounded-2xl" />
      <div className="skeleton h-14 rounded-2xl" />
    </div>
  )

  if (!profile) return null

  return (
    <div className="px-4 pt-5 pb-6 space-y-4 animate-fade-in">
      {/* Аватар + имя */}
      <div
        className="flex items-center gap-4 p-4 rounded-2xl"
        style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
        }}
      >
        {user?.photo_url ? (
          <img
            src={user.photo_url}
            alt=""
            className="w-14 h-14 rounded-full object-cover flex-shrink-0"
            style={{ border: '2px solid rgba(99,102,241,0.4)' }}
          />
        ) : (
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
            style={{
              background: 'rgba(99,102,241,0.1)',
              border: '2px solid rgba(99,102,241,0.3)',
            }}
          >
            👤
          </div>
        )}
        <div>
          <p className="text-lg font-bold tracking-tight" style={{ color: 'var(--text)' }}>
            {profile.first_name}
          </p>
          {profile.username && (
            <p className="text-sm" style={{ color: 'var(--hint)' }}>
              @{profile.username}
            </p>
          )}
          <span className="badge mt-1.5 inline-flex">
            {profile.loyalty_level_emoji} {profile.loyalty_level_name}
          </span>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'Баланс', value: `${profile.balance.toLocaleString('ru')} ₽`, accent: true },
          { label: 'Заказов', value: String(profile.orders_count), accent: false },
          { label: 'Потрачено', value: `${profile.total_spent.toLocaleString('ru')} ₽`, accent: false },
        ].map(({ label, value, accent }) => (
          <div
            key={label}
            className="rounded-2xl p-3 text-center"
            style={{
              background: accent ? 'rgba(99,102,241,0.08)' : 'var(--bg2)',
              border: accent ? '1px solid rgba(99,102,241,0.25)' : '1px solid var(--border)',
            }}
          >
            <p
              className="text-base font-bold"
              style={{ color: accent ? '#818cf8' : 'var(--text)' }}
            >
              {value}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--hint)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Лояльность */}
      {(profile.loyalty_discount_percent > 0 || profile.loyalty_cashback_percent > 0) && (
        <div
          className="p-4 rounded-2xl"
          style={{
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.2)',
          }}
        >
          <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>
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
                <p className="text-2xl font-extrabold" style={{ color: '#22c55e' }}>
                  {profile.loyalty_cashback_percent}%
                </p>
                <p className="text-xs" style={{ color: 'var(--hint)' }}>кэшбек</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Реферальный код */}
      <div
        className="p-4 rounded-2xl"
        style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
        }}
      >
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text)' }}>
          🎁 Реферальная программа
        </p>
        <p className="text-xs mb-3" style={{ color: 'var(--hint)' }}>
          Поделись ссылкой и получи бонус за каждого друга
        </p>
        <button
          onClick={copyRef}
          className="flex items-center justify-between w-full p-3 rounded-xl active:scale-95 transition-transform"
          style={{
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.2)',
          }}
        >
          <code className="text-sm font-bold tracking-widest" style={{ color: '#818cf8' }}>
            {profile.referral_code}
          </code>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--hint)' }}>
            <Copy size={13} />
            Скопировать
          </div>
        </button>
      </div>

      {/* Меню */}
      <div className="space-y-2">
        {[
          { to: '/orders',    icon: <Package size={18} />,      label: 'Мои заказы' },
          { to: '/favorites', icon: <Heart size={18} />,        label: 'Избранное' },
          { to: '/support',   icon: <MessageCircle size={18} />, label: 'Поддержка' },
        ].map(({ to, icon, label }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-3 p-4 rounded-2xl active:scale-[0.98] transition-all duration-200"
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
            }}
          >
            <span style={{ color: 'var(--accent)' }}>{icon}</span>
            <span className="font-medium text-sm flex-1" style={{ color: 'var(--text)' }}>
              {label}
            </span>
            <ChevronRight size={16} style={{ color: 'var(--hint)' }} />
          </Link>
        ))}
      </div>
    </div>
  )
}
