/**
 * src/pages/admin/DashboardPage.tsx
 * Admin dashboard — статистика и ключевые метрики.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ShoppingCart,
  Users,
  TrendingUp,
  Package,
  Clock,
  AlertCircle,
} from 'lucide-react'
import { adminApi } from '@/api/admin'
import type { DashboardStats } from '@/api/admin'

function StatCard({
  label,
  value,
  sub,
  icon,
  accent = 'blue',
  index = 0,
  to,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  accent?: 'blue' | 'violet' | 'green' | 'orange'
  index?: number
  to?: string
}) {
  const accentMap = {
    blue:   'from-blue-500/10 to-blue-600/5 border-blue-500/20 text-blue-400',
    violet: 'from-violet-500/10 to-violet-600/5 border-violet-500/20 text-violet-400',
    green:  'from-emerald-500/10 to-emerald-600/5 border-emerald-500/20 text-emerald-400',
    orange: 'from-orange-500/10 to-orange-600/5 border-orange-500/20 text-orange-400',
  }

  const inner = (
    <>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-white/50">{label}</span>
        <span>{icon}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-white/40 mt-1">{sub}</div>}
    </>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
      className={`relative rounded-2xl border bg-gradient-to-br p-4 transition-all duration-200 ${accentMap[accent]} ${to ? 'cursor-pointer hover:brightness-110' : ''}`}
    >
      {to ? (
        <Link to={to} className="block">
          {inner}
        </Link>
      ) : inner}
    </motion.div>
  )
}

function formatMoney(v: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(v)
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    adminApi.getDashboard()
      .then(setStats)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-white/5 animate-pulse" />
        ))}
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-white/40">
        <AlertCircle size={40} />
        <p className="text-sm">Не удалось загрузить статистику</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-white/40 mt-0.5">Общая статистика магазина</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          label="Заказов сегодня"
          value={stats.orders_today}
          sub={`Всего: ${stats.orders_total}`}
          icon={<ShoppingCart size={18} />}
          accent="blue"
          index={0}
          to="/admin/orders"
        />
        <StatCard
          label="Выручка сегодня"
          value={formatMoney(stats.revenue_today)}
          sub={`За неделю: ${formatMoney(stats.revenue_week)}`}
          icon={<TrendingUp size={18} />}
          accent="green"
          index={1}
          to="/admin/orders"
        />
        <StatCard
          label="Пользователей"
          value={stats.users_total}
          sub={`+${stats.users_today} сегодня`}
          icon={<Users size={18} />}
          accent="violet"
          index={2}
          to="/admin/users"
        />
        <StatCard
          label="Ожидают обработки"
          value={stats.pending_orders}
          icon={<Clock size={18} />}
          accent="orange"
          index={3}
          to="/admin/orders"
        />
        <StatCard
          label="Товаров в каталоге"
          value={stats.products_total}
          sub={`${stats.products_out_of_stock} нет в наличии`}
          icon={<Package size={18} />}
          accent="blue"
          index={4}
          to="/admin/catalog"
        />
        <StatCard
          label="Выручка за неделю"
          value={formatMoney(stats.revenue_week)}
          sub={`Всего: ${formatMoney(stats.revenue_total)}`}
          icon={<TrendingUp size={18} />}
          accent="green"
          index={5}
          to="/admin/orders"
        />
      </div>
    </div>
  )
}
