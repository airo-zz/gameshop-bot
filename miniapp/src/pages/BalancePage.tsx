// src/pages/BalancePage.tsx
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Wallet, TrendingUp, TrendingDown, Clock } from 'lucide-react'
import { profileApi, type BalanceTransaction } from '@/api'

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME ?? 'redonate_bot'

const TX_LABEL: Record<string, string> = {
  manual_credit:    'Пополнение',
  manual_debit:     'Списание',
  order_payment:    'Оплата заказа',
  order_refund:     'Возврат',
  cashback:         'Кэшбэк',
  referral_bonus:   'Реферальный бонус',
  top_up:           'Пополнение',
}

function txLabel(type: string) {
  return TX_LABEL[type] ?? type
}

function txIsCredit(type: string) {
  return ['manual_credit', 'order_refund', 'cashback', 'referral_bonus', 'top_up'].includes(type)
}

export default function BalancePage() {
  const navigate = useNavigate()

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.get,
    staleTime: 5 * 60 * 1000,
  })

  const { data: history = [], isLoading: historyLoading } = useQuery<BalanceTransaction[]>({
    queryKey: ['balance-history'],
    queryFn: profileApi.getBalanceHistory,
    staleTime: 60_000,
  })

  const isLoading = profileLoading

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
        <h1 className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>Баланс</h1>
      </div>

      {/* Balance card */}
      <div
        className="p-5 rounded-2xl"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(107,157,232,0.12)', border: '1px solid rgba(107,157,232,0.18)' }}
          >
            <Wallet size={18} style={{ color: '#6b9de8' }} />
          </div>
          <span className="text-sm font-medium" style={{ color: 'var(--hint)' }}>Текущий баланс</span>
        </div>
        {isLoading ? (
          <div className="h-10 w-40 rounded-xl animate-pulse" style={{ background: 'var(--bg3, rgba(255,255,255,0.05))' }} />
        ) : (
          <p className="text-3xl font-extrabold" style={{ color: '#6b9de8' }}>
            {Number(profile?.balance ?? 0).toLocaleString('ru')} ₽
          </p>
        )}
      </div>

      {/* Top-up section */}
      <div
        className="p-4 rounded-2xl space-y-3"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Пополнить баланс</p>
        <div
          className="flex items-start gap-3 p-3 rounded-xl"
          style={{ background: 'rgba(107,157,232,0.08)', border: '1px solid rgba(107,157,232,0.15)' }}
        >
          <Clock size={16} style={{ color: '#6b9de8', flexShrink: 0, marginTop: 1 }} />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--hint)' }}>
            Пополнение баланса доступно через бота{' '}
            <span style={{ color: '#6b9de8', fontWeight: 600 }}>@{BOT_USERNAME}</span>{' '}
            в Telegram. Откройте бота и выберите «Пополнить баланс».
          </p>
        </div>
        <a
          href={`https://t.me/${BOT_USERNAME}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center w-full py-3 rounded-xl font-semibold text-sm active:scale-[0.98] transition-transform"
          style={{ background: 'rgba(45,88,173,0.85)', color: '#fff' }}
        >
          Пополнить через @{BOT_USERNAME}
        </a>
      </div>

      {/* History */}
      <div>
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>История операций</p>

        {historyLoading ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--hint)' }}>Загрузка...</p>
        ) : history.length === 0 ? (
          <div
            className="flex flex-col items-center py-10 rounded-2xl gap-3"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
          >
            <Wallet size={32} style={{ color: 'var(--hint)', opacity: 0.4 }} />
            <p className="text-sm" style={{ color: 'var(--hint)' }}>Операций пока нет</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map(tx => {
              const isCredit = txIsCredit(tx.type)
              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 p-4 rounded-2xl"
                  style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: isCredit ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                      border: `1px solid ${isCredit ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
                    }}
                  >
                    {isCredit
                      ? <TrendingUp size={16} style={{ color: '#34d399' }} />
                      : <TrendingDown size={16} style={{ color: '#f87171' }} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                      {txLabel(tx.type)}
                    </p>
                    {tx.description && (
                      <p className="text-xs truncate mt-0.5" style={{ color: 'var(--hint)' }}>
                        {tx.description}
                      </p>
                    )}
                    <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>
                      {new Date(tx.created_at).toLocaleDateString('ru', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <p
                    className="text-sm font-bold flex-shrink-0"
                    style={{ color: isCredit ? '#34d399' : '#f87171' }}
                  >
                    {isCredit ? '+' : '−'}{Math.abs(tx.amount).toLocaleString('ru')} ₽
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}
