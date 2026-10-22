// src/pages/ReferralsPage.tsx
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Users, Share2, Copy, CheckCircle } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { profileApi, type ReferralStats } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'
import { fmtNum } from '@/utils/format'

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME ?? 'reDonate_robot'

const rub = (n: number | string) => `${fmtNum(n)} ₽`

export default function ReferralsPage() {
  const navigate = useNavigate()
  const { haptic, tg } = useTelegram()

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.get,
    staleTime: 5 * 60 * 1000,
  })

  const { data: stats, isLoading } = useQuery<ReferralStats>({
    queryKey: ['referral-stats'],
    queryFn: profileApi.getReferralStats,
    staleTime: 60_000,
  })

  const refLink = profile ? `https://t.me/${BOT_USERNAME}?start=REF_${profile.telegram_id}` : ''

  const handleCopyLink = () => {
    if (!refLink) return
    navigator.clipboard.writeText(refLink)
    haptic.success()
    toast.success('Ссылка скопирована')
  }

  const handleShareTelegram = () => {
    if (!refLink) return
    tg?.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(refLink))
  }

  return (
    <div className="px-4 pt-5 pb-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Назад"
          onClick={() => navigate(-1)}
          className="flex items-center justify-center w-10 h-10 rounded-xl active:opacity-70 flex-shrink-0"
          style={{ background: 'var(--bg2)' }}
        >
          <ArrowLeft size={20} style={{ color: 'var(--text)' }} />
        </button>
        <h1 style={{ margin: 0, fontSize: 20, color: 'var(--text)' }}>Друзья</h1>
      </div>

      {/* Условия */}
      {stats && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--bg2)' }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs" style={{ color: 'var(--hint)' }}>Вам с заказов друга</p>
              <p className="font-display num" style={{ fontSize: 20, color: 'var(--text)', marginTop: 4 }}>
                {Number(stats.percent).toLocaleString('ru-RU')}%
              </p>
              <p className="text-[11px]" style={{ color: 'var(--hint)', marginTop: 2 }}>
                {stats.period_months ? `${stats.period_months} мес. с регистрации друга` : 'без ограничения срока'}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--hint)' }}>Другу на первый заказ</p>
              <p className="font-display num" style={{ fontSize: 20, color: 'var(--text)', marginTop: 4 }}>
                −{stats.new_user_discount_percent}%
              </p>
            </div>
          </div>
          <p className="text-sm mt-3" style={{ color: 'var(--hint)', lineHeight: 1.45 }}>
            С каждого выполненного заказа друга вам на баланс приходит {Number(stats.percent).toLocaleString('ru-RU')}% от суммы
            {stats.period_months ? ` — в течение ${stats.period_months} мес. после его регистрации` : ' — без ограничения срока'}.
          </p>
        </div>
      )}

      {/* Ссылка */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCopyLink}
          className="flex items-center gap-2 flex-1 px-3 rounded-xl active:opacity-80 min-w-0"
          style={{ background: 'var(--bg2)', height: 48 }}
        >
          <span className="text-sm truncate flex-1 text-left" style={{ color: 'var(--text)' }}>
            {profile ? `t.me/${BOT_USERNAME}?start=REF_${profile.telegram_id}` : 'Загрузка...'}
          </span>
          <Copy size={18} style={{ color: 'var(--hint)', flexShrink: 0 }} />
        </button>
        <button
          type="button"
          aria-label="Поделиться в Telegram"
          onClick={handleShareTelegram}
          className="flex items-center justify-center active:opacity-80 flex-shrink-0 rounded-xl"
          style={{ width: 48, height: 48, background: 'var(--accent)', color: '#fff' }}
        >
          <Share2 size={20} />
        </button>
      </div>

      {/* Итоги */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-2xl" style={{ background: 'var(--bg2)' }}>
          <p className="text-xs" style={{ color: 'var(--hint)' }}>Приглашено</p>
          <p className="font-display num" style={{ fontSize: 18, color: 'var(--text)', marginTop: 4 }}>
            {isLoading ? '—' : (stats?.referrals_count ?? 0)}
          </p>
        </div>
        <div className="p-3 rounded-2xl" style={{ background: 'var(--bg2)' }}>
          <p className="text-xs" style={{ color: 'var(--hint)' }}>Заработано</p>
          <p className="font-display num" style={{ fontSize: 18, color: 'var(--text)', marginTop: 4 }}>
            {isLoading ? '—' : rub(stats?.earned_total ?? 0)}
          </p>
        </div>
      </div>

      {/* Список друзей */}
      <div>
        <p className="font-semibold mb-2" style={{ color: 'var(--text)', fontSize: 15 }}>Ваши друзья</p>

        {isLoading ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--hint)' }}>Загрузка...</p>
        ) : !stats || stats.referrals.length === 0 ? (
          <div className="flex flex-col items-center py-10 rounded-2xl gap-2 px-6 text-center" style={{ background: 'var(--bg2)' }}>
            <Users size={28} style={{ color: 'var(--hint)' }} />
            <p className="text-sm" style={{ color: 'var(--text)' }}>Пока никого</p>
            <p className="text-sm" style={{ color: 'var(--hint)' }}>
              Отправьте ссылку другу — он появится здесь сразу после входа в бота
            </p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg2)' }}>
            {stats.referrals.map((ref, i) => {
              return (
                <div
                  key={ref.telegram_id}
                  className="px-4 py-3"
                  style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm truncate" style={{ color: 'var(--text)', fontWeight: 500 }}>
                      {ref.first_name}
                      {ref.username && <span style={{ color: 'var(--hint)', fontWeight: 400 }}> @{ref.username}</span>}
                    </p>
                    {ref.earned > 0 ? (
                      <span className="flex items-center gap-1 text-xs num flex-shrink-0" style={{ color: '#34d399' }}>
                        <CheckCircle size={14} weight="fill" /> +{rub(ref.earned)}
                      </span>
                    ) : (
                      <span className="text-xs flex-shrink-0" style={{ color: 'var(--hint)' }}>
                        пока без заказов
                      </span>
                    )}
                  </div>
                  <p className="text-xs num mt-1" style={{ color: 'var(--hint)' }}>
                    Заказов: {ref.orders_count} · потратил {rub(ref.spent)}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
