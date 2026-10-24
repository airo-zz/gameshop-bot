/**
 * src/pages/admin/FazerImportModal.tsx
 * Выставление товаров из каталога FazerCards в категорию.
 * Флоу: тип (пополнение по ID / гифт-карты / Steam) → поиск игры → номиналы
 * галочками → наценка → «Создать». Товары сразу привязаны к Fazer и выдаются
 * автоматически; поля покупателя (ID игрока, сервер) категория получает от Fazer.
 */

import { useEffect, useMemo, useState } from 'react'
import { X, Search, Check, Zap, AlertTriangle, ChevronLeft, RefreshCw } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { adminApi, fazerApi } from '@/api/admin'
import type { AdminCategory, FazerGame, FazerGameDetails } from '@/api/admin'

const inputCls =
  'w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none focus:border-[var(--accent)]'

type Tab = 'topup' | 'giftcard' | 'steam'

const TABS: { id: Tab; label: string }[] = [
  { id: 'topup', label: 'Пополнение по ID' },
  { id: 'giftcard', label: 'Гифт-карты' },
  { id: 'steam', label: 'Steam по логину' },
]

function usd(v: number) {
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: v < 1 ? 4 : 2 })}`
}

function apiErr(e: unknown, fallback: string) {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === 'string' ? d : fallback
}

interface Props {
  category: AdminCategory
  onClose: () => void
  onDone: () => void
}

export default function FazerImportModal({ category, onClose, onDone }: Props) {
  const [tab, setTab] = useState<Tab>('topup')
  const [q, setQ] = useState('')
  const [games, setGames] = useState<FazerGame[]>([])
  const [found, setFound] = useState<{ total: number; found: number } | null>(null)
  const [searching, setSearching] = useState(false)
  const [game, setGame] = useState<FazerGameDetails | null>(null)
  const [loadingGame, setLoadingGame] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [margin, setMargin] = useState('30')
  const [applyFields, setApplyFields] = useState(true)
  const [validateId, setValidateId] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rate, setRate] = useState<number | null>(null)

  // Steam
  const [currency, setCurrency] = useState('USD')
  const [steamName, setSteamName] = useState('')
  const [minAmount, setMinAmount] = useState('1')
  const [steamRates, setSteamRates] = useState<Record<string, number> | null>(null)

  const marginNum = Number(margin.replace(',', '.')) || 0
  const sellPrice = (cost: number) => Math.max(0.01, cost * (1 + marginNum / 100))
  const hasCatFields = (category.input_fields?.length ?? 0) > 0

  useEffect(() => {
    adminApi.getPricing().then((p) => setRate(p.usd_rub_rate)).catch(() => undefined)
  }, [])

  // Поиск игры (с задержкой ввода)
  useEffect(() => {
    if (tab === 'steam') {
      fazerApi.steamRates().then((r) => setSteamRates(r.rates)).catch((e) => setError(apiErr(e, 'FazerCards недоступен')))
      return
    }
    setGame(null)
    setSelected(new Set())
    const t = setTimeout(() => {
      setSearching(true)
      setError('')
      fazerApi.games(tab, q.trim())
        .then((r) => { setGames(r.items); setFound({ total: r.total, found: r.found }) })
        .catch((e) => { setGames([]); setError(apiErr(e, 'FazerCards недоступен')) })
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [tab, q])

  const openGame = async (g: FazerGame, fresh = false) => {
    if (tab === 'steam') return
    setLoadingGame(true)
    try {
      const d = await fazerApi.game(tab, g.category_id, fresh)
      setGame(d)
      setSelected(new Set(d.offers.map((o) => o.id)))
      setValidateId(d.validate)
    } catch (e) {
      toast.error(apiErr(e, 'Не удалось загрузить номиналы'))
    } finally {
      setLoadingGame(false)
    }
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allSelected = game ? game.offers.length > 0 && selected.size === game.offers.length : false

  const submit = async () => {
    setSaving(true)
    try {
      if (tab === 'steam') {
        await fazerApi.importSteam({
          category_id: category.id, currency, margin_percent: marginNum,
          name: steamName.trim() || undefined, min_amount: Math.max(1, Math.floor(Number(minAmount) || 1)),
        })
        toast.success('Товар «Пополнение Steam» создан')
      } else if (game) {
        const res = await fazerApi.importOffers({
          category_id: category.id, kind: tab, fazer_category_id: game.category_id,
          offer_ids: game.offers.filter((o) => selected.has(o.id)).map((o) => o.id),
          margin_percent: marginNum, apply_fields: applyFields, validate_id: validateId,
        })
        toast.success(`Создано товаров: ${res.created}${res.fields_set ? ' · поля покупателя обновлены' : ''}`)
      }
      onDone()
      onClose()
    } catch (e) {
      toast.error(apiErr(e, 'Не удалось создать товары'))
    } finally {
      setSaving(false)
    }
  }

  const steamUnitCost = useMemo(() => {
    const r = steamRates?.[currency]
    return r ? 1 / r : null
  }, [steamRates, currency])

  return (
    <div className="fixed inset-0 flex justify-center overflow-y-auto bg-black/60 backdrop-blur-sm" style={{ zIndex: 200 }} onClick={onClose}>
      <div className="w-full max-w-2xl my-6 mx-4 h-fit rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--text)] flex items-center gap-2">
              <Zap size={16} className="text-[var(--link)]" /> Товары из FazerCards
            </h3>
            <p className="text-xs text-[var(--hint)] truncate">В категорию «{category.name}» · выдача автоматическая</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg3)] transition-all shrink-0">
            <X size={18} className="text-[var(--hint)]" />
          </button>
        </div>

        <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg2)] border border-[var(--border)]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setQ(''); setError('') }}
              className={`flex-1 px-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                tab === t.id ? 'bg-[var(--bg3)] text-[var(--text)]' : 'text-[var(--hint)] hover:text-[var(--text-2)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {tab === 'steam' ? (
          <div className="space-y-3">
            <p className="text-xs text-[var(--hint)] leading-relaxed">
              Один товар: покупатель вводит логин Steam и сумму, деньги зачисляются на кошелёк напрямую (без кода).
              Цена товара — за 1 единицу валюты. В категорию добавится поле «Логин Steam».
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--hint)] mb-1.5 block">Валюта пополнения</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
                  {['USD', 'RUB', 'UAH', 'KZT'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--hint)] mb-1.5 block">Минимальная сумма</label>
                <input value={minAmount} onChange={(e) => setMinAmount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} />
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--hint)] mb-1.5 block">Название товара</label>
              <input value={steamName} onChange={(e) => setSteamName(e.target.value)} placeholder={`Пополнение Steam (${currency})`} className={inputCls} />
            </div>
            {steamUnitCost !== null && (
              <p className="text-xs text-[var(--text-2)]">
                Себестоимость ≈ {usd(steamUnitCost)} за 1 {currency} → цена {usd(sellPrice(steamUnitCost))}
                {rate ? ` (≈ ${(sellPrice(steamUnitCost) * rate).toFixed(2)} ₽)` : ''} за 1 {currency}
              </p>
            )}
          </div>
        ) : !game ? (
          <div className="space-y-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--hint)]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск игры: pubg, genshin, valorant…" className={inputCls + ' pl-9'} autoFocus />
            </div>
            {found && <p className="text-xs text-[var(--hint)]">Найдено {found.found} из {found.total}</p>}
            <div className="max-h-[50vh] overflow-y-auto space-y-1">
              {searching || loadingGame ? (
                <p className="text-sm text-[var(--hint)] py-6 text-center">Загрузка...</p>
              ) : games.length === 0 ? (
                <p className="text-sm text-[var(--hint)] py-6 text-center">Ничего не найдено</p>
              ) : games.map((g) => (
                <button
                  key={g.category_id}
                  onClick={() => openGame(g)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-[var(--bg2)] border border-[var(--border)] hover:bg-[var(--bg3)] text-left transition-all"
                >
                  <span className="text-sm text-[var(--text)] truncate">{g.name}</span>
                  <span className="text-[11px] text-[var(--hint)] shrink-0">
                    {g.validate ? 'проверка ID · ' : ''}{g.category_id}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setGame(null)} className="p-1.5 rounded-lg bg-[var(--bg2)] border border-[var(--border)] hover:bg-[var(--bg3)]">
                <ChevronLeft size={15} className="text-[var(--text-2)]" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text)] truncate">{game.name}</p>
                {game.note && <p className="text-xs text-[var(--hint)] truncate">{game.note}</p>}
              </div>
              <button
                onClick={() => openGame({ category_id: game.category_id, name: game.name, validate: game.validate }, true)}
                className="p-1.5 rounded-lg bg-[var(--bg2)] border border-[var(--border)] hover:bg-[var(--bg3)]"
                title="Обновить цены"
              >
                <RefreshCw size={14} className="text-[var(--text-2)]" />
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-[var(--hint)]">
              <button onClick={() => setSelected(allSelected ? new Set() : new Set(game.offers.map((o) => o.id)))} className="hover:text-[var(--text-2)]">
                {allSelected ? 'Снять все' : 'Выбрать все'}
              </button>
              <span>Себестоимость → ваша цена</span>
            </div>
            <div className="max-h-[40vh] overflow-y-auto space-y-1">
              {game.offers.map((o) => {
                const on = selected.has(o.id)
                const out = o.stock === 0
                return (
                  <button
                    key={o.id}
                    onClick={() => toggle(o.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-all ${
                      on ? 'bg-[var(--bg3)] border-[var(--accent)]' : 'bg-[var(--bg2)] border-[var(--border)]'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)]'}`}>
                      {on && <Check size={11} className="text-white" />}
                    </span>
                    <span className="text-sm text-[var(--text)] flex-1 min-w-0 truncate">
                      {o.name}{out && <span className="text-amber-400"> · нет в наличии</span>}
                    </span>
                    <span className="text-xs text-[var(--hint)] shrink-0 tabular-nums">
                      {usd(o.price_usd)} → <span className="text-[var(--text)] font-semibold">{usd(sellPrice(o.price_usd))}</span>
                      {rate ? <span> ≈ {Math.round(sellPrice(o.price_usd) * rate)} ₽</span> : null}
                    </span>
                  </button>
                )
              })}
            </div>

            {tab === 'topup' && game.fields.length > 0 && (
              <label className="flex items-start gap-2 text-xs text-[var(--text-2)] cursor-pointer">
                <input type="checkbox" checked={applyFields} onChange={(e) => setApplyFields(e.target.checked)} className="mt-0.5" />
                <span>
                  Спрашивать у покупателя: {game.fields.map((f) => f.label || f.key).join(', ')}
                  {hasCatFields && <span className="text-amber-300"> — заменит текущие поля категории</span>}
                </span>
              </label>
            )}
            {tab === 'topup' && game.validate && (
              <label className="flex items-center gap-2 text-xs text-[var(--text-2)] cursor-pointer">
                <input type="checkbox" checked={validateId} onChange={(e) => setValidateId(e.target.checked)} />
                Проверять ID игрока до покупки (неверный ID — без списания)
              </label>
            )}
          </div>
        )}

        {(tab === 'steam' || game) && (
          <div className="flex items-end gap-3 pt-1">
            <div className="w-36">
              <label className="text-xs text-[var(--hint)] mb-1.5 block">Наценка, %</label>
              <input value={margin} onChange={(e) => setMargin(e.target.value.replace(/[^\d.,-]/g, ''))} inputMode="decimal" className={inputCls} />
            </div>
            <button
              onClick={submit}
              disabled={saving || (tab !== 'steam' && selected.size === 0)}
              className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-sm font-semibold text-white transition-all active:scale-[0.98]"
            >
              {saving ? 'Создаём…' : tab === 'steam' ? 'Создать товар' : `Создать товаров: ${selected.size}`}
            </button>
          </div>
        )}
        <p className="text-[11px] text-[var(--hint)] leading-relaxed">
          Цена в $ — до наценки платёжного метода, как у остальных товаров; ₽ — примерно по текущему курсу.
          Цены потом можно менять как обычно.
        </p>
      </div>
    </div>
  )
}
