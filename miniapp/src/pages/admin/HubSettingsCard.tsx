/**
 * src/pages/admin/HubSettingsCard.tsx
 * Хаб UchetFP на странице «Интеграции»: чаты сайта и бота видны ночнику в хабе,
 * его ответы приходят покупателю. Тумблер, адрес хаба, токен аккаунта reDonate
 * (маска; отправляется только при вводе), проверка связи.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { hubApi } from '@/api/admin'
import type { HubOverview } from '@/api/admin'

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

function ago(iso: string | null): string {
  if (!iso) return 'ещё не было'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 90) return 'только что'
  if (s < 3600) return `${Math.round(s / 60)} мин назад`
  if (s < 86400) return `${Math.round(s / 3600)} ч назад`
  return new Date(iso).toLocaleString('ru-RU')
}

export default function HubSettingsCard() {
  const [data, setData] = useState<HubOverview | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')

  const apply = (d: HubOverview) => {
    setData(d)
    setEnabled(d.enabled)
    setUrl(d.url)
    setToken('')
  }

  useEffect(() => {
    hubApi.overview().then(apply).catch(() => toast.error('Не удалось загрузить настройки хаба'))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      apply(await hubApi.updateConfig({ enabled, url: url.trim(), ...(token.trim() ? { token: token.trim() } : {}) }))
      toast.success('Сохранено')
    } catch {
      toast.error('Ошибка сохранения — проверьте адрес хаба')
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    try {
      const d = await hubApi.test()
      apply(d)
      if (d.test_error) toast.error(d.test_error)
      else toast.success('Хаб на связи')
    } catch {
      toast.error('Не удалось проверить связь')
    } finally {
      setTesting(false)
    }
  }

  if (!data) return <p className="text-[var(--hint)] text-sm py-4 text-center">Загрузка хаба...</p>

  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">Хаб UchetFP</p>
          <p className="text-xs text-[var(--hint)] mt-0.5">Чаты сайта и бота видны ночнику в хабе, его ответы приходят покупателю</p>
        </div>
        <Switch on={enabled} onChange={() => setEnabled((v) => !v)} />
      </div>

      {data.token_set && (
        <p className="text-xs text-[var(--hint)]">
          Последний обмен с хабом: <span className="text-[var(--text)]">{ago(data.ok_at)}</span>
        </p>
      )}

      {data.error && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span className="flex-1">{data.error}</span>
        </div>
      )}

      <div>
        <label className="text-xs text-[var(--hint)] mb-1.5 block">Адрес хаба</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://airo.uchet.tech" className={inputCls} />
      </div>

      <div>
        <label className="text-xs text-[var(--hint)] mb-1.5 block">
          Токен аккаунта reDonate {data.token_set && <span className="text-emerald-400/70">· задан ({data.token_masked})</span>}
        </label>
        <input
          type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)}
          placeholder={data.token_set ? 'Оставьте пустым — не менять' : 'Хаб → Настройки → Аккаунты → reDonate'}
          className={inputCls + ' font-mono'}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--btn-hover)] disabled:opacity-60 text-sm font-semibold text-[var(--text)] transition-all active:scale-[0.97]"
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
        <button
          onClick={test}
          disabled={testing || !data.token_set}
          className="px-4 py-3 rounded-xl bg-[var(--bg3)] border border-[var(--border)] disabled:opacity-50 text-sm font-medium text-[var(--text)] transition-all active:scale-[0.97]"
        >
          {testing ? 'Проверка...' : 'Проверить связь'}
        </button>
      </div>
      <p className="text-xs text-[var(--hint)] leading-relaxed">
        Аккаунт создаётся в хабе: Настройки → Аккаунты → reDonate. Ночнику откройте этот аккаунт в его правах.
        Первое сообщение чата уходит в хаб вместе с историей — ночник видит весь разговор.
      </p>
    </div>
  )
}
