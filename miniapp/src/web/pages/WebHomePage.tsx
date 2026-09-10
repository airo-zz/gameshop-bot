/**
 * src/web/pages/WebHomePage.tsx
 * Публичная главная redonate.su — лендинг + витрина игр.
 * Данные игр — реальные (catalogApi.getGames). Покупка пока ведёт в Telegram;
 * веб-чекаут появится в следующей фазе.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Zap, ShieldCheck, Headphones, BadgePercent, Send, ChevronDown } from 'lucide-react'
import { catalogApi } from '@/api'
import { MINIAPP_URL, SHOP_NAME } from '@/config/appTarget'
import GameCard from '@/web/components/GameCard'

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Фоновое свечение */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(60% 60% at 50% 0%, rgba(45,88,173,0.35) 0%, rgba(0,180,216,0.10) 40%, transparent 70%)',
        }}
      />
      <div className="web-container relative pt-20 pb-16 md:pt-28 md:pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs text-white/60 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Моментальная доставка · оплата картой и криптой
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold text-white leading-[1.05] tracking-tight">
          Игровой донат
          <br />
          <span
            style={{ background: 'var(--gradient-gaming)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
          >
            быстро и безопасно
          </span>
        </h1>

        <p className="mt-6 text-base md:text-lg text-white/50 max-w-2xl mx-auto leading-relaxed">
          Пополняй любимые игры за пару минут. Честные цены, проверенные способы оплаты
          и живая поддержка на каждом шаге.
        </p>

        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href={MINIAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white transition-all active:scale-[0.97] hover:brightness-110 w-full sm:w-auto justify-center"
            style={{ background: 'var(--gradient-primary)' }}
          >
            <Send size={17} />
            Открыть в Telegram
          </a>
          <a
            href="#catalog"
            className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white/80 border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-all active:scale-[0.97] w-full sm:w-auto justify-center"
          >
            Смотреть каталог
          </a>
        </div>
      </div>
    </section>
  )
}

// ── Преимущества ────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: Zap, title: 'Моментально', text: 'Автовыдача ключей и кодов сразу после оплаты — без ожидания.' },
  { icon: ShieldCheck, title: 'Безопасно', text: 'Проверенные платёжные системы и защита каждой транзакции.' },
  { icon: BadgePercent, title: 'Выгодно', text: 'Честные цены, скидки по уровням лояльности и промокоды.' },
  { icon: Headphones, title: 'Поддержка 24/7', text: 'Живые операторы помогут с любым вопросом в любое время.' },
]

function Features() {
  return (
    <section className="web-container py-12 md:py-16">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] transition-colors"
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(45,88,173,0.15)', color: 'var(--link)' }}
            >
              <f.icon size={20} />
            </div>
            <h3 className="text-base font-semibold text-white mb-1.5">{f.title}</h3>
            <p className="text-sm text-white/45 leading-relaxed">{f.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Витрина игр ─────────────────────────────────────────────────────────────

function Catalog() {
  const { data: games, isLoading, isError } = useQuery({
    queryKey: ['web', 'games', 'game'],
    queryFn: () => catalogApi.getGames('game'),
    staleTime: 5 * 60_000,
  })

  return (
    <section id="catalog" className="web-container py-12 md:py-16 scroll-mt-20">
      <div className="flex items-end justify-between mb-7">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">Каталог игр</h2>
          <p className="text-sm text-white/45 mt-1.5">Выберите игру — оформление в Telegram за пару минут.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <div className="aspect-[4/3] animate-pulse bg-white/[0.04]" />
              <div className="p-3.5 space-y-2">
                <div className="h-3.5 w-2/3 rounded animate-pulse bg-white/[0.06]" />
                <div className="h-2.5 w-1/3 rounded animate-pulse bg-white/[0.04]" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-white/40 py-10 text-center">Не удалось загрузить каталог</p>
      ) : !games || games.length === 0 ? (
        <p className="text-sm text-white/40 py-10 text-center">Скоро здесь появятся игры</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {games.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      )}
    </section>
  )
}

// ── Как это работает ──────────────────────────────────────────────────────────

const STEPS = [
  { n: '01', title: 'Выберите игру', text: 'Найдите нужную игру и товар в каталоге.' },
  { n: '02', title: 'Оплатите удобно', text: 'Картой или криптовалютой — как удобнее.' },
  { n: '03', title: 'Получите сразу', text: 'Автовыдача или помощь оператора без задержек.' },
]

function HowItWorks() {
  return (
    <section id="how" className="web-container py-12 md:py-16 scroll-mt-20">
      <h2 className="text-2xl md:text-3xl font-bold text-white text-center">Как это работает</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-9">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
            <div className="text-3xl font-extrabold" style={{ color: 'var(--link)', opacity: 0.9 }}>{s.n}</div>
            <h3 className="text-lg font-semibold text-white mt-3">{s.title}</h3>
            <p className="text-sm text-white/45 mt-1.5 leading-relaxed">{s.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── FAQ ─────────────────────────────────────────────────────────────────────

const FAQ = [
  { q: 'Как быстро приходит товар?', a: 'Товары с автовыдачей приходят моментально после оплаты. В остальных случаях оператор обрабатывает заказ в кратчайшие сроки.' },
  { q: 'Какие способы оплаты доступны?', a: 'Оплата банковской картой и криптовалютой (USDT, TON, BTC, ETH).' },
  { q: 'Это безопасно?', a: 'Да. Мы используем проверенные платёжные системы, а все транзакции защищены.' },
  { q: 'Что делать, если возникла проблема?', a: 'Напишите в поддержку — операторы на связи 24/7 и помогут решить любой вопрос.' },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-sm md:text-base font-medium text-white">{q}</span>
        <ChevronDown
          size={18}
          className={'text-white/40 shrink-0 transition-transform duration-200 ' + (open ? 'rotate-180' : '')}
        />
      </button>
      {open && <p className="px-5 pb-4 text-sm text-white/50 leading-relaxed">{a}</p>}
    </div>
  )
}

function FaqSection() {
  return (
    <section id="faq" className="web-container py-12 md:py-16 scroll-mt-20">
      <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-9">Частые вопросы</h2>
      <div className="max-w-2xl mx-auto space-y-3">
        {FAQ.map((item) => (
          <FaqItem key={item.q} q={item.q} a={item.a} />
        ))}
      </div>
    </section>
  )
}

// ── CTA ───────────────────────────────────────────────────────────────────────

function CtaBanner() {
  return (
    <section className="web-container py-12 md:py-16">
      <div
        className="relative overflow-hidden rounded-3xl border border-white/10 p-8 md:p-12 text-center"
        style={{ background: 'var(--gradient-primary)' }}
      >
        <h2 className="text-2xl md:text-3xl font-bold text-white">Готовы пополнить игру?</h2>
        <p className="text-white/80 mt-2.5 max-w-xl mx-auto">
          Откройте {SHOP_NAME} в Telegram и оформите заказ за пару минут.
        </p>
        <a
          href={MINIAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-[#0a1428] mt-7 transition-all active:scale-[0.97] hover:bg-white/90"
        >
          <Send size={17} />
          Открыть в Telegram
        </a>
      </div>
    </section>
  )
}

// ── Страница ──────────────────────────────────────────────────────────────────

export default function WebHomePage() {
  return (
    <>
      <Hero />
      <Features />
      <Catalog />
      <HowItWorks />
      <FaqSection />
      <CtaBanner />
    </>
  )
}
