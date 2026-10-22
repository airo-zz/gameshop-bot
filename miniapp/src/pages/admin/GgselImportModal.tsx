/**
 * src/pages/admin/GgselImportModal.tsx
 * Импорт CSV-выгрузки оффера ggsel в выбранную игру.
 * Флоу: выбор файла → предпросмотр плана (сервер) → базовая цена → создание.
 *
 * Цена лота = базовая цена оффера (с ggsel) + модификатор варианта из CSV.
 */

import { useMemo, useRef, useState } from 'react'
import { X, UploadCloud, AlertTriangle, FolderOpen, Package, Check } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { adminApi } from '@/api/admin'
import type { ImportPreview } from '@/api/admin'

interface GgselImportModalProps {
  gameId: string
  gameName: string
  onClose: () => void
  onDone: () => void
}

function formatMoney(v: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(v)
}

function formatModifier(v: number) {
  if (v === 0) return '±0'
  const sign = v > 0 ? '+' : '−'
  return `${sign}${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.abs(v))} ₽`
}

export default function GgselImportModal({ gameId, gameName, onClose, onDone }: GgselImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [basePrice, setBasePrice] = useState('0')

  const base = Math.max(0, Number(basePrice) || 0)
  const finalPrice = (modifier: number) => Math.max(0, base + modifier)

  const totalProducts = preview?.stats.products ?? 0

  const handleFile = async (file: File) => {
    setFileName(file.name)
    setPreview(null)
    setPreviewing(true)
    try {
      const result = await adminApi.importGgselPreview(file)
      setPreview(result)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Не удалось разобрать файл')
      setFileName('')
    } finally {
      setPreviewing(false)
    }
  }

  const handleCommit = async () => {
    if (!preview) return
    setCommitting(true)
    try {
      const res = await adminApi.importGgselCommit({
        game_id: gameId,
        base_price: base,
        categories: preview.categories,
        input_fields: preview.input_fields,
      })
      toast.success(`Создано: ${res.categories_created} категорий, ${res.products_created} товаров`)
      onDone()
      onClose()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Ошибка импорта')
    } finally {
      setCommitting(false)
    }
  }

  const priceRange = useMemo(() => {
    if (!preview) return null
    const finals = preview.categories.flatMap((c) => c.products.map((p) => finalPrice(p.price_modifier)))
    if (!finals.length) return null
    return { min: Math.min(...finals), max: Math.max(...finals) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, base])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-[var(--bg2)] border border-[var(--border)] rounded-t-2xl max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--text)]">Импорт CSV из ggsel</h3>
            <p className="text-xs text-[var(--hint)] truncate">в игру «{gameName}»</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg3)] active:scale-[0.97] transition-all shrink-0">
            <X size={18} className="text-[var(--hint)]" />
          </button>
        </div>

        <div className="px-5 pb-5 overflow-y-auto space-y-4">
          {/* Выбор файла */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={previewing || committing}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-[var(--bg2)] border border-dashed border-[var(--border)] hover:bg-[var(--bg3)] hover:border-[var(--border)] disabled:opacity-40 transition-all active:scale-[0.97]"
          >
            <UploadCloud size={18} className="text-[var(--hint)] shrink-0" />
            <span className="text-sm text-[var(--text-2)] truncate">
              {fileName || 'Выбрать файл parameters_offer_*.csv'}
            </span>
          </button>

          {previewing && <p className="text-sm text-[var(--hint)] py-4 text-center">Разбираем файл...</p>}

          {preview && !previewing && (
            <>
              {/* Базовая цена */}
              <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-3.5">
                <label className="text-sm font-medium text-[var(--text)] block mb-1">Базовая цена оффера, ₽</label>
                <p className="text-xs text-[var(--hint)] mb-2.5">
                  Цена, указанная в товаре на ggsel. Цена лота = базовая + модификатор из файла.
                </p>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  placeholder="0"
                  className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:outline-none focus:border-[var(--accent)]"
                />
                {priceRange && (
                  <p className="text-xs text-[var(--hint)] mt-2">
                    Диапазон цен лотов: <span className="text-[var(--text)] font-medium">{formatMoney(priceRange.min)} – {formatMoney(priceRange.max)}</span>
                  </p>
                )}
              </div>

              {/* Сводка */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Категорий', value: preview.stats.categories },
                  { label: 'Товаров', value: preview.stats.products },
                  { label: 'Полей', value: preview.stats.input_fields },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] px-3 py-2.5 text-center">
                    <div className="text-lg font-bold text-[var(--text)]">{s.value}</div>
                    <div className="text-[11px] text-[var(--hint)]">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Поля от покупателя */}
              {preview.input_fields.length > 0 && (
                <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-3">
                  <p className="text-xs font-semibold text-[var(--hint)] uppercase tracking-wider mb-2">Данные от покупателя</p>
                  <div className="space-y-1">
                    {preview.input_fields.map((f) => (
                      <div key={f.key} className="text-sm text-[var(--text-2)] flex items-center gap-2">
                        <span className="truncate">{f.label}</span>
                        {f.required && <span className="text-[10px] text-amber-400 shrink-0">обяз.</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Категории и товары */}
              <div className="space-y-2">
                {preview.categories.map((cat, i) => (
                  <div key={i} className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
                      <FolderOpen size={14} className="text-[var(--hint)] shrink-0" />
                      <span className="text-sm font-medium text-[var(--text)] truncate flex-1">{cat.name}</span>
                      <span className="text-xs text-[var(--hint)] shrink-0">{cat.products.length}</span>
                    </div>
                    <div className="divide-y divide-white/[0.04]">
                      {cat.products.map((p, j) => (
                        <div key={j} className="flex items-center gap-2 px-3 py-1.5">
                          <Package size={12} className="text-[var(--hint)] shrink-0" />
                          <span className="text-xs text-[var(--text-2)] truncate flex-1">{p.name}</span>
                          <span className="text-[11px] text-[var(--hint)] shrink-0 tabular-nums">{formatModifier(p.price_modifier)}</span>
                          <span className="text-xs font-semibold text-[var(--text)] shrink-0 w-16 text-right tabular-nums">
                            {formatMoney(finalPrice(p.price_modifier))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Предупреждения парсера (неизвестные типы параметров) */}
              {preview.warnings.length > 0 && (
                <div className="rounded-xl bg-amber-500/[0.06] border border-amber-500/20 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                    <p className="text-xs font-semibold text-amber-300">Пропущено при разборе</p>
                  </div>
                  <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                    {preview.warnings.map((w, i) => (
                      <li key={i} className="text-[11px] text-amber-200/50 truncate">· {w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {preview && !previewing && (
          <div className="p-5 pt-3 border-t border-[var(--border)]">
            <button
              onClick={handleCommit}
              disabled={committing}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-sm font-semibold text-[var(--text)] transition-all active:scale-[0.97]"
            >
              {committing ? (
                <span className="w-4 h-4 border-2 border-[var(--border)] border-t-white rounded-full animate-spin" />
              ) : (
                <Check size={16} />
              )}
              Импортировать {totalProducts} товаров
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
