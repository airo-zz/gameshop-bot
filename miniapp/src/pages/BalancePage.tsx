// src/pages/BalancePage.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Wallet, TrendingUp, TrendingDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { profileApi, paymentsApi, type BalanceTransaction } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME ?? 'redonate_bot'

const PRESET_AMOUNTS = [100, 300, 500, 1000]
const CRYPTO_CURRENCIES = ['USDT', 'TON', 'BTC', 'ETH'] as const
type CryptoCurrency = typeof CRYPTO_CURRENCIES[number]
type PaymentMethod = 'card_yukassa' | 'crypto'

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
  const { tg, haptic, openLink } = useTelegram()

  const [amount, setAmount] = useState<string>('')
  const [method, setMethod] = useState<PaymentMethod>('card_yukassa')
  const [currency, setCurrency] = useState<CryptoCurrency>('USDT')
  const [loading, setLoading] = useState(false)

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

  const numericAmount = Number(amount)
  const canSubmit = numericAmount >= 10 && !loading

  async function handleTopup() {
    if (!canSubmit) return
    haptic.impact('medium')
    setLoading(true)
    try {
      const res = await paymentsApi.topupBalance(
        numericAmount,
        method,
        method === 'crypto' ? currency : undefined
      )
      const url = res.redirect_url ?? res.pay_url
      if (url) {
        toast.success('Переход к оплате...')
        openLink(url)
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? 'Ошибка оплаты'
          : 'Ошибка оплаты'
      haptic.error()
      toast.error(message)
    } finally {
      setLoading(false)
    }
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
        {profileLoading ? (
          <div className="h-10 w-40 rounded-xl animate-pulse" style={{ background: 'var(--bg3, rgba(255,255,255,0.05))' }} />
        ) : (
          <p className="text-3xl font-extrabold" style={{ color: '#6b9de8' }}>
            {Number(profile?.balance ?? 0).toLocaleString('ru')} ₽
          </p>
        )}
      </div>

      {/* Top-up form */}
      <div
        className="p-4 rounded-2xl space-y-4"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Пополнить баланс</p>

        {/* Preset amounts */}
        <div>
          <p className="text-xs mb-2 font-medium" style={{ color: 'var(--hint)' }}>Сумма (мин. 10 ₽)</p>
          <div className="flex gap-2 mb-2">
            {PRESET_AMOUNTS.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => { haptic.select(); setAmount(String(preset)) }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
                style={{
                  background: numericAmount === preset ? 'rgba(107,157,232,0.2)' : 'var(--bg3, rgba(255,255,255,0.06))',
                  border: `1px solid ${numericAmount === preset ? 'rgba(107,157,232,0.4)' : 'var(--border)'}`,
                  color: numericAmount === preset ? '#6b9de8' : 'var(--text)',
                }}
              >
                {preset}
              </button>
            ))}
          </div>
          <input
            type="number"
            inputMode="numeric"
            className="input w-full"
            placeholder="Другая сумма..."
            value={amount}
            min={10}
            onChange={e => setAmount(e.target.value)}
          />
        </div>

        {/* Payment method */}
        <div>
          <p className="text-xs mb-2 font-medium" style={{ color: 'var(--hint)' }}>Способ оплаты</p>
          <div className="flex gap-2">
            {(['card_yukassa', 'crypto'] as PaymentMethod[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { haptic.select(); setMethod(m) }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
                style={{
                  background: method === m ? 'rgba(107,157,232,0.2)' : 'var(--bg3, rgba(255,255,255,0.06))',
                  border: `1px solid ${method === m ? 'rgba(107,157,232,0.4)' : 'var(--border)'}`,
                  color: method === m ? '#6b9de8' : 'var(--text)',
                }}
              >
                {m === 'card_yukassa' ? 'Карта' : 'Крипто'}
              </button>
            ))}
          </div>
        </div>

        {/* Crypto currency selector */}
        {method === 'crypto' && (
          <div>
            <p className="text-xs mb-2 font-medium" style={{ color: 'var(--hint)' }}>Валюта</p>
            <div className="flex gap-2">
              {CRYPTO_CURRENCIES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { haptic.select(); setCurrency(c) }}
                  className="flex-1 py-2 rounded-xl text-xs font-bold transition-all active:scale-95"
                  style={{
                    background: currency === c ? 'rgba(107,157,232,0.2)' : 'var(--bg3, rgba(255,255,255,0.06))',
                    border: `1px solid ${currency === c ? 'rgba(107,157,232,0.4)' : 'var(--border)'}`,
                    color: currency === c ? '#6b9de8' : 'var(--text)',
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleTopup}
          disabled={!canSubmit}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]"
          style={{
            background: canSubmit ? 'rgba(45,88,173,0.85)' : 'var(--bg3, rgba(255,255,255,0.06))',
            color: canSubmit ? '#fff' : 'var(--hint)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Обработка...' : 'Пополнить'}
        </button>

        {/* Bot fallback */}
        <p className="text-center text-xs" style={{ color: 'var(--hint)' }}>
          или через{' '}
          <a
            href={`https://t.me/${BOT_USERNAME}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: '#6b9de8' }}
          >
            @{BOT_USERNAME}
          </a>
        </p>
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
