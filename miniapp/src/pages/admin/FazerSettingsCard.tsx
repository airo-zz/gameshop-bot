/**
 * src/pages/admin/FazerSettingsCard.tsx
 * Настройки FazerCards на странице «Интеграции»: тумблер, API-ключ (маска),
 * порог баланса, текущий баланс и подписка. Ключ отправляется только при вводе.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { fazerApi } from '@/api/admin'
import type { FazerOverview } from '@/api/admin'

const inputCls =
  'w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none focus:border-[var(--accent)]'

function Switch({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} onClick={onChange}
      className={['relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors', on ? 'bg-[var(--accent)]' : 'bg-[var(--bg3)]'].join(' ')}
    >
      <span className={['pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition', on ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
    </button>
  )
}

export default function FazerSettingsCard() {
  const [data, setData] = useState<FazerOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [low, setLow] = useState('10')

  const apply = (d: FazerOverview) => {
    setData(d)
    setEnabled(d.enabled)
    setLow(String(d.low_balance))
    setApiKey('')
  }

  const load = () => {
    setLoading(true)
    fazerApi.overview().then(apply).catch(() => toast.error('Не удалось загрузить FazerCards')).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    setSaving(true)
    try {
      const d = await fazerApi.updateConfig({
        enabled,
        low_balance: Math.max(0, Number(low.replace(',', '.')) || 0),
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      })
      apply(d)
      toast.success(d.error ? 'Сохранено, но есть проблема с FazerCards' : 'Сохранено')
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !data) return <p className="text-[var(--hint)] text-sm py-4 text-center">Загрузка FazerCards...</p>

  const p = data?.profile
  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">FazerCards</p>
          <p className="text-xs text-[var(--hint)] mt-0.5">Пополнения игр по ID, гифт-карты и Steam по логину — покупка у поставщика сразу после оплаты</p>
        </div>
        <Switch on={enabled} onChange={() => setEnabled((v) => !v)} />
      </div>

      {data?.api_key_set && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-[var(--bg3)] p-3">
            <p className="text-[var(--hint)]">Баланс</p>
            <p className="text-base font-bold text-[var(--text)] mt-0.5">
              {data.balance !== null ? `$${data.balance.toFixed(2)}` : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--bg3)] p-3">
            <p className="text-[var(--hint)]">Аккаунт</p>
            <p className="text-sm text-[var(--text)] mt-0.5 truncate">{p?.login ?? '—'}</p>
            {p && (
              <p className={p.subscriptionActive ? 'text-emerald-400/80' : 'text-amber-300'}>
                {p.plan ?? ''} · {p.subscriptionActive ? 'подписка активна' : 'подписка неактивна'}
              </p>
            )}
          </div>
        </div>
      )}

      {data?.error && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span className="flex-1">{data.error}</span>
          <button onClick={load} title="Проверить снова"><RefreshCw size={14} /></button>
        </div>
      )}

      <div>
        <label className="text-xs text-[var(--hint)] mb-1.5 block">
          API-ключ {data?.api_key_set && <span className="text-emerald-400/70">· задан ({data.api_key_masked})</span>}
        </label>
        <input
          type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
          placeholder={data?.api_key_set ? 'Оставьте пустым — не менять' : 'fc_… из кабинета fzr.cards → API'}
          className={inputCls + ' font-mono'}
        />
      </div>

      <div>
        <label className="text-xs text-[var(--hint)] mb-1.5 block">Предупредить, когда баланс ниже, $</label>
        <input value={low} onChange={(e) => setLow(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" className={inputCls} />
        <p className="text-xs text-[var(--hint)] mt-1.5">Уведомление придёт в группу операторов. Без баланса автовыдача встаёт.</p>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--btn-hover)] disabled:opacity-60 text-sm font-semibold text-[var(--text)] transition-all active:scale-[0.97]"
      >
        {saving ? 'Сохранение...' : 'Сохранить'}
      </button>
      <p className="text-xs text-[var(--hint)] leading-relaxed">
        Товары добавляются в каталоге: кнопка с молнией у категории → выбрать игру и номиналы.
      </p>
    </div>
  )
}
