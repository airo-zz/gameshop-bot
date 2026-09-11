/**
 * src/pages/admin/PricingSettingsPage.tsx
 * Настройки ценообразования: курс USD/RUB (RAPIRA, авто) + наценка платёжки (%).
 */

import { useEffect, useState } from 'react'
import { DollarSign, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/api/admin'
import type { PricingSettings } from '@/api/admin'

export default function PricingSettingsPage() {
  const [pricing, setPricing] = useState<PricingSettings | null>(null)
  const [markupCrypto, setMarkupCrypto] = useState('')
  const [markupCard, setMarkupCard] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    adminApi.getPricing()
      .then((p) => { setPricing(p); setMarkupCrypto(String(p.markup_crypto)); setMarkupCard(String(p.markup_card)) })
      .catch(() => toast.error('Не удалось загрузить'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    const c = Number(markupCrypto)
    const k = Number(markupCard)
    if ([c, k].some((v) => isNaN(v) || v < 0 || v > 100)) { toast.error('Наценка 0–100%'); return }
    setSaving(true)
    try {
      const p = await adminApi.updatePricing({ markup_crypto: c, markup_card: k })
      setPricing(p)
      setMarkupCrypto(String(p.markup_crypto))
      setMarkupCard(String(p.markup_card))
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
          <DollarSign size={20} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Ценообразование</h1>
          <p className="text-xs text-white/40">Цены задаются в USD, покупателю — ₽ по курсу RAPIRA</p>
        </div>
      </div>

      {/* Курс */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white/50 uppercase tracking-wider mb-1">Курс USD/RUB (RAPIRA)</p>
            <p className="text-2xl font-bold text-white">{pricing?.usd_rub_rate.toFixed(2)} ₽</p>
            {pricing?.usd_rub_rate_updated_at && (
              <p className="text-xs text-white/30 mt-1">
                обновлён {new Date(pricing.usd_rub_rate_updated_at).toLocaleString('ru-RU')}
              </p>
            )}
          </div>
          <button
            onClick={load}
            className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/50 transition-colors"
            title="Обновить"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <p className="text-xs text-white/30 mt-2">Курс обновляется автоматически 2 раза в сутки.</p>
      </div>

      {/* Наценки по методам */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-3">
        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Наценка: крипта и баланс, %</label>
          <input
            type="number"
            value={markupCrypto}
            onChange={(e) => setMarkupCrypto(e.target.value)}
            min={0} max={100} step="0.1"
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
          />
          <p className="text-xs text-white/40 mt-1.5">Базовая цена в каталоге считается по этой наценке.</p>
        </div>
        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Наценка: карта / SberPay / СБП, %</label>
          <input
            type="number"
            value={markupCard}
            onChange={(e) => setMarkupCard(e.target.value)}
            min={0} max={100} step="0.1"
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
          />
          <p className="text-xs text-white/40 mt-1.5">
            Итог: ₽ = USD × курс × (1 + наценка метода), округление «в 9». Покупатель видит цену метода при оформлении.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm font-semibold text-white transition-all active:scale-[0.98]"
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}
