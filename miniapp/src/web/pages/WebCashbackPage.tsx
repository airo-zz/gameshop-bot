/**
 * src/web/pages/WebCashbackPage.tsx
 * Публичная страница программы лояльности: как работает кэшбэк, все уровни,
 * условия реферальной программы. Залогиненному — его текущий уровень сверху.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { catalogApi } from '@/api'
import { useWebAuth } from '@/web/auth/useWebAuth'
import { LevelsTable, LoyaltyCard, LoyaltyInfoSheet, rub } from '@/components/loyalty/Loyalty'
import { Reveal, Stagger, StaggerItem } from '@/web/components/Motion'

const RULES = [
  { title: 'Уровень — по тратам за месяц', text: 'Считаются все оплаченные заказы с 1-го по последнее число календарного месяца (по Москве).' },
  { title: 'Держится ещё месяц', text: 'Достигнутый уровень сохраняется весь следующий месяц. Не набрали ту же сумму — с 1-го числа уровень станет тем, до которого дошли.' },
  { title: 'Кэшбэк на баланс', text: 'Начисляется, когда заказ выполнен. Балансом можно оплатить заказ целиком или частично.' },
  { title: 'Лимит в месяц', text: 'У каждого уровня свой потолок кэшбэка. С нового месяца лимит обнуляется.' },
]

export default function WebCashbackPage() {
  const { user } = useWebAuth()
  const [levelsOpen, setLevelsOpen] = useState(true)
  const [info, setInfo] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ['web', 'loyalty'], queryFn: catalogApi.getLoyaltyProgram, staleTime: 10 * 60_000 })
  const levels = data?.levels ?? []
  const ref = data?.referral

  return (
    <div className="web-container py-10 md:py-14">
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-10 lg:gap-14 items-start">
        <div>
          <h1 className="text-3xl md:text-[2.5rem] leading-tight text-[var(--text)]" style={{ margin: 0 }}>
            Кэшбэк{levels.length ? ` до ${levels[levels.length - 1].cashback_percent}%` : ''}<br />с каждой покупки
          </h1>
          <p className="mt-4 text-[var(--text-2)] leading-relaxed max-w-md">
            Чем больше тратите за месяц, тем выше уровень и процент, который возвращается на баланс.
          </p>

          <Stagger className="mt-8 space-y-5">
            {RULES.map((r) => (
              <StaggerItem key={r.title}>
                <p className="text-base font-semibold text-[var(--text)]">{r.title}</p>
                <p className="mt-1 text-sm text-[var(--text-2)] leading-relaxed max-w-md">{r.text}</p>
              </StaggerItem>
            ))}
          </Stagger>

          {ref && (
            <Reveal className="mt-10">
              <div className="rounded-2xl bg-[var(--bg2)] p-6">
                <p className="text-base font-semibold text-[var(--text)]">Приглашайте друзей</p>
                <p className="mt-1.5 text-sm text-[var(--text-2)] leading-relaxed">
                  Друг получит скидку {ref.new_user_discount_percent}% на первый заказ, а вы — {rub(ref.bonus_amount)} на
                  баланс, когда он потратит {rub(ref.threshold_amount)}.
                </p>
                <Link
                  to={user ? '/profile' : '/login'}
                  className="mt-4 inline-flex items-center h-10 px-4 rounded-xl text-sm font-semibold text-[var(--text)] bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors"
                >
                  {user ? 'Моя реферальная ссылка' : 'Войти и получить ссылку'}
                </Link>
              </div>
            </Reveal>
          )}
        </div>

        <div className="space-y-3">
          {user && (
            <Reveal>
              <LoyaltyCard
                profile={user}
                levelsOpen={levelsOpen}
                onToggleLevels={() => setLevelsOpen((v) => !v)}
                onInfo={() => setInfo(true)}
              />
            </Reveal>
          )}
          {isLoading ? (
            <div className="h-96 rounded-2xl animate-pulse bg-[var(--bg2)]" />
          ) : (levelsOpen || !user) && (
            <Reveal delay={0.05}>
              <LevelsTable levels={levels} currentIndex={user ? user.loyalty_level_index : -1} />
            </Reveal>
          )}
        </div>
      </div>
      <LoyaltyInfoSheet open={info} onClose={() => setInfo(false)} levels={levels} />
    </div>
  )
}
