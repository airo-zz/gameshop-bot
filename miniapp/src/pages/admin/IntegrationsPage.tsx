/**
 * src/pages/admin/IntegrationsPage.tsx
 * Настройки интеграции Fragment (автопополнение Telegram Stars/Premium).
 * Секреты (cookie Fragment, seed TON) отправляются только при вводе; в ответе —
 * маска. Пустое поле секрета = не менять.
 */

import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/api/admin'
import type { IntegrationsSettings } from '@/api/admin'

const inputCls =
  'w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/50'

export default function IntegrationsPage() {
  const [data, setData] = useState<IntegrationsSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [enabled, setEnabled] = useState(false)
  const [ssid, setSsid] = useState('')
  const [token, setToken] = useState('')
  const [tonToken, setTonToken] = useState('')
  const [seed, setSeed] = useState('')
  const [payment, setPayment] = useState('ton')
  const [starsMin, setStarsMin] = useState('50')
  const [starsMax, setStarsMax] = useState('1000000')
  const [showSender, setShowSender] = useState(false)

  const load = () => {
    setLoading(true)
    adminApi.getIntegrations()
      .then((d) => {
        setData(d)
        setEnabled(d.enabled)
        setPayment(d.payment_method)
        setStarsMin(String(d.stars_min))
        setStarsMax(String(d.stars_max))
        setShowSender(d.show_sender)
        setSsid(''); setToken(''); setTonToken(''); setSeed('')
      })
      .catch(() => toast.error('Не удалось загрузить'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    setSaving(true)
    try {
      const d = await adminApi.updateIntegrations({
        enabled,
        payment_method: payment,
        stars_min: Number(starsMin) || 1,
        stars_max: Number(starsMax) || 1,
        show_sender: showSender,
        ...(ssid.trim() ? { stel_ssid: ssid.trim() } : {}),
        ...(token.trim() ? { stel_token: token.trim() } : {}),
        ...(tonToken.trim() ? { stel_ton_token: tonToken.trim() } : {}),
        ...(seed.trim() ? { ton_seed: seed.trim() } : {}),
      })
      setData(d)
      setSsid(''); setToken(''); setTonToken(''); setSeed('')
      toast.success('Сохранено')
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-white/40 text-sm py-8 text-center">Загрузка...</p>

  return (
    <div className="space-y-4 pb-8 max-w-lg">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(45,88,173,0.15)', color: 'var(--link)' }}>
          <Zap size={20} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Интеграции</h1>
          <p className="text-xs text-white/40">Fragment — автопополнение Telegram Stars / Premium</p>
        </div>
      </div>

      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-4">
        {/* Вкл/выкл */}
        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-sm text-white">Автопополнение включено</p>
            <p className="text-xs text-white/40 mt-0.5">Выдача Stars/Premium через Fragment</p>
          </div>
          <button
            type="button" role="switch" aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className={['relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors', enabled ? 'bg-blue-600' : 'bg-white/15'].join(' ')}
          >
            <span className={['pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition', enabled ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
          </button>
        </div>

        {/* Fragment cookie — три отдельных значения из fragment.com */}
        <div className="space-y-3">
          <p className="text-xs text-white/40">
            Три куки из fragment.com (F12 → Application → Cookies). Можно вставлять как
            само значение, так и «имя=значение» — лишнее уберётся. stel_ton_token
            обязателен (без него Fragment не проведёт оплату).
          </p>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">
              stel_ssid {data?.ssid_set && <span className="text-emerald-400/70">· задано ({data.ssid_masked})</span>}
            </label>
            <input
              value={ssid} onChange={(e) => setSsid(e.target.value)} autoComplete="off"
              placeholder={data?.ssid_set ? 'Оставьте пустым — не менять' : 'Значение stel_ssid'}
              className={inputCls + ' font-mono text-xs'}
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">
              stel_token {data?.token_set && <span className="text-emerald-400/70">· задано ({data.token_masked})</span>}
            </label>
            <input
              value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off"
              placeholder={data?.token_set ? 'Оставьте пустым — не менять' : 'Значение stel_token'}
              className={inputCls + ' font-mono text-xs'}
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">
              stel_ton_token {data?.ton_token_set && <span className="text-emerald-400/70">· задано ({data.ton_token_masked})</span>}
            </label>
            <input
              value={tonToken} onChange={(e) => setTonToken(e.target.value)} autoComplete="off"
              placeholder={data?.ton_token_set ? 'Оставьте пустым — не менять' : 'Значение stel_ton_token'}
              className={inputCls + ' font-mono text-xs'}
            />
          </div>
        </div>

        {/* TON seed */}
        <div>
          <label className="text-xs text-white/50 mb-1.5 block">
            Seed TON-кошелька {data?.seed_set && <span className="text-emerald-400/70">· задано ({data.seed_masked})</span>}
          </label>
          <input
            type="password"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder={data?.seed_set ? 'Оставьте пустым — не менять' : '24 слова seed-фразы'}
            className={inputCls + ' font-mono'}
            autoComplete="off"
          />
          <p className="text-xs text-amber-300/60 mt-1.5">С этого кошелька оплачиваются покупки. Храните seed в безопасности.</p>
        </div>

        {/* Способ оплаты Fragment */}
        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Оплата на Fragment</label>
          <select value={payment} onChange={(e) => setPayment(e.target.value)} className={inputCls + ' appearance-none'}>
            <option value="ton" className="bg-[#060f1e]">TON</option>
            <option value="usdt_ton" className="bg-[#060f1e]">USDT (TON)</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Мин. звёзд</label>
            <input type="number" min={1} value={starsMin} onChange={(e) => setStarsMin(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Макс. звёзд</label>
            <input type="number" min={1} value={starsMax} onChange={(e) => setStarsMax(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-white/80">Показывать отправителя</p>
          <button
            type="button" role="switch" aria-checked={showSender}
            onClick={() => setShowSender((v) => !v)}
            className={['relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors', showSender ? 'bg-blue-600' : 'bg-white/15'].join(' ')}
          >
            <span className={['pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition', showSender ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
          </button>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm font-semibold text-white transition-all active:scale-[0.98]"
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>

      <p className="text-xs text-white/30">
        Движок выдачи (Fragment + TON-кошелёк) подключается отдельно. Пока это только хранение кредов.
      </p>
    </div>
  )
}
