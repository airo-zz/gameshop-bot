/**
 * src/web/pages/WebBalancePage.tsx
 * Баланс на сайте: текущий остаток, пополнение через Platega (СБП / карта /
 * крипта) и история операций.
 *
 * Пополнение: POST /payments/balance/topup → redirect_url Platega. Переходим
 * в той же вкладке (window.open после await блокируется браузерами), Platega
 * возвращает на /balance?topup=success|failed. Зачисление делает webhook,
 * поэтому после возврата опрашиваем профиль, пока баланс не изменится.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Wallet, Smartphone, CreditCard, Bitcoin, TrendingUp, TrendingDown, CheckCircle2, XCircle, Loader2 } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { profileApi, paymentsApi, type BalanceTransaction } from '@/api'
import { PAY_SOURCE } from '@/config/appTarget'
import { money, apiError, txLabel, txIsCredit } from '@/web/format'
import { fmtNum } from '@/utils/format'

const PRESETS = [300, 500, 1000, 2000, 5000]
const MIN_AMOUNT = 100
const MAX_AMOUNT = 100_000

const METHODS = [
  { id: 'sbp', label: 'СБП', hint: 'По QR или в приложении банка', icon: Smartphone },
  { id: 'card', label: 'Банковская карта', hint: 'Visa · Mastercard · МИР', icon: CreditCard },
  { id: 'crypto', label: 'Криптовалюта', hint: 'USDT, TON, BTC и др.', icon: Bitcoin },
] as const
type Method = (typeof METHODS)[number]['id']

const PROFILE_KEY = ['web', 'profile'] as const
const HISTORY_KEY = ['web', 'balance-history'] as const

export default function WebBalancePage() {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const topupResult = params.get('topup') // success | failed | null

  const [amount, setAmount] = useState('1000')
  const [method, setMethod] = useState<Method>('sbp')
  const [loading, setLoading] = useState(false)
  // После возврата с оплаты ждём webhook: опрашиваем профиль до 2 минут
  const [waiting, setWaiting] = useState(topupResult === 'success')

  const { data: profile } = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: profileApi.get,
    refetchInterval: waiting ? 4000 : false,
  })
  const { data: history = [], isLoading: historyLoading } = useQuery<BalanceTransaction[]>({
    queryKey: HISTORY_KEY,
    queryFn: profileApi.getBalanceHistory,
    refetchInterval: waiting ? 4000 : false,
  })

  // Возврат с Platega: показать результат и убрать параметр из URL
  useEffect(() => {
    if (topupResult === 'failed') {
      toast.error('Оплата не прошла. Попробуйте ещё раз или выберите другой способ.')
      params.delete('topup')
      setParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ожидание зачисления: стоп, когда появилась свежая операция пополнения или вышел таймаут
  useEffect(() => {
    if (!waiting) return
    const fresh = history.find(
      (t) => t.type === 'top_up' && Date.now() - new Date(t.created_at).getTime() < 15 * 60_000,
    )
    if (fresh) {
      setWaiting(false)
      toast.success(`Баланс пополнен на ${money(fresh.amount)}`)
      params.delete('topup')
      setParams(params, { replace: true })
    }
  }, [waiting, history, params, setParams])

  useEffect(() => {
    if (!waiting) return
    const t = setTimeout(() => setWaiting(false), 120_000)
    return () => clearTimeout(t)
  }, [waiting])

  const numeric = Number(amount)
  const amountError = useMemo(() => {
    if (!amount) return 'Введите сумму'
    if (!Number.isFinite(numeric) || numeric < MIN_AMOUNT) return `Минимум ${money(MIN_AMOUNT)}`
    if (numeric > MAX_AMOUNT) return `Максимум ${money(MAX_AMOUNT)}`
    return null
  }, [amount, numeric])

  async function topup() {
    if (amountError || loading) return
    setLoading(true)
    try {
      const res = await paymentsApi.topupBalance(Math.round(numeric), method, PAY_SOURCE)
      if (res.redirect_url) {
        window.location.href = res.redirect_url
        return
      }
      toast.error('Не удалось создать платёж')
    } catch (e) {
      toast.error(apiError(e, 'Не удалось создать платёж, попробуйте позже'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="web-container py-8 md:py-12">
      <h1 className="text-2xl md:text-3xl font-semibold text-[var(--text)] mb-6">Баланс</h1>

      {waiting && (
        <div className="flex items-center gap-3 rounded-2xl p-4 mb-6" style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid transparent' }}>
          <Loader2 size={20} className="animate-spin shrink-0" style={{ color: 'var(--link)' }} />
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Ожидаем подтверждение оплаты</p>
            <p className="text-xs text-[var(--hint)]">Обычно это занимает до минуты. Страницу можно не обновлять.</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* ── Левая колонка: баланс + пополнение ───────────────────────────── */}
        <div className="space-y-6">
          <div className="rounded-3xl p-6 relative overflow-hidden" style={{ background: 'var(--gradient-primary)' }}>
            <div className="flex items-center gap-2 text-[var(--text-2)] text-sm font-medium">
              <Wallet size={18} /> Текущий баланс
            </div>
            <p className="text-4xl font-semibold text-[var(--text)] mt-3">
              {profile ? money(profile.balance) : '—'}
            </p>
            <p className="text-xs text-[var(--text-2)] mt-2">Оплачивайте заказы с баланса мгновенно и без комиссии.</p>
          </div>

          <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg2)] p-5 md:p-6 space-y-5">
            <h2 className="text-lg font-semibold text-[var(--text)]">Пополнить</h2>

            <div>
              <label className="block text-xs text-[var(--hint)] mb-2" htmlFor="topup-amount">Сумма, ₽</label>
              <input
                id="topup-amount"
                type="number"
                inputMode="numeric"
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
                className="w-full bg-[var(--bg3)] border border-[var(--border)] rounded-xl px-4 py-3 text-lg font-semibold text-[var(--text)] focus:outline-none focus:border-[var(--border)]"
              />
              <div className="flex flex-wrap gap-2 mt-3">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAmount(String(p))}
                    className="px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors"
                    style={{
                      background: numeric === p ? 'rgba(37,99,235,0.25)' : 'rgba(220,235,255,0.04)',
                      border: `1px solid ${numeric === p ? 'var(--accent)' : 'rgba(220,235,255,0.08)'}`,
                      color: numeric === p ? 'var(--link)' : 'rgba(220,235,255,0.8)',
                    }}
                  >
                    {fmtNum(p)} ₽
                  </button>
                ))}
              </div>
              {amountError && amount !== '' && <p className="text-xs mt-2" style={{ color: '#f87171' }}>{amountError}</p>}
            </div>

            <div>
              <p className="text-xs text-[var(--hint)] mb-2">Способ оплаты</p>
              <div className="space-y-2">
                {METHODS.map((m) => {
                  const selected = method === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id)}
                      className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all"
                      style={{
                        background: selected ? 'rgba(37,99,235,0.22)' : 'var(--bg2)',
                        border: selected ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                      }}
                    >
                      <m.icon size={20} style={{ color: selected ? 'var(--link)' : 'var(--hint)' }} />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-[var(--text)]">{m.label}</p>
                        <p className="text-xs text-[var(--hint)]">{m.hint}</p>
                      </div>
                      {selected && <CheckCircle2 size={18} style={{ color: 'var(--link)' }} />}
                    </button>
                  )
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={topup}
              disabled={!!amountError || loading}
              className="w-full py-3.5 rounded-xl text-sm font-semibold text-[var(--text)] transition-all active:scale-[0.97] hover:brightness-110 disabled:opacity-50"
              style={{ background: 'var(--gradient-primary)' }}
            >
              {loading ? 'Создаём платёж...' : `Пополнить на ${amountError ? '' : money(numeric)}`}
            </button>
            <p className="text-xs text-[var(--hint)] text-center leading-relaxed">
              Деньги зачисляются автоматически сразу после оплаты. Комиссия платёжной
              системы показывается на странице оплаты.
            </p>
          </div>
        </div>

        {/* ── Правая колонка: история ──────────────────────────────────────── */}
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg2)] p-5 md:p-6">
          <h2 className="text-lg font-semibold text-[var(--text)] mb-4">История операций</h2>
          {historyLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-2xl animate-pulse bg-[var(--bg2)]" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-3 text-center">
              <Wallet size={32} className="text-[var(--hint)]" />
              <p className="text-sm text-[var(--hint)]">Операций пока нет</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((tx) => {
                const credit = txIsCredit(tx.type)
                return (
                  <div key={tx.id} className="flex items-center gap-3 p-3.5 rounded-2xl bg-[var(--bg2)] border border-[var(--border)]">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: credit ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)' }}
                    >
                      {credit ? <TrendingUp size={16} style={{ color: '#34d399' }} /> : <TrendingDown size={16} style={{ color: '#f87171' }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text)] truncate">{txLabel(tx.type)}</p>
                      <p className="text-xs text-[var(--hint)] truncate">
                        {new Date(tx.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {tx.description ? ` · ${tx.description}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-bold shrink-0" style={{ color: credit ? '#34d399' : '#f87171' }}>
                      {credit ? '+' : '−'}{money(Math.abs(tx.amount))}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {topupResult === 'success' && !waiting && (
        <p className="text-xs text-[var(--hint)] mt-6 flex items-center gap-2">
          <XCircle size={14} /> Не видите зачисления? Напишите в поддержку — проверим платёж вручную.
        </p>
      )}
    </div>
  )
}
