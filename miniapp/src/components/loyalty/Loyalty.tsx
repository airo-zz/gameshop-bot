// src/components/loyalty/Loyalty.tsx
// Программа лояльности (модель Bybit): карточка уровня, таблица уровней, шторка
// «Как работает». Общие для профиля Mini App и сайта (стили — токены theme.css).
import { AnimatePresence, m } from 'framer-motion'
import { ChevronDown, Info } from '@/components/ui/icons'
import type { Profile } from '@/api'
import { fmtNum } from '@/utils/format'

/** Минимум полей уровня для таблицы — есть и в profile API, и в публичном /catalog/loyalty */
export interface LevelRow {
  name: string
  min_spent: number
  cashback_percent: number
  monthly_cashback_cap: number | null
  color_hex: string
}

// ── Лояльность (модель Bybit: уровень по тратам за месяц, только кэшбэк) ──────

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
  'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле',
  'августе', 'сентябре', 'октябре', 'ноябре', 'декабре']

export const rub = (n: number | string) => `${fmtNum(n)} ₽`

/** «3% с каждого его заказа в течение 12 месяцев» / «… без ограничения срока» */
export function referralTerms(percent: number | string, months: number): string {
  const p = `${Number(percent).toLocaleString('ru-RU')}%`
  if (!months) return `${p} с каждого его заказа без ограничения срока`
  const m10 = months % 10, m100 = months % 100
  const word = m10 === 1 && m100 !== 11 ? 'месяца' : 'месяцев'
  return `${p} с каждого его заказа в течение ${months} ${word}`
}
export const pct = (n: number | string) => `${fmtNum(n)}%`

export function LoyaltyCard({ profile, onToggleLevels, levelsOpen, onInfo }: {
  profile: Profile
  onToggleLevels: () => void
  levelsOpen: boolean
  onInfo: () => void
}) {
  const color = profile.loyalty_color_hex
  const spent = Number(profile.loyalty_month_spent)
  const nextMin = profile.loyalty_next_level_min_spent != null ? Number(profile.loyalty_next_level_min_spent) : null
  const cap = profile.loyalty_cashback_cap != null ? Number(profile.loyalty_cashback_cap) : null
  const got = Number(profile.loyalty_month_cashback)
  const progress = nextMin ? Math.min(100, (spent / nextMin) * 100) : 100

  // Сейчас идёт месяц N; уровень, достигнутый в N, держится до конца N+1
  const now = new Date()
  const monthNow = MONTHS_PREP[now.getMonth()]
  const holdUntil = profile.loyalty_period_ends_at ? new Date(profile.loyalty_period_ends_at) : null
  const lastDay = holdUntil ? new Date(holdUntil.getTime() - 1) : null

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 'var(--r-card)',
        background: 'var(--bg2)',
        padding: '18px 16px 16px 20px',
        overflow: 'hidden',
      }}
    >
      {/* Полоса цвета уровня — единственный цветной акцент страницы */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: color }} />

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <p className="font-display" style={{ margin: 0, fontSize: 22, lineHeight: 1.15, color }}>
          {profile.loyalty_level_name}
        </p>
        <p className="font-display num" style={{ margin: 0, fontSize: 22, lineHeight: 1.15, color: 'var(--text)' }}>
          {pct(profile.loyalty_cashback_percent)}
        </p>
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--hint)' }}>
        Кэшбэк на баланс с каждого выполненного заказа
      </p>

      {/* Кэшбэк за месяц и потолок */}
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ color: 'var(--hint)' }}>Получено в {monthNow}</span>
        <span className="num" style={{ color: 'var(--text)', fontWeight: 500 }}>
          {rub(got)}{cap != null && <span style={{ color: 'var(--hint)' }}> из {rub(cap)}</span>}
        </span>
      </div>

      {/* Прогресс месяца к следующему уровню */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
          <span style={{ color: 'var(--hint)' }}>Траты в {monthNow}</span>
          <span className="num" style={{ color: 'var(--text)', fontWeight: 500 }}>
            {rub(spent)}{nextMin != null && <span style={{ color: 'var(--hint)' }}> / {rub(nextMin)}</span>}
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--bg3)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--hint)', lineHeight: 1.4 }}>
          {profile.loyalty_next_level_name && nextMin != null
            ? <>До уровня «{profile.loyalty_next_level_name}» осталось <span className="num" style={{ color: 'var(--text)' }}>{rub(Math.max(0, nextMin - spent))}</span></>
            : 'Это максимальный уровень'}
          {profile.loyalty_held_from_prev_month && lastDay && (
            <> · уровень сохранён за прошлый месяц, действует по {lastDay.getDate()} {MONTHS_GEN[lastDay.getMonth()]}</>
          )}
        </p>
      </div>

      {/* Действия: все уровни + как это работает */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          type="button"
          onClick={onToggleLevels}
          aria-expanded={levelsOpen}
          className="active:opacity-80"
          style={{
            flex: 1, height: 44, padding: '0 14px', borderRadius: 'var(--r-control)',
            background: 'var(--bg3)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text)',
            fontSize: 14, fontWeight: 500,
          }}
        >
          <span style={{ display: 'flex', gap: 3 }} aria-hidden>
            {profile.loyalty_levels.slice(0, 5).map(lv => (
              <span key={lv.name} style={{ width: 6, height: 14, borderRadius: 2, background: lv.color_hex }} />
            ))}
          </span>
          <span style={{ flex: 1, textAlign: 'left' }}>{levelsOpen ? 'Скрыть уровни' : 'Все уровни'}</span>
          <span className="num" style={{ fontSize: 12, color: 'var(--hint)' }}>{profile.loyalty_levels.length}</span>
          <ChevronDown
            size={16}
            style={{
              color: 'var(--hint)',
              transform: levelsOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          />
        </button>
        <button
          type="button"
          onClick={onInfo}
          aria-label="Как работает программа лояльности"
          className="active:opacity-80"
          style={{
            width: 44, height: 44, borderRadius: 'var(--r-control)', background: 'var(--bg3)',
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-2)',
          }}
        >
          <Info size={20} />
        </button>
      </div>
    </div>
  )
}

// ── Шторка «Как работает программа» ──────────────────────────────────────────

export function LoyaltyInfoSheet({ open, onClose, levels }: { open: boolean; onClose: () => void; levels: LevelRow[] }) {
  const first = levels[0]
  const last = levels[levels.length - 1]
  const points: { title: string; text: string }[] = [
    {
      title: 'Уровень — по тратам за месяц',
      text: 'Считаем все оплаченные заказы с 1-го по последнее число месяца. Чем больше траты, тем выше уровень и процент кэшбэка.',
    },
    {
      title: 'Уровень держится ещё месяц',
      text: 'Дошли до уровня — он сохраняется и весь следующий месяц. Если в нём не набрать ту же сумму, с 1-го числа уровень опустится до достигнутого.',
    },
    {
      title: 'Кэшбэк — на баланс',
      text: `Начисляется, когда заказ выполнен: от ${first ? pct(first.cashback_percent) : '1%'} до ${last ? pct(last.cashback_percent) : '6%'}. Балансом можно оплачивать следующие заказы.`,
    },
    {
      title: 'Лимит кэшбэка в месяц',
      text: 'У каждого уровня свой потолок. Когда он набран, кэшбэк за этот месяц больше не начисляется — с нового месяца лимит обнуляется.',
    },
  ]
  return (
    <AnimatePresence>
      {open && (
        <>
          <m.div
            key="bg"
            onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200 }}
          />
          <m.div
            key="sheet"
            role="dialog"
            aria-label="Как работает программа лояльности"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 80) onClose() }}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 201,
              background: 'var(--bg2)', borderRadius: 'var(--r-sheet) var(--r-sheet) 0 0',
              padding: '10px 20px calc(env(safe-area-inset-bottom, 0px) + 24px)',
              maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(220,235,255,0.16)', margin: '0 auto 16px' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--text)' }}>
              Как работает кэшбэк
            </h2>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {points.map(pt => (
                <div key={pt.title}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{pt.title}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>{pt.text}</p>
                </div>
              ))}
            </div>
            <button type="button" onClick={onClose} className="btn-primary" style={{ marginTop: 22 }}>
              Понятно
            </button>
          </m.div>
        </>
      )}
    </AnimatePresence>
  )
}

export function LevelsTable({ levels, currentIndex = -1 }: { levels: LevelRow[]; currentIndex?: number }) {
  return (
    <div style={{ borderRadius: 'var(--r-card)', background: 'var(--bg2)', padding: '4px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', columnGap: 16, padding: '8px 16px', fontSize: 12, color: 'var(--hint)' }}>
        <span>Траты за месяц</span>
        <span style={{ textAlign: 'right' }}>Кэшбэк</span>
        <span style={{ textAlign: 'right', minWidth: 72 }}>Лимит/мес</span>
      </div>
      {levels.map((lv, i) => {
        const isCurrent = i === currentIndex
        return (
          <div
            key={lv.name}
            style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto', columnGap: 16, alignItems: 'center',
              padding: '9px 16px', fontSize: 14,
              background: isCurrent ? 'var(--bg3)' : 'transparent',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: lv.color_hex, flexShrink: 0 }} />
              <span style={{ color: isCurrent ? 'var(--text)' : 'var(--text)', fontWeight: isCurrent ? 600 : 400, whiteSpace: 'nowrap' }}>{lv.name}</span>
              <span className="tnum" style={{ color: 'var(--hint)', fontSize: 12, whiteSpace: 'nowrap' }}>от {rub(lv.min_spent)}</span>
            </span>
            <span className="tnum" style={{ textAlign: 'right', color: 'var(--text)' }}>{pct(lv.cashback_percent)}</span>
            <span className="tnum" style={{ textAlign: 'right', minWidth: 72, color: 'var(--hint)' }}>
              {lv.monthly_cashback_cap != null ? rub(lv.monthly_cashback_cap) : 'без лимита'}
            </span>
          </div>
        )
      })}
      <p style={{ margin: 0, padding: '10px 16px 8px', fontSize: 12, color: 'var(--hint)', lineHeight: 1.45 }}>
        Уровень считается по тратам за календарный месяц. Достигнутый уровень сохраняется
        и на весь следующий месяц, затем пересчитывается.
      </p>
    </div>
  )
}

