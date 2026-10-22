// src/pages/ProfilePage.tsx
import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Heart, Package, Share2, MessageCircle, Wallet, ShoppingBag, Users, Gift, Settings, FileText, ChevronDown, Copy } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { profileApi, ordersApi, catalogApi, supportApi, type LoyaltyLevelEntry, type Profile } from '@/api'
import { adminApi, type AdminMe } from '@/api/admin'
import { useTelegram } from '@/hooks/useTelegram'

// ── Лояльность (модель Bybit: уровень по тратам за месяц, только кэшбэк) ──────

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
  'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле',
  'августе', 'сентябре', 'октябре', 'ноябре', 'декабре']

const rub = (n: number | string) => `${Number(n).toLocaleString('ru', { maximumFractionDigits: 2 })} ₽`
const pct = (n: number | string) => `${Number(n).toLocaleString('ru', { maximumFractionDigits: 2 })}%`

function LoyaltyCard({ profile, onToggleLevels, levelsOpen }: {
  profile: Profile
  onToggleLevels: () => void
  levelsOpen: boolean
}) {
  const color = profile.loyalty_color_hex
  const spent = Number(profile.loyalty_month_spent)
  const nextMin = profile.loyalty_next_level_min_spent != null ? Number(profile.loyalty_next_level_min_spent) : null
  const cap = profile.loyalty_cashback_cap != null ? Number(profile.loyalty_cashback_cap) : null
  const got = Number(profile.loyalty_month_cashback)
  const progress = nextMin ? Math.min(100, (spent / nextMin) * 100) : 100

  // Сейчас идёт месяц N; уровень, достигнутый в N, держится до конца N+1
  const now = new Date()
  const monthNow = MONTHS_PREP[now.getMonth()]
  const holdUntil = profile.loyalty_period_ends_at ? new Date(profile.loyalty_period_ends_at) : null
  const lastDay = holdUntil ? new Date(holdUntil.getTime() - 1) : null

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 'var(--r-card)',
        background: 'var(--bg2)',
        padding: '18px 16px 16px 20px',
        overflow: 'hidden',
      }}
    >
      {/* Полоса цвета уровня — единственный цветной акцент страницы */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: color }} />

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <p className="font-display" style={{ margin: 0, fontSize: 22, lineHeight: 1.15, color }}>
          {profile.loyalty_level_name}
        </p>
        <p className="font-display num" style={{ margin: 0, fontSize: 22, lineHeight: 1.15, color: 'var(--text)' }}>
          {pct(profile.loyalty_cashback_percent)}
        </p>
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--hint)' }}>
        Кэшбэк на баланс с каждого выполненного заказа
      </p>

      {/* Кэшбэк за месяц и потолок */}
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ color: 'var(--hint)' }}>Получено в {monthNow}</span>
        <span className="num" style={{ color: 'var(--text)', fontWeight: 500 }}>
          {rub(got)}{cap != null && <span style={{ color: 'var(--hint)' }}> из {rub(cap)}</span>}
        </span>
      </div>

      {/* Прогресс месяца к следующему уровню */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
          <span style={{ color: 'var(--hint)' }}>Траты в {monthNow}</span>
          <span className="num" style={{ color: 'var(--text)', fontWeight: 500 }}>
            {rub(spent)}{nextMin != null && <span style={{ color: 'var(--hint)' }}> / {rub(nextMin)}</span>}
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--bg3)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--hint)', lineHeight: 1.4 }}>
          {profile.loyalty_next_level_name && nextMin != null
            ? <>До уровня «{profile.loyalty_next_level_name}» осталось <span className="num" style={{ color: 'var(--text)' }}>{rub(Math.max(0, nextMin - spent))}</span></>
            : 'Это максимальный уровень'}
          {profile.loyalty_held_from_prev_month && lastDay && (
            <> · уровень сохранён за прошлый месяц, действует по {lastDay.getDate()} {MONTHS_GEN[lastDay.getMonth()]}</>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={onToggleLevels}
        style={{
          marginTop: 12, padding: 0, background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: 500, color: 'var(--link)', display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        {levelsOpen ? 'Скрыть уровни' : `Все уровни (${profile.loyalty_levels.length})`}
        <ChevronDown size={14} style={{ transform: levelsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
      </button>
    </div>
  )
}

function LevelsTable({ levels, currentIndex }: { levels: LoyaltyLevelEntry[]; currentIndex: number }) {
  return (
    <div style={{ borderRadius: 'var(--r-card)', background: 'var(--bg2)', padding: '4px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', columnGap: 16, padding: '8px 16px', fontSize: 12, color: 'var(--hint)' }}>
        <span>Траты за месяц</span>
        <span style={{ textAlign: 'right' }}>Кэшбэк</span>
        <span style={{ textAlign: 'right', minWidth: 72 }}>Лимит/мес</span>
      </div>
      {levels.map((lv, i) => {
        const isCurrent = i === currentIndex
        return (
          <div
            key={lv.name}
            style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto', columnGap: 16, alignItems: 'center',
              padding: '9px 16px', fontSize: 14,
              background: isCurrent ? 'var(--bg3)' : 'transparent',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: lv.color_hex, flexShrink: 0 }} />
              <span style={{ color: isCurrent ? 'var(--text)' : 'var(--text)', fontWeight: isCurrent ? 600 : 400, whiteSpace: 'nowrap' }}>{lv.name}</span>
              <span className="num" style={{ color: 'var(--hint)', fontSize: 12, whiteSpace: 'nowrap' }}>от {rub(lv.min_spent)}</span>
            </span>
            <span className="num" style={{ textAlign: 'right', color: 'var(--text)' }}>{pct(lv.cashback_percent)}</span>
            <span className="num" style={{ textAlign: 'right', minWidth: 72, color: 'var(--hint)' }}>
              {lv.monthly_cashback_cap != null ? rub(lv.monthly_cashback_cap) : 'без лимита'}
            </span>
          </div>
        )
      })}
      <p style={{ margin: 0, padding: '10px 16px 8px', fontSize: 12, color: 'var(--hint)', lineHeight: 1.45 }}>
        Уровень считается по тратам за календарный месяц. Достигнутый уровень сохраняется
        и на весь следующий месяц, затем пересчитывается.
      </p>
    </div>
  )
}

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME ?? 'reDonate_robot'

const MENU_ITEMS = [
  { to: '/orders',    icon: <Package size={18} />,       label: 'Мои заказы' },
  { to: '/favorites', icon: <Heart size={18} />,         label: 'Избранное' },
  { to: '/support',   icon: <MessageCircle size={18} />, label: 'Поддержка' },
]

const LEGAL_DOCS = [
  { label: 'Политика конфиденциальности', file: 'privacy.html' },
  { label: 'Условия сервиса',            file: 'terms.html' },
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
      onError={onError}
    />
  ) : (
    <div
      className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 text-2xl font-bold"
      style={{
        background: 'var(--accent)',
        color: '#fff',
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
          className="flex flex-col items-center gap-2 py-4 px-2 rounded-2xl active:opacity-80"
          style={{
            background: 'var(--bg2)',
            cursor: 'pointer',
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'var(--bg3)',
            }}
          >
            <span style={{ color: 'var(--link)' }}>{icon}</span>
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
  const { user, haptic, tg, openLink } = useTelegram()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const navigating = useRef(false)
  const [avatarError, setAvatarError] = useState(false)
  const [showLevels, setShowLevels] = useState(false)
  const [showDocs, setShowDocs] = useState(false)

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
  
  if (!profile) {
    return (
      <div className="px-4 pt-5 pb-6 space-y-4">
        <div className="flex flex-col gap-3 p-4 rounded-2xl" style={{ background: 'var(--bg2)' }}>
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
        <div className="p-4 rounded-2xl" style={{ background: 'var(--bg2)' }}>
          <p className="text-sm" style={{ color: 'var(--hint)' }}>Данные профиля временно недоступны. Попробуй позже.</p>
        </div>
        <MenuBlock />
      </div>
    )
  }

  return (
    <div className="px-4 pt-5 pb-6 space-y-3">

      {/* ── Профиль ── */}
      <div className="flex items-center gap-3 px-1">
        <AvatarBlock showAvatar={showAvatar} avatarSrc={avatarSrc} avatarInitial={avatarInitial} onError={() => setAvatarError(true)} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate" style={{ margin: 0, fontSize: 18, color: 'var(--text)' }}>
            {profile.first_name}
          </h1>
          {profile.username && (
            <p className="text-sm truncate" style={{ color: 'var(--hint)', marginTop: 2 }}>@{profile.username}</p>
          )}
        </div>
      </div>

      {/* ── Лояльность ── */}
      <LoyaltyCard profile={profile} levelsOpen={showLevels} onToggleLevels={() => setShowLevels(v => !v)} />
      {showLevels && (
        <LevelsTable levels={loyaltyLevels} currentIndex={profile.loyalty_level_index} />
      )}

      {/* ── Статистика ── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Баланс',    value: rub(profile.balance), icon: <Wallet size={14} />, to: '/balance' },
          { label: 'Заказов',   value: String(profile.orders_count), icon: <ShoppingBag size={14} />, to: '/orders' },
          { label: 'Друзей',    value: String(profile.referrals_count), icon: <Users size={14} />, to: '/referrals' },
        ].map(({ label, value, icon, to }) => (
          <div
            key={label}
            onClick={() => handleStatClick(to)}
            style={{ background: 'var(--bg2)', borderRadius: 'var(--r-card)', padding: '12px', display: 'block', cursor: 'pointer' }}
            className="active:opacity-80"
          >
            <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--hint)' }}>{icon}{label}</p>
            <p className="font-display num truncate" style={{ color: 'var(--text)', fontSize: 16, marginTop: 6 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Реферальная программа ── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <Gift size={16} style={{ color: 'var(--link)' }} />
          <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Реферальная программа</p>
        </div>
        <p className="text-sm mb-3" style={{ color: 'var(--hint)', lineHeight: 1.45 }}>
          Друг получит скидку {pct(profile.referral_new_user_discount_percent)} на первый заказ,
          а вы — {rub(profile.referral_bonus_amount)} на баланс, когда он потратит {rub(profile.referral_threshold_amount)}.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-2 flex-1 p-3 rounded-xl active:opacity-80"
            style={{ background: 'var(--bg3)', minWidth: 0 }}
          >
            <span className="text-xs truncate flex-1 text-left" style={{ color: 'var(--text)' }}>
              t.me/{BOT_USERNAME}?start=REF_{profile.telegram_id}
            </span>
            <Copy size={16} style={{ color: 'var(--hint)', flexShrink: 0 }} />
          </button>
          <button
            type="button"
            onClick={handleShareTelegram}
            aria-label="Поделиться"
            className="flex items-center justify-center active:opacity-80 flex-shrink-0"
            style={{
              width: 44, height: 44,
              borderRadius: 'var(--r-control)',
              background: 'var(--accent)', color: '#fff',
            }}
          >
            <Share2 size={16} />
          </button>
        </div>
      </div>

      {/* ── Меню ── */}
      <MenuBlock />

      {/* ── Документы (раскрывающийся блок) ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => { setShowDocs(v => !v); haptic.select() }}
          className="w-full flex items-center gap-3 p-4 active:scale-[0.99] transition-transform"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'var(--bg3)',
            }}
          >
            <FileText size={18} style={{ color: 'var(--link)' }} />
          </div>
          <span className="flex-1 text-left text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Документы
          </span>
          <ChevronDown
            size={18}
            style={{
              color: 'var(--hint)',
              transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
              transform: showDocs ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </button>

        <div style={{
          display: 'grid',
          gridTemplateRows: showDocs ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.32s cubic-bezier(0.4,0,0.2,1)',
        }}>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', flexDirection: 'column', padding: '0 12px 12px' }}>
              {LEGAL_DOCS.map(doc => (
                <button
                  key={doc.file}
                  type="button"
                  onClick={() => { haptic.impact('light'); openLink(`${window.location.origin}/app/legal/${doc.file}`) }}
                  className="flex items-center gap-2 py-3 px-2 rounded-xl active:scale-[0.98] transition-transform text-left"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <FileText size={14} style={{ color: 'var(--hint)', flexShrink: 0 }} />
                  <span className="text-sm" style={{ color: 'var(--link)' }}>{doc.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Админ-панель (только для админов) ── */}
      {adminProfile && (
        <Link
          to="/admin"
          className="flex items-center gap-3 p-4 rounded-2xl active:scale-[0.97] transition-transform"
          style={{
            background: 'var(--bg2)',
            textDecoration: 'none',
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'var(--bg3)',
            }}
          >
            <Settings size={18} style={{ color: 'var(--link)' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--link)' }}>Админ-панель</p>
            <p className="text-xs" style={{ color: 'var(--hint)' }}>{adminProfile.role}</p>
          </div>
        </Link>
      )}
    </div>
  )
}
