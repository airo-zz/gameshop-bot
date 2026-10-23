/**
 * src/web/components/Motion.tsx
 * Анимации сайта. Одна точка правды для таймингов, уважает prefers-reduced-motion.
 *  • Reveal — блок проявляется один раз, когда доходит до экрана
 *  • Stagger/StaggerItem — элементы сетки появляются по очереди
 * Только при первой загрузке сайта за сеанс (web/intro.ts), иначе — сразу.
 */
import { useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { isIntro } from '@/web/intro'

/** Анимировать ли появление этого блока (решается при монтировании) */
function useAnimateIn() {
  const reduce = useReducedMotion()
  const [intro] = useState(isIntro)
  return intro && !reduce
}

export const EASE = [0.22, 1, 0.36, 1] as const

export function Reveal({ children, delay = 0, className, y = 14 }: {
  children: ReactNode; delay?: number; className?: string; y?: number
}) {
  if (!useAnimateIn()) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.55, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  if (!useAnimateIn()) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.1 }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  if (!useAnimateIn()) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  )
}
