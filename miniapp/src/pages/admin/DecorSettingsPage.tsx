/**
 * src/pages/admin/DecorSettingsPage.tsx
 * Украшения Discord: таблица цен (вставляется из лота GGSel, формат как в UchetFP),
 * базовая цена, состояние синхронизации общего каталога и ручное обновление.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertTriangle, RefreshCw } from '@/components/ui/icons'
import { decorAdminApi } from '@/api/admin'
import type { DecorSettings } from '@/api/admin'

const inputCls =
  'w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none focus:border-[var(--accent)]'

const TIERS_HINT = `НАБОР с ценой · 390₽ – 450₽ (8,99$ – 10,99$)(+489 ₽)
УКРАШЕНИЕ с ценой · 219₽ – 260₽ (4,99$ – 5,99$)(+289 ₽)`

function apiErr(e: unknown, fallback: string) {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === 'string' ? d : fallback
}

export default function DecorSettingsPage() {
  const [data, setData] = useState<DecorSettings | null>(null)
  const [tiers, setTiers] = useState('')
  const [base, setBase] = useState('0')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const apply = (d: DecorSettings) => {
    setData(d)
    setTiers(d.price_tiers)
    setBase(String(d.base_rub))
  }

  useEffect(() => {
    decorAdminApi.get().then(apply).catch(() => toast.error('Не удалось загрузить настройки'))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const d = await decorAdminApi.save({ price_tiers: tiers, base_rub: Math.max(0, Math.floor(Number(base) || 0)) })
      apply(d)
      toast.success('Цены пересчитаны')
    } catch (e) {
      toast.error(apiErr(e, 'Не удалось сохранить'))
    } finally {
      setSaving(false)
    }
  }

  const sync = async () => {
    setSyncing(true)
    try {
      apply(await decorAdminApi.sync())
      toast.success('Каталог обновлён')
    } catch (e) {
      toast.error(apiErr(e, 'Не удалось обновить каталог'))
    } finally {
      setSyncing(false)
    }
  }

  if (!data) return <p className="text-[var(--hint)] text-sm py-8 text-center">Загрузка...</p>
  const st = data.status
  const unpricedTotal = (st.unpriced ?? []).reduce((s, u) => s + u.count, 0)

  return (
    <div className="space-y-4 pb-8 max-w-2xl">
      <div>
        <h1 className="text-lg font-bold text-[var(--text)]">Украшения Discord</h1>
        <p className="text-xs text-[var(--hint)] mt-0.5">
          Каталог общий с UchetFP и {data.site_url.replace(/^https?:\/\//, '')}: новые коллекции появляются здесь сами
          в течение часа после того, как попадут в каталог UchetFP.
        </p>
      </div>

      <div className="bg-[var(--bg2)] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[var(--text)]">Каталог</p>
          <button
            onClick={sync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg3)] text-xs font-semibold text-[var(--text)] disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Обновляем…' : 'Обновить сейчас'}
          </button>
        </div>
        {!data.catalog_dir_ok && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-200">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            Файлы каталога не найдены на сервере — проверьте копию UchetFP (/opt/decor-catalog).
          </div>
        )}
        {st.error && <p className="text-xs text-red-400">{st.error}</p>}
        {st.at && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[
              ['Кодов', st.codes], ['Коллекций', st.collections],
              ['Скрыто', st.hidden], ['Без картинки', st.no_image],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-[var(--bg3)] p-2.5">
                <p className="text-[var(--hint)]">{label}</p>
                <p className="text-base font-semibold text-[var(--text)] num">{value ?? '—'}</p>
              </div>
            ))}
          </div>
        )}
        {st.at && (
          <p className="text-xs text-[var(--hint)]">
            Последняя синхронизация: {new Date(st.at).toLocaleString('ru-RU')}
            {st.site_ok === false && ' — сайт с картинками не ответил, картинки прежние'}
          </p>
        )}
        {st.game_id && (
          <p className="text-xs text-[var(--text-2)]">
            Раздел в каталоге: «Украшения Discord»{st.game_active ? ' — показан покупателям' : ' — пока скрыт.'}
            {!st.game_active && <> Включите его в <Link to="/admin/catalog/games" className="text-[var(--link)]">списке игр</Link>, когда цены готовы.</>}
          </p>
        )}
      </div>

      <div className="bg-[var(--bg2)] rounded-2xl p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">Таблица цен</p>
          <p className="text-xs text-[var(--hint)] mt-1 leading-relaxed">
            Вставьте варианты цены из лота GGSel — как в UchetFP. Цена украшения = базовая цена + «(+N ₽)» строки,
            у которой первая цена в $ совпадает с ценой в Discord (с Nitro). Наборы и украшения — отдельными строками.
          </p>
        </div>
        <textarea
          value={tiers}
          onChange={(e) => setTiers(e.target.value)}
          rows={10}
          placeholder={TIERS_HINT}
          spellCheck={false}
          className={inputCls + ' font-mono text-xs leading-relaxed resize-y'}
        />
        <div className="flex items-end gap-3">
          <div className="w-40">
            <label className="text-xs text-[var(--hint)] mb-1.5 block">Базовая цена, ₽</label>
            <input value={base} onChange={(e) => setBase(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} />
          </div>
          <p className="text-xs text-[var(--hint)] pb-2.5 flex-1">Строк распознано: {data.tiers_parsed}</p>
        </div>
        {unpricedTotal > 0 && (
          <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1">
            <p className="font-semibold">Без цены и скрыто: {unpricedTotal}. Добавьте строки для:</p>
            {(st.unpriced ?? []).map((u) => (
              <p key={`${u.kind}-${u.price_usd}`}>{u.kind === 'набор' ? 'Набор' : 'Украшение'} {u.price_usd}$ — {u.count} шт.</p>
            ))}
          </div>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--btn-hover)] disabled:opacity-60 text-sm font-semibold text-white"
        >
          {saving ? 'Пересчитываем…' : 'Сохранить и пересчитать цены'}
        </button>
      </div>
    </div>
  )
}
