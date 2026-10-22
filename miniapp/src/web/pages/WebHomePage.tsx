/**
 * src/web/pages/WebHomePage.tsx
 * Главная redonate.gg: первый экран с обложками игр, популярное, каталог,
 * кэшбэк, как это работает, способы оплаты, вопросы.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ChevronDown, ChevronRight, Smartphone, CreditCard, Bitcoin, Wallet, Zap, ShieldCheck, Headphones,
} from '@/components/ui/icons'
import { catalogApi, type Game } from '@/api'
import { normalizeImageUrl } from '@/utils/imageUrl'
import { onThumbError, thumbSrcSet, thumbUrl } from '@/utils/thumb'
import GameCard from '@/web/components/GameCard'
import GameSearch from '@/web/components/GameSearch'
import RequestCta from '@/web/components/RequestCta'
import { EASE, Reveal, Stagger, StaggerItem } from '@/web/components/Motion'
import { usePageMeta } from '@/web/seo'
import { prefetchGame } from '@/web/prefetch'

const cover = (g: Game) => (g.image_url ? normalizeImageUrl(g.image_url) ?? g.image_url : null)

// ── Первый экран ──────────────────────────────────────────────────────────────

function Hero({ games }: { games: Game[] }) {
  const qc = useQueryClient()
  const reduce = useReducedMotion()
  const covers = games.filter(cover).slice(0, 6)

  const item = (i: number) => ({
    initial: reduce ? false : { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: EASE, delay: 0.06 * i },
  })

  return (
    <section className="web-container pt-12 md:pt-20 pb-12 md:pb-16">
      <div className="grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 items-center">
        <div>
          <motion.h1 {...item(0)} className="text-[2.25rem] leading-[1.08] md:text-[3.25rem] text-[var(--text)]" style={{ margin: 0 }}>
            Донат в игры<br />за пару минут
          </motion.h1>
          <motion.p {...item(1)} className="mt-5 text-base md:text-lg text-[var(--text-2)] max-w-md leading-relaxed">
            Внутриигровая валюта, наборы и подписки для мобильных и компьютерных игр.
            Оплата через СБП, банковской картой или криптовалютой, кэшбэк с каждой покупки.
          </motion.p>

          <motion.div {...item(2)} className="mt-8 max-w-md">
            <GameSearch size="lg" placeholder="Какую игру пополнить?" />
          </motion.div>

          <motion.ul {...item(3)} className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--hint)]">
            <li className="flex items-center gap-1.5"><Zap size={16} className="text-[var(--link)]" />Автовыдача</li>
            <li className="flex items-center gap-1.5"><ShieldCheck size={16} className="text-[var(--link)]" />Безопасная оплата</li>
            <li className="flex items-center gap-1.5"><Headphones size={16} className="text-[var(--link)]" />Поддержка операторов</li>
          </motion.ul>
        </div>

        {/* Стена обложек — реальные игры из каталога; пока грузятся — заглушки того же размера */}
        {games.length === 0 && (
          <div className="grid grid-cols-3 gap-3 md:gap-4 pb-7" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={'aspect-[3/4] rounded-2xl bg-[var(--bg2)] ' + (i >= 3 ? 'hidden lg:block' : '')}
                style={{ transform: i % 3 === 1 ? 'translateY(28px)' : undefined }}
              />
            ))}
          </div>
        )}
        {covers.length >= 3 && (
          <div className="grid grid-cols-3 gap-3 md:gap-4 pb-7">
            {covers.map((g, i) => (
              <motion.div
                key={g.id}
                className={i >= 3 ? 'hidden lg:block' : ''}
                initial={reduce ? false : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: i % 3 === 1 ? 28 : 0 }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.15 + 0.07 * i }}
              >
                <Link
                  to={`/game/${g.slug}`}
                  onMouseEnter={() => prefetchGame(qc, g.slug)}
                  className="group block aspect-[3/4] rounded-2xl overflow-hidden bg-[var(--bg2)]"
                  style={{ boxShadow: 'inset 0 0 0 1px var(--border)' }}
                >
                  <img
                    src={thumbUrl(cover(g), 320) ?? cover(g)!}
                    srcSet={thumbSrcSet(cover(g))}
                    sizes="(min-width: 1024px) 200px, 30vw"
                    onError={onThumbError(cover(g)!)}
                    alt={g.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ── Популярное ────────────────────────────────────────────────────────────────

function Popular() {
  const qc = useQueryClient()
  const { data: trending = [] } = useQuery({
    queryKey: ['web', 'trending-categories'],
    queryFn: catalogApi.getTrendingCategories,
    staleTime: 5 * 60_000,
  })
  if (!trending.length) return null
  return (
    <section className="web-container py-10 md:py-12">
      <Reveal>
        <h2 className="text-2xl md:text-[1.75rem] font-semibold tracking-tight text-[var(--text)]">Популярное</h2>
      </Reveal>
      <Stagger className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {trending.slice(0, 8).map((c) => {
          const img = normalizeImageUrl(c.game_image_url)
          return (
            <StaggerItem key={c.id}>
              <Link
                to={`/game/${c.game_slug}?cat=${c.id}`}
                onMouseEnter={() => prefetchGame(qc, c.game_slug)}
                className="group flex items-center gap-3 p-3 rounded-2xl bg-[var(--bg2)] hover:bg-[var(--bg3)] transition-colors"
              >
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-[var(--bg3)] shrink-0">
                  {img && <img src={thumbUrl(img, 320) ?? img} onError={onThumbError(img)} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text)] truncate">{c.name}</p>
                  <p className="text-xs text-[var(--hint)] truncate mt-0.5">{c.game_name}</p>
                </div>
              </Link>
            </StaggerItem>
          )
        })}
      </Stagger>
    </section>
  )
}

// ── Каталог ───────────────────────────────────────────────────────────────────

function Catalog({ all, isLoading, isError }: { all: Game[]; isLoading: boolean; isError: boolean }) {
  const [tab, setTab] = useState<'game' | 'service'>('game')
  const hasServices = all.some((g) => g.type === 'service')
  const games = all.filter((g) => (tab === 'service' ? g.type === 'service' : g.type !== 'service'))

  return (
    <section id="catalog" className="web-container py-10 md:py-12 scroll-mt-20">
      <Reveal className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <h2 className="text-2xl md:text-[1.75rem] font-semibold tracking-tight text-[var(--text)]">Каталог</h2>
        {hasServices && (
          <div className="inline-flex rounded-xl bg-[var(--bg2)] p-1">
            {(['game', 'service'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={'relative px-4 h-9 rounded-lg text-sm font-medium transition-colors ' + (tab === t ? 'text-[var(--text)]' : 'text-[var(--hint)] hover:text-[var(--text-2)]')}
              >
                {tab === t && (
                  <motion.span layoutId="web-cat-tab" className="absolute inset-0 rounded-lg bg-[var(--bg3)]" transition={{ duration: 0.25, ease: EASE }} />
                )}
                <span className="relative">{t === 'game' ? 'Игры' : 'Сервисы'}</span>
              </button>
            ))}
          </div>
        )}
      </Reveal>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-square rounded-2xl animate-pulse bg-[var(--bg2)]" />
              <div className="h-3.5 w-2/3 rounded mt-3 animate-pulse bg-[var(--bg2)]" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-[var(--hint)] py-10 text-center">Не удалось загрузить каталог — обновите страницу</p>
      ) : games.length === 0 ? (
        <p className="text-sm text-[var(--hint)] py-10 text-center">Скоро здесь появятся игры</p>
      ) : (
        <Stagger key={tab} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          {games.map((g) => (
            <StaggerItem key={g.id}><GameCard game={g} /></StaggerItem>
          ))}
        </Stagger>
      )}
      <Reveal className="mt-6"><RequestCta /></Reveal>
    </section>
  )
}

// ── Кэшбэк ────────────────────────────────────────────────────────────────────

function Cashback() {
  const { data } = useQuery({ queryKey: ['web', 'loyalty'], queryFn: catalogApi.getLoyaltyProgram, staleTime: 10 * 60_000 })
  const levels = data?.levels ?? []
  if (!levels.length) return null
  const max = levels[levels.length - 1]
  return (
    <section className="web-container py-10 md:py-12">
      <Reveal>
        <div className="rounded-3xl bg-[var(--bg2)] p-6 md:p-10 grid md:grid-cols-[1fr_1.1fr] gap-8 items-center">
          <div>
            <h2 className="text-2xl md:text-[1.75rem] font-semibold tracking-tight text-[var(--text)]">
              Возвращаем до {max.cashback_percent}% кэшбэком
            </h2>
            <p className="mt-3 text-[var(--text-2)] leading-relaxed max-w-md">
              {levels.length} уровней по тратам за месяц. Кэшбэк приходит на баланс после каждого выполненного
              заказа, а достигнутый уровень держится и весь следующий месяц.
            </p>
            <Link to="/cashback" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--link)] hover:text-[var(--text)] transition-colors">
              Все уровни и условия <ChevronRight size={16} />
            </Link>
          </div>
          {/* Лестница уровней: высота столбика = процент кэшбэка */}
          <div className="flex items-end gap-1.5 md:gap-2 h-48" aria-label="Уровни кэшбэка">
            {levels.map((lv, i) => (
              <div key={lv.name} className="flex-1 min-w-0 flex flex-col items-center justify-end gap-2 h-full" title={`${lv.name}: от ${lv.min_spent.toLocaleString('ru')} ₽ в месяц`}>
                <span className="text-[11px] num text-[var(--text-2)]">{lv.cashback_percent}%</span>
                <motion.div
                  className="w-full rounded-md"
                  style={{ background: lv.color_hex, transformOrigin: 'bottom', height: `${(lv.cashback_percent / max.cashback_percent) * 128}px` }}
                  initial={{ scaleY: 0 }}
                  whileInView={{ scaleY: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, ease: EASE, delay: 0.05 * i }}
                />
                <span className="text-[10px] text-[var(--hint)] truncate max-w-full hidden sm:block">{lv.name}</span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  )
}

// ── Как это работает ──────────────────────────────────────────────────────────

const STEPS = [
  { title: 'Выберите игру и пакет', text: 'Найдите игру в каталоге и добавьте нужный набор в корзину.' },
  { title: 'Оплатите удобным способом', text: 'СБП, банковская карта, криптовалюта или баланс аккаунта.' },
  { title: 'Получите товар', text: 'Автовыдача приходит сразу, остальное оператор выдаёт в чате.' },
]

function HowItWorks() {
  return (
    <section id="how" className="web-container py-10 md:py-12 scroll-mt-20">
      <Reveal>
        <h2 className="text-2xl md:text-[1.75rem] font-semibold tracking-tight text-[var(--text)]">Как это работает</h2>
      </Reveal>
      <Stagger className="mt-6 grid md:grid-cols-3 gap-4">
        {STEPS.map((s, i) => (
          <StaggerItem key={s.title} className="h-full">
            <div className="h-full rounded-2xl bg-[var(--bg2)] p-6">
              <span className="inline-flex w-8 h-8 rounded-lg items-center justify-center text-sm font-semibold num bg-[var(--bg3)] text-[var(--text)]">
                {i + 1}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-[var(--text)]">{s.title}</h3>
              <p className="mt-1.5 text-sm text-[var(--text-2)] leading-relaxed">{s.text}</p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      {/* Способы оплаты */}
      <Reveal className="mt-4">
        <div className="rounded-2xl bg-[var(--bg2)] px-6 py-5 flex flex-wrap items-center gap-x-8 gap-y-3">
          <span className="text-sm text-[var(--hint)]">Принимаем</span>
          {[
            { Icon: Smartphone, label: 'СБП' },
            { Icon: CreditCard, label: 'Visa, Mastercard, МИР' },
            { Icon: Bitcoin, label: 'USDT, TON, BTC' },
            { Icon: Wallet, label: 'Баланс аккаунта' },
          ].map(({ Icon, label }) => (
            <span key={label} className="flex items-center gap-2 text-sm text-[var(--text)]">
              <Icon size={20} className="text-[var(--hint)]" /> {label}
            </span>
          ))}
        </div>
      </Reveal>
    </section>
  )
}

// ── Вопросы ───────────────────────────────────────────────────────────────────

const FAQ = [
  { q: 'Как быстро приходит товар?', a: 'Товары с автовыдачей приходят сразу после оплаты. Остальные заказы оператор обрабатывает в чате, обычно за несколько минут.' },
  { q: 'Какие способы оплаты доступны?', a: 'СБП, банковские карты (Visa, Mastercard, МИР), криптовалюта (USDT, TON, BTC и др.) и баланс аккаунта.' },
  { q: 'Нужна ли регистрация?', a: 'Аккаунт создаётся при первом входе: по почте с кодом подтверждения или через Telegram. Если войти через Telegram, заказы, баланс и кэшбэк будут общими с Telegram-ботом.' },
  { q: 'Как работает кэшбэк?', a: 'Уровень зависит от трат за календарный месяц. С каждого выполненного заказа на баланс возвращается процент вашего уровня, в пределах месячного лимита.' },
  { q: 'Что делать, если возникла проблема?', a: 'Напишите в чат с оператором прямо на сайте — поможем с заказом или оплатой.' },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl bg-[var(--bg2)] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[var(--bg3)] transition-colors"
      >
        <span className="text-base font-medium text-[var(--text)]">{q}</span>
        <ChevronDown
          size={20}
          className="text-[var(--hint)] shrink-0"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)' }}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-5 text-sm text-[var(--text-2)] leading-relaxed max-w-2xl">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function FaqSection() {
  return (
    <section id="faq" className="web-container py-10 md:py-12 scroll-mt-20">
      <div className="grid lg:grid-cols-[1fr_2fr] gap-8">
        <Reveal>
          <h2 className="text-2xl md:text-[1.75rem] font-semibold tracking-tight text-[var(--text)]">Частые вопросы</h2>
          <p className="mt-3 text-sm text-[var(--hint)] max-w-xs">Не нашли ответ — напишите в чат с оператором.</p>
        </Reveal>
        <Stagger className="space-y-2">
          {FAQ.map((item) => (
            <StaggerItem key={item.q}><FaqItem q={item.q} a={item.a} /></StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  )
}

// ── Страница ──────────────────────────────────────────────────────────────────

export default function WebHomePage() {
  usePageMeta({})
  const { data: all = [], isLoading, isError } = useQuery({
    queryKey: ['web', 'games', 'all'],
    queryFn: () => catalogApi.getGames(),
    staleTime: 5 * 60_000,
  })
  return (
    <>
      <Hero games={all.filter((g) => g.type !== 'service')} />
      <Popular />
      <Catalog all={all} isLoading={isLoading} isError={isError} />
      <Cashback />
      <HowItWorks />
      <FaqSection />
    </>
  )
}
