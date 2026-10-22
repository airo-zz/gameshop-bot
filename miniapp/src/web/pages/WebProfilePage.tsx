/**
 * src/web/pages/WebProfilePage.tsx
 * Личный кабинет на сайте: профиль, уровень лояльности (как в Mini App),
 * баланс, заказы, чат с оператором, способы входа (почта/Telegram),
 * реферальная программа с прогрессом друзей.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Wallet, Package, Copy, MessageCircle, LogOut, ChevronRight, CheckCircle, Mail, Send } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { profileApi } from '@/api'
import { getAuthMethods, setTokens, type TelegramWidgetUser } from '@/api/client'
import { BOT_USERNAME } from '@/config/appTarget'
import { useWebAuth } from '@/web/auth/useWebAuth'
import { money } from '@/web/format'
import Avatar from '@/web/components/Avatar'
import { LevelsTable, LoyaltyCard, LoyaltyInfoSheet, rub } from '@/components/loyalty/Loyalty'
import { Reveal } from '@/web/components/Motion'
import EmailCodeForm from '@/web/components/EmailCodeForm'
import TelegramLoginButton from '@/web/components/TelegramLoginButton'

export default function WebProfilePage() {
  const { user, logout } = useWebAuth()
  const [levelsOpen, setLevelsOpen] = useState(false)
  const [info, setInfo] = useState(false)
  const { data: referrals } = useQuery({
    queryKey: ['web', 'referrals'],
    queryFn: profileApi.getReferralStats,
    staleTime: 60_000,
  })

  if (!user) return null

  const refLink = `https://t.me/${BOT_USERNAME}?start=REF_${user.telegram_id}`
  const threshold = referrals?.threshold_amount ?? 0

  async function copyRef() {
    try {
      await navigator.clipboard.writeText(refLink)
      toast.success('Ссылка скопирована')
    } catch {
      toast.error('Не удалось скопировать — выделите ссылку вручную')
    }
  }

  return (
    <div className="web-container py-10 md:py-14 max-w-5xl">
      {/* Шапка профиля */}
      <div className="flex items-center gap-4 mb-8">
        <Avatar src={user.photo_url} name={user.first_name} size={64} />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl text-[var(--text)] truncate" style={{ margin: 0 }}>{user.first_name}</h1>
          {user.username && <p className="text-sm text-[var(--hint)] mt-1">@{user.username}</p>}
        </div>
        <button
          onClick={logout}
          className="hidden sm:inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm text-[var(--text-2)] bg-[var(--bg2)] hover:bg-[var(--bg3)] transition-colors"
        >
          <LogOut size={17} /> Выйти
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr] items-start">
        {/* Лояльность */}
        <div className="space-y-3">
          <Reveal>
            <LoyaltyCard
              profile={user}
              levelsOpen={levelsOpen}
              onToggleLevels={() => setLevelsOpen((v) => !v)}
              onInfo={() => setInfo(true)}
            />
          </Reveal>
          <AnimatePresence initial={false}>
            {levelsOpen && (
              <motion.div
                key="levels"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
                className="overflow-hidden"
              >
                <LevelsTable levels={user.loyalty_levels} currentIndex={user.loyalty_level_index} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Баланс и ссылки */}
        <div className="space-y-3">
          <Reveal delay={0.05}>
            <Link to="/balance" className="group block rounded-2xl bg-[var(--bg2)] p-5 hover:bg-[var(--bg3)] transition-colors">
              <p className="flex items-center gap-2 text-sm text-[var(--hint)]"><Wallet size={18} /> Баланс</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight num text-[var(--text)]">{money(user.balance)}</p>
              <p className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--link)]">
                Пополнить <ChevronRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </p>
            </Link>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="rounded-2xl bg-[var(--bg2)] overflow-hidden">
              <Link to="/orders" className="flex items-center gap-3 px-5 py-4 hover:bg-[var(--bg3)] transition-colors">
                <Package size={22} className="text-[var(--hint)]" />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-[var(--text)]">Мои заказы</span>
                  <span className="block text-xs text-[var(--hint)] mt-0.5 num">{user.orders_count} заказов · {money(user.total_spent)}</span>
                </span>
                <ChevronRight size={18} className="text-[var(--hint)]" />
              </Link>
              <Link to="/chat" className="flex items-center gap-3 px-5 py-4 border-t border-[var(--border)] hover:bg-[var(--bg3)] transition-colors">
                <MessageCircle size={22} className="text-[var(--hint)]" />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-[var(--text)]">Чат с оператором</span>
                  <span className="block text-xs text-[var(--hint)] mt-0.5">Вопросы по заказу и оплате</span>
                </span>
                <ChevronRight size={18} className="text-[var(--hint)]" />
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.15}>
            <SignInMethods />
          </Reveal>
        </div>

        {/* Рефералы (ссылка ведёт в бота — нужен Telegram) */}
        {user.has_telegram && <Reveal className="lg:col-span-2">
          <div className="rounded-2xl bg-[var(--bg2)] p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-xl">
                <p className="text-lg font-semibold text-[var(--text)]">Приглашайте друзей</p>
                <p className="text-sm text-[var(--text-2)] mt-1.5 leading-relaxed">
                  Друг получит скидку {user.referral_new_user_discount_percent}% на первый заказ, а вы — {rub(user.referral_bonus_amount)} на
                  баланс, когда он потратит {rub(user.referral_threshold_amount)}.
                </p>
              </div>
              {referrals && (
                <div className="flex gap-6 text-right">
                  <div><p className="text-xs text-[var(--hint)]">Приглашено</p><p className="text-xl font-semibold num">{referrals.referrals_count}</p></div>
                  <div><p className="text-xs text-[var(--hint)]">Заработано</p><p className="text-xl font-semibold num">{rub(referrals.earned_total)}</p></div>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mt-5">
              <div className="flex-1 min-w-0 h-12 flex items-center px-4 rounded-xl bg-[var(--bg3)] text-sm text-[var(--text-2)] truncate select-all">
                {refLink}
              </div>
              <button
                onClick={copyRef}
                className="inline-flex items-center justify-center gap-2 h-12 px-5 rounded-xl text-sm font-semibold text-[var(--text)] bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors"
              >
                <Copy size={17} /> Скопировать
              </button>
            </div>

            {referrals && referrals.referrals.length > 0 && (
              <div className="mt-5 rounded-xl overflow-hidden border border-[var(--border)]">
                {referrals.referrals.map((r, i) => (
                  <div key={r.telegram_id} className={'px-4 py-3 ' + (i ? 'border-t border-[var(--border)]' : '')}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-[var(--text)] truncate">
                        {r.first_name}{r.username && <span className="text-[var(--hint)]"> @{r.username}</span>}
                      </p>
                      {r.rewarded ? (
                        <span className="flex items-center gap-1 text-xs text-[#34d399] shrink-0">
                          <CheckCircle size={14} weight="fill" /> +{rub(referrals.bonus_amount)}
                        </span>
                      ) : (
                        <span className="text-xs num text-[var(--hint)] shrink-0">{rub(r.spent)} из {rub(threshold)}</span>
                      )}
                    </div>
                    {!r.rewarded && (
                      <div className="mt-2 h-1 rounded-full bg-[var(--bg3)] overflow-hidden">
                        <div className="h-full bg-[var(--accent)]" style={{ width: `${threshold ? Math.min(100, (r.spent / threshold) * 100) : 100}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Reveal>}
      </div>

      <button
        onClick={logout}
        className="sm:hidden mt-6 w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl text-sm text-[var(--text-2)] bg-[var(--bg2)]"
      >
        <LogOut size={17} /> Выйти
      </button>

      <LoyaltyInfoSheet open={info} onClose={() => setInfo(false)} levels={user.loyalty_levels} />
    </div>
  )
}

/** Способы входа: почта (вход по коду) и Telegram — показываем и даём привязать недостающий. */
function SignInMethods() {
  const { user, refresh } = useWebAuth()
  const [open, setOpen] = useState<'email' | 'telegram' | null>(null)
  const { data: methods } = useQuery({
    queryKey: ['web', 'auth-methods'],
    queryFn: getAuthMethods,
    staleTime: 10 * 60_000,
  })
  if (!user) return null
  const canEmail = !!methods?.email

  const linkEmailDone = async (email: string, code: string) => {
    await profileApi.verifyEmailLink(email, code)
    await refresh()
    setOpen(null)
    toast.success('Почта привязана')
  }

  const linkTelegram = async (tg: TelegramWidgetUser) => {
    try {
      const t = await profileApi.linkTelegram(tg)
      setTokens(t.access_token, t.refresh_token)
      await refresh()
      setOpen(null)
      toast.success('Telegram привязан')
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Не удалось привязать Telegram')
    }
  }

  const row = 'flex items-center gap-3 px-5 py-4'
  return (
    <div className="rounded-2xl bg-[var(--bg2)] overflow-hidden">
      <p className="px-5 pt-4 text-xs text-[var(--hint)]">Способы входа</p>

      <div className={row}>
        <Mail size={22} className="text-[var(--hint)]" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-[var(--text)]">Почта</span>
          <span className="block text-xs text-[var(--hint)] mt-0.5 truncate">{user.email ?? 'Не привязана'}</span>
        </span>
        {!user.email && canEmail && open !== 'email' && (
          <button onClick={() => setOpen('email')} className="text-sm font-medium text-[var(--link)] hover:text-[var(--text)]">Привязать</button>
        )}
      </div>
      {open === 'email' && (
        <div className="px-5 pb-5">
          <EmailCodeForm onRequest={profileApi.requestEmailLink} onVerify={linkEmailDone} submitLabel="Привязать почту" />
        </div>
      )}

      <div className={row + ' border-t border-[var(--border)]'}>
        <Send size={22} className="text-[var(--hint)]" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-[var(--text)]">Telegram</span>
          <span className="block text-xs text-[var(--hint)] mt-0.5 truncate">
            {user.has_telegram ? (user.username ? `@${user.username}` : 'Подключён') : 'Не привязан'}
          </span>
        </span>
        {!user.has_telegram && open !== 'telegram' && (
          <button onClick={() => setOpen('telegram')} className="text-sm font-medium text-[var(--link)] hover:text-[var(--text)]">Привязать</button>
        )}
      </div>
      {open === 'telegram' && (
        <div className="px-5 pb-5">
          <p className="text-xs text-[var(--hint)] mb-3">
            Заказы, баланс и кэшбэк станут общими с Telegram-ботом магазина.
          </p>
          <TelegramLoginButton onAuth={linkTelegram} size="medium" />
        </div>
      )}
    </div>
  )
}
