/**
 * src/web/pages/WebFaqPage.tsx
 * «Вопросы и ответы»: разделы (заказ, оплата, возврат, аккаунт, бонусы) с
 * раскрывающимися ответами и блок связи с поддержкой — как у магазинов доната.
 * Тексты — api/services/faq_content.py (тот же источник для поисковиков).
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, m } from 'framer-motion'
import { ChevronDown, MessageCircle, Send } from '@/components/ui/icons'
import { catalogApi } from '@/api'
import { openChat } from '@/web/chat/chatStore'
import { usePageMeta } from '@/web/seo'

const SUPPORT_TG = 'https://t.me/reDonateSupport_bot'

function Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl bg-[var(--bg2)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[var(--bg3)] transition-colors"
      >
        <span className="text-[15px] font-medium text-[var(--text)]">{q}</span>
        <ChevronDown
          size={20}
          className="text-[var(--hint)] shrink-0"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)' }}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-5 text-sm text-[var(--text-2)] leading-relaxed max-w-2xl">{a}</p>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function WebFaqPage() {
  usePageMeta({
    title: 'Вопросы и ответы',
    description: 'Как оформить и оплатить заказ, сколько ждать выполнения, как вернуть деньги, как работают аккаунт, кэшбэк и бонусы reDonate.',
  })
  const { data: sections = [] } = useQuery({ queryKey: ['web', 'faq'], queryFn: catalogApi.getFaq, staleTime: 30 * 60_000 })

  const goTo = (slug: string) => document.getElementById(`faq-${slug}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="web-container py-10 md:py-14">
      <h1 className="text-3xl md:text-[2.5rem] leading-tight text-[var(--text)]" style={{ margin: 0 }}>Вопросы и ответы</h1>
      <p className="mt-3 text-[var(--text-2)] leading-relaxed max-w-xl">
        Коротко о заказах, оплате и возврате. Если ответа нет — напишите в чат, оператор поможет.
      </p>

      <div className="mt-8 grid lg:grid-cols-[220px_1fr] gap-8 lg:gap-12 items-start">
        {/* Разделы: на компьютере — колонка слева, на телефоне — строка сверху */}
        <nav className="lg:sticky lg:top-24 flex lg:flex-col gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0" aria-label="Разделы">
          {sections.map((s) => (
            <button
              key={s.slug}
              type="button"
              onClick={() => goTo(s.slug)}
              className="h-10 px-4 lg:px-3 rounded-xl text-sm text-left whitespace-nowrap bg-[var(--bg2)] lg:bg-transparent text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--bg2)] transition-colors"
            >
              {s.title}
            </button>
          ))}
        </nav>

        <div className="space-y-10 min-w-0">
          {sections.map((s) => (
            <section key={s.slug} id={`faq-${s.slug}`} className="scroll-mt-24">
              <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-[var(--text)] mb-4">{s.title}</h2>
              <div className="space-y-2">
                {s.items.map((it) => <Item key={it.q} q={it.q} a={it.a} />)}
              </div>
            </section>
          ))}

          {/* Связь с поддержкой */}
          <section className="rounded-3xl bg-[var(--bg2)] p-6 md:p-8">
            <h2 className="text-xl font-semibold text-[var(--text)]">Не нашли ответ?</h2>
            <p className="mt-2 text-sm text-[var(--text-2)] leading-relaxed max-w-lg">
              Напишите оператору в чат на сайте — можно без регистрации. Для вопросов по заказу укажите его номер.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openChat()}
                className="h-11 px-5 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] inline-flex items-center gap-2 transition-colors"
              >
                <MessageCircle size={18} /> Написать в чат
              </button>
              <a
                href={SUPPORT_TG}
                target="_blank"
                rel="noopener noreferrer"
                className="h-11 px-5 rounded-xl text-sm font-medium text-[var(--text)] bg-[var(--bg3)] hover:text-[var(--text)] inline-flex items-center gap-2 transition-colors"
              >
                <Send size={17} /> Поддержка в Telegram
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
