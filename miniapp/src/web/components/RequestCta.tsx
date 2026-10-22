/**
 * src/web/components/RequestCta.tsx
 * Карточки-ссылки на заявку: «Не нашли свою игру?» и «Индивидуальный заказ»
 * (как на главной Mini App). Ведут на /request.
 */
import { Link } from 'react-router-dom'
import { ChevronRight, MessageSquarePlus, Search } from '@/components/ui/icons'

export default function RequestCta({ query }: { query?: string }) {
  const items = [
    {
      to: `/request?type=missing_game${query ? `&game=${encodeURIComponent(query)}` : ''}`,
      Icon: Search,
      title: 'Не нашли свою игру?',
      text: 'Напишите нам — соберём заказ индивидуально',
    },
    {
      to: '/request?type=custom_order',
      Icon: MessageSquarePlus,
      title: 'Нужен особый набор или количество?',
      text: 'Опишите запрос — оператор подберёт вариант и цену',
    },
  ]
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {items.map(({ to, Icon, title, text }) => (
        <Link key={to} to={to} className="group flex items-center gap-4 p-5 rounded-2xl bg-[var(--bg2)] hover:bg-[var(--bg3)] transition-colors">
          <span className="w-11 h-11 rounded-xl bg-[var(--bg3)] group-hover:bg-[var(--bg2)] flex items-center justify-center shrink-0 text-[var(--link)] transition-colors">
            <Icon size={22} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-base font-semibold text-[var(--text)]">{title}</span>
            <span className="block text-sm text-[var(--hint)] mt-0.5">{text}</span>
          </span>
          <ChevronRight size={18} className="text-[var(--hint)] shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </div>
  )
}
