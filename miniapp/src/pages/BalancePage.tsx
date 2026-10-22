// src/pages/BalancePage.tsx
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Wallet, TrendingUp, TrendingDown } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { profileApi, paymentsApi, type BalanceTransaction } from '@/api'
import { useTelegram } from '@/hooks/useTelegram'
import { PAY_SOURCE } from '@/config/appTarget'


const PRESET_AMOUNTS = [200, 500, 1000, 5000, 10000]
type PaymentMethod = 'sbp' | 'card' | 'crypto'
const ENABLED_METHODS: PaymentMethod[] = ['sbp', 'card', 'crypto']
const METHOD_LABELS: Record<PaymentMethod, string> = {
  sbp: 'СБП',
  card: 'Карта',
  crypto: 'Крипта',
}

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
  const { tg, haptic } = useTelegram()

  const [amount, setAmount] = useState<string>('')
  const [method, setMethod] = useState<PaymentMethod>(ENABLED_METHODS[0])
  const [loading, setLoading] = useState(false)
  // После перехода к оплате ждём webhook: 3 минуты опрашиваем баланс и историю
  // (оплата открывается во внешнем браузере, пользователь возвращается сам).
  const [awaitingUntil, setAwaitingUntil] = useState(0)
  const awaiting = awaitingUntil > Date.now()
  const balanceBefore = useRef<number | null>(null)

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.get,
    staleTime: 5 * 60 * 1000,
    refetchInterval: awaiting ? 4000 : false,
    refetchOnWindowFocus: true,
  })

  const { data: history = [] } = useQuery<BalanceTransaction[]>({
    queryKey: ['balance-history'],
    queryFn: profileApi.getBalanceHistory,
    staleTime: 60_000,
    refetchInterval: awaiting ? 4000 : false,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    if (!awaiting || !profile || balanceBefore.current === null) return
    if (Number(profile.balance) > balanceBefore.current) {
      haptic.success()
      toast.success(`Баланс пополнен: ${Number(profile.balance).toLocaleString('ru')} ₽`)
      setAwaitingUntil(0)
    }
  }, [awaiting, profile, haptic])

  useEffect(() => {
    if (!awaitingUntil) return
    const t = setTimeout(() => setAwaitingUntil(0), Math.max(0, awaitingUntil - Date.now()))
    return () => clearTimeout(t)
  }, [awaitingUntil])

  const numericAmount = Number(amount)
  const canSubmit = numericAmount >= 100 && !loading

  async function handleTopup() {
    if (!canSubmit) return
    haptic.impact('medium')
    setLoading(true)
    try {
      const res = await paymentsApi.topupBalance(numericAmount, method, PAY_SOURCE)
      if (res.redirect_url) {
        balanceBefore.current = Number(profile?.balance ?? 0)
        setAwaitingUntil(Date.now() + 3 * 60_000)
        toast.success('Оплатите на открывшейся странице — баланс обновится сам')
        if (tg?.openLink) tg.openLink(res.redirect_url)
        else window.open(res.redirect_url, '_blank')
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
    <div className="px-4 pt-5 pb-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Назад"
          className="flex items-center justify-center w-10 h-10 rounded-xl active:opacity-70 flex-shrink-0"
          style={{ background: 'var(--bg2)' }}
        >
          <ArrowLeft size={20} style={{ color: 'var(--text)' }} />
        </button>
        <h1 className="text-xl" style={{ color: 'var(--text)' }}>Баланс</h1>
      </div>

      {/* Balance card */}
      <div
        className="p-5 rounded-2xl"
        style={{ background: 'var(--bg2)' }}
      >
        <p className="text-sm flex items-center gap-1.5" style={{ color: 'var(--hint)' }}>
          <Wallet size={16} /> Текущий баланс
        </p>
        <p className="font-display num" style={{ color: 'var(--text)', fontSize: 30, lineHeight: 1.2, marginTop: 8 }}>
          {Number(profile?.balance ?? 0).toLocaleString('ru', { maximumFractionDigits: 2 })} ₽
        </p>
      </div>

      {/* Top-up form */}
      <div
        className="p-4 rounded-2xl space-y-4"
        style={{ background: 'var(--bg2)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Пополнить баланс</p>

        {/* Preset amounts */}
        <div>
          <p className="text-xs mb-2 font-medium" style={{ color: 'var(--hint)' }}>Сумма (мин. 100 ₽)</p>
          <div className="flex gap-2 mb-2">
            {PRESET_AMOUNTS.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => { haptic.select(); setAmount(String(preset)) }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all active:scale-[0.97]"
                style={{
                  background: numericAmount === preset ? 'rgba(127,166,245,0.2)' : 'var(--bg3, rgba(220,235,255,0.06))',
                  border: `1px solid ${numericAmount === preset ? 'rgba(127,166,245,0.4)' : 'var(--border)'}`,
                  color: numericAmount === preset ? '#7FA6F5' : 'var(--text)',
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
            placeholder="от 100 ₽"
            value={amount}
            min={100}
            onChange={e => setAmount(e.target.value)}
          />
        </div>

        {/* Payment method — селектор только если методов больше одного */}
        {ENABLED_METHODS.length > 1 && (
        <div>
          <p className="text-xs mb-2 font-medium" style={{ color: 'var(--hint)' }}>Способ оплаты</p>
          <div className="flex gap-2">
            {ENABLED_METHODS.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { haptic.select(); setMethod(m) }}
                className="flex-1 min-w-0 px-1 py-2.5 rounded-xl text-sm font-medium truncate active:opacity-80"
                style={{
                  background: method === m ? 'var(--accent-soft)' : 'var(--bg3)',
                  border: `1px solid ${method === m ? 'var(--accent)' : 'transparent'}`,
                  color: 'var(--text)',
                }}
              >
                {METHOD_LABELS[m]}
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
            background: canSubmit ? 'var(--accent)' : 'var(--bg3, rgba(220,235,255,0.06))',
            color: canSubmit ? '#fff' : 'var(--hint)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Обработка...' : 'Пополнить'}
        </button>

        <p className="text-center text-xs" style={{ color: 'var(--hint)' }}>
          Зачисление автоматическое сразу после оплаты. Комиссия платёжной системы видна на странице оплаты.
        </p>
      </div>

      {/* History */}
      <div>
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>История операций</p>

        {history.length === 0 ? (
          <div
            className="flex flex-col items-center py-10 rounded-2xl gap-3"
            style={{ background: 'var(--bg2)' }}
          >
            <Wallet size={32} style={{ color: 'var(--hint)', opacity: 0.4 }} />
            <p className="text-sm" style={{ color: 'var(--hint)' }}>Операций пока нет</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg2)' }}>
            {history.map((tx, i) => {
              const isCredit = txIsCredit(tx.type)
              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--bg3)' }}
                  >
                    {isCredit
                      ? <TrendingUp size={18} style={{ color: '#34d399' }} />
                      : <TrendingDown size={18} style={{ color: 'var(--hint)' }} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
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
                    className="text-sm font-semibold num flex-shrink-0"
                    style={{ color: isCredit ? '#34d399' : 'var(--text)' }}
                  >
                    {isCredit ? '+' : '−'}{Math.abs(tx.amount).toLocaleString('ru')} ₽
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
