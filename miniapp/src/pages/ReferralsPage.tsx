// src/pages/ReferralsPage.tsx
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Users, Share2, ShoppingBag, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import { profileApi, type ReferralStats } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME ?? 'redonate_bot'

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
    toast.success('Ссылка скопирована!')
  }

  const handleShareTelegram = () => {
    if (!refLink) return
    tg?.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(refLink))
  }

  return (
    <motion.div
      className="px-4 pt-5 pb-6 space-y-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center justify-center w-9 h-9 rounded-xl active:scale-95 transition-transform flex-shrink-0"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
        >
          <ArrowLeft size={18} style={{ color: 'var(--text)' }} />
        </button>
        <h1 className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>Рефералы</h1>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2">
        <div
          className="p-4 rounded-2xl"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
        >
          <div style={{ color: '#6b9de8', opacity: 0.6, marginBottom: 6, display: 'flex' }}>
            <Users size={16} />
          </div>
          <p className="text-2xl font-extrabold" style={{ color: '#6b9de8' }}>
            {isLoading ? '—' : (stats?.referrals_count ?? 0)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>Приглашено</p>
        </div>
        <div
          className="p-4 rounded-2xl"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
        >
          <div style={{ color: '#34d399', opacity: 0.6, marginBottom: 6, display: 'flex' }}>
            <ShoppingBag size={16} />
          </div>
          <p className="text-2xl font-extrabold" style={{ color: '#34d399' }}>
            {isLoading ? '—' : (stats?.referrals?.filter(r => r.orders_count > 0).length ?? 0)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>Сделали заказ</p>
        </div>
      </div>

      {/* Referral link */}
      <div
        className="p-4 rounded-2xl space-y-3"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Ваша реферальная ссылка</p>
        <p className="text-xs" style={{ color: 'var(--hint)' }}>
          Поделитесь ссылкой — получите бонус, когда друг сделает первый заказ
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center flex-1 p-3 rounded-xl active:scale-95 transition-transform min-w-0"
            style={{ background: 'var(--bg3, rgba(255,255,255,0.04))', border: '1px solid var(--border)' }}
          >
            <code className="text-xs font-bold truncate" style={{ color: '#6b9de8' }}>
              {profile
                ? `t.me/${BOT_USERNAME}?start=REF_${profile.telegram_id}`
                : 'Загрузка...'}
            </code>
          </button>
          <button
            type="button"
            onClick={handleShareTelegram}
            className="flex items-center justify-center active:scale-90 transition-transform flex-shrink-0"
            style={{
              width: 40, height: 40,
              borderRadius: 12,
              background: 'rgba(45,88,173,0.15)',
              border: '1px solid rgba(45,88,173,0.25)',
              color: '#6b9de8',
            }}
          >
            <Share2 size={16} />
          </button>
        </div>
      </div>

      {/* List of referrals */}
      <div>
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Список рефералов</p>

        {isLoading ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--hint)' }}>Загрузка...</p>
        ) : !stats || stats.referrals.length === 0 ? (
          <div
            className="flex flex-col items-center py-10 rounded-2xl gap-3"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
          >
            <Users size={32} style={{ color: 'var(--hint)', opacity: 0.4 }} />
            <p className="text-sm" style={{ color: 'var(--hint)' }}>Рефералов пока нет</p>
            <p className="text-xs text-center px-6" style={{ color: 'var(--hint)', opacity: 0.6 }}>
              Поделитесь ссылкой с друзьями, чтобы они появились здесь
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {stats.referrals.map(ref => {
              const hasOrder = ref.orders_count > 0
              const initial = ref.first_name.charAt(0).toUpperCase()
              return (
                <div
                  key={ref.telegram_id}
                  className="flex items-center gap-3 p-4 rounded-2xl"
                  style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
                >
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                    style={{
                      background: 'linear-gradient(135deg, #2d58ad, #7c3aed)',
                      color: '#fff',
                    }}
                  >
                    {initial}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                        {ref.first_name}
                      </p>
                      {ref.username && (
                        <p className="text-xs truncate" style={{ color: 'var(--hint)' }}>
                          @{ref.username}
                        </p>
                      )}
                    </div>

                    {/* Status / progress */}
                    {hasOrder ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <div
                          className="h-1.5 flex-1 rounded-full overflow-hidden"
                          style={{ background: 'rgba(255,255,255,0.08)' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: '100%',
                              background: 'linear-gradient(90deg, #34d399, #059669)',
                            }}
                          />
                        </div>
                        <p className="text-xs font-semibold flex-shrink-0" style={{ color: '#34d399' }}>
                          Бонус получен
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-1">
                        <div
                          className="h-1.5 flex-1 rounded-full overflow-hidden"
                          style={{ background: 'rgba(255,255,255,0.08)' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: '0%',
                              background: 'linear-gradient(90deg, #2d58ad, #6b9de8)',
                            }}
                          />
                        </div>
                        <p className="text-xs flex-shrink-0" style={{ color: 'var(--hint)' }}>
                          Ещё не совершал покупок
                        </p>
                      </div>
                    )}

                    {/* Joined date */}
                    <div className="flex items-center gap-1 mt-1">
                      <Calendar size={10} style={{ color: 'var(--hint)' }} />
                      <p className="text-xs" style={{ color: 'var(--hint)' }}>
                        {new Date(ref.joined_at).toLocaleDateString('ru', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Orders count badge */}
                  <div
                    className="flex flex-col items-center flex-shrink-0"
                    style={{ minWidth: 36 }}
                  >
                    <p
                      className="text-base font-bold"
                      style={{ color: hasOrder ? '#34d399' : 'var(--hint)' }}
                    >
                      {ref.orders_count}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--hint)' }}>заказов</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}
