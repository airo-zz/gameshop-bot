// src/components/ui/Bump.tsx
// Число «подпрыгивает» (CSS anim-pop), когда value меняется — но не при первом
// показе: открытие страницы остаётся тихим, анимация отвечает только на действие.
import { useEffect, useRef, useState, type ReactNode } from 'react'

export default function Bump({ value, children, className = '', style }: {
  value: unknown
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  const first = useRef(true)
  const [k, setK] = useState(0)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    setK((x) => x + 1)
  }, [value])
  return (
    <span key={k} className={`inline-block ${k > 0 ? 'anim-pop ' : ''}${className}`} style={style}>
      {children}
    </span>
  )
}
