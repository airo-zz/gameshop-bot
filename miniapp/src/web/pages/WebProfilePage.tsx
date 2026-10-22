/**
 * src/web/pages/WebProfilePage.tsx
 * Личный кабинет на сайте: профиль, баланс, уровень лояльности,
 * реферальная программа, быстрые ссылки на заказы и поддержку.
 */

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Wallet, Package, Users, Copy, Headphones, LogOut, ChevronRight, Award } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { profileApi } from '@/api'
import { BOT_USERNAME, SUPPORT_BOT_URL } from '@/config/appTarget'
import { useWebAuth } from '@/web/auth/useWebAuth'
import { money } from '@/web/format'

export default function WebProfilePage() {
  const { user, logout } = useWebAuth()
  const { data: referrals } = useQuery({
    queryKey: ['web', 'referrals'],
    queryFn: profileApi.getReferralStats,
    staleTime: 60_000,
  })

  if (!user) return null

  const refLink = `https://t.me/${BOT_USERNAME}?start=REF_${user.telegram_id}`
  // Уровень — по тратам за календарный месяц (модель Bybit), считается на бэкенде
  const monthSpent = Number(user.loyalty_month_spent ?? 0)
  const nextMin = user.loyalty_next_level_min_spent != null ? Number(user.loyalty_next_level_min_spent) : null
  const next = user.loyalty_next_level_name && nextMin != null ? { name: user.loyalty_next_level_name, min_spent: nextMin } : null
  const progress = next ? Math.min(100, (monthSpent / next.min_spent) * 100) : 100

  async function copyRef() {
    try {
      await navigator.clipboard.writeText(refLink)
      toast.success('Ссылка скопирована')
    } catch {
      toast.error('Не удалось скопировать')
    }
  }

  return (
    <div className="web-container py-8 md:py-12 max-w-4xl">
      {/* Шапка профиля */}
      <div className="flex items-center gap-4 mb-8">
        {user.photo_url ? (
          <img src={user.photo_url} alt="" className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white" style={{ background: 'var(--gradient-primary)' }}>
            {(user.first_name || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white truncate">{user.first_name}</h1>
          {user.username && <p className="text-sm text-[var(--hint)]">@{user.username}</p>}
        </div>
        <button
          onClick={logout}
          className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-[var(--text-2)] border border-white/10 hover:bg-[var(--bg3)] hover:text-white transition-colors"
        >
          <LogOut size={16} /> Выйти
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Баланс */}
        <Link to="/balance" className="rounded-3xl p-6 relative overflow-hidden group" style={{ background: 'var(--gradient-primary)' }}>
          <div className="flex items-center gap-2 text-[var(--text-2)] text-sm font-medium"><Wallet size={18} /> Баланс</div>
          <p className="text-3xl font-bold text-white mt-3">{money(user.balance)}</p>
          <span className="inline-flex items-center gap-1 mt-4 text-sm font-semibold text-white bg-white/15 rounded-xl px-3.5 py-2 group-hover:bg-white/25 transition-colors">
            Пополнить <ChevronRight size={16} />
          </span>
        </Link>

        {/* Лояльность */}
        <div className="rounded-3xl border border-white/[0.06] bg-[var(--bg2)] p-6">
          <div className="flex items-center gap-2 text-[var(--text-2)] text-sm font-medium"><Award size={18} /> Уровень</div>
          <p className="text-2xl font-bold mt-3" style={{ color: user.loyalty_color_hex || 'var(--link)' }}>
            {user.loyalty_level_name || 'Новичок'}
          </p>
          <p className="text-xs text-[var(--hint)] mt-1">
            Кэшбэк {Number(user.loyalty_cashback_percent)}% на баланс
            {user.loyalty_cashback_cap != null ? ` · до ${money(Number(user.loyalty_cashback_cap))} в месяц` : ''}
          </p>
          {next && (
            <>
              <div className="h-1.5 rounded-full bg-[var(--bg3)] mt-4 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${progress}%`, background: user.loyalty_color_hex || 'var(--accent)' }} />
              </div>
              <p className="text-xs text-[var(--hint)] mt-2">
                Траты в этом месяце: {money(monthSpent)} · до уровня «{next.name}» {money(Math.max(0, next.min_spent - monthSpent))}
              </p>
            </>
          )}
        </div>

        {/* Статистика */}
        <Link to="/orders" className="rounded-3xl border border-white/[0.06] bg-[var(--bg2)] p-6 hover:bg-[var(--bg2)] transition-colors flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.15)', color: 'var(--link)' }}>
            <Package size={22} />
          </div>
          <div className="flex-1">
            <p className="text-base font-semibold text-white">Мои заказы</p>
            <p className="text-xs text-[var(--hint)]">{user.orders_count} заказов · потрачено {money(user.total_spent)}</p>
          </div>
          <ChevronRight size={18} className="text-[var(--hint)]" />
        </Link>

        <a href={SUPPORT_BOT_URL} target="_blank" rel="noopener noreferrer" className="rounded-3xl border border-white/[0.06] bg-[var(--bg2)] p-6 hover:bg-[var(--bg2)] transition-colors flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.15)', color: 'var(--link)' }}>
            <Headphones size={22} />
          </div>
          <div className="flex-1">
            <p className="text-base font-semibold text-white">Поддержка</p>
            <p className="text-xs text-[var(--hint)]">Ответим на вопросы по заказу и оплате</p>
          </div>
          <ChevronRight size={18} className="text-[var(--hint)]" />
        </a>

        {/* Рефералы */}
        <div className="md:col-span-2 rounded-3xl border border-white/[0.06] bg-[var(--bg2)] p-6">
          <div className="flex items-center gap-2 text-[var(--text-2)] text-sm font-medium"><Users size={18} /> Пригласите друзей</div>
          <p className="text-sm text-[var(--hint)] mt-2">
            Получайте бонус на баланс за первую оплату каждого приглашённого друга.
            {referrals ? ` Приглашено: ${referrals.referrals_count}.` : ''}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <div className="flex-1 min-w-0 bg-[var(--bg2)] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-[var(--text-2)] truncate select-all">
              {refLink}
            </div>
            <button
              onClick={copyRef}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'var(--gradient-primary)' }}
            >
              <Copy size={16} /> Скопировать
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={logout}
        className="sm:hidden mt-6 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm text-[var(--text-2)] border border-white/10"
      >
        <LogOut size={16} /> Выйти
      </button>
    </div>
  )
}
