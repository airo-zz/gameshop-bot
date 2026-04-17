// src/components/ui/TopProgressBar.tsx
import { useEffect, useRef, useState } from 'react'

interface TopProgressBarProps {
  active: boolean
}

export default function TopProgressBar({ active }: TopProgressBarProps) {
  const [width, setWidth] = useState(0)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)

    if (active) {
      setVisible(true)
      setWidth(0)
      // Ramp to ~75% over 600ms
      timerRef.current = setTimeout(() => setWidth(75), 20)
    } else {
      if (!visible) return
      // Complete to 100%, then fade out
      setWidth(100)
      fadeTimerRef.current = setTimeout(() => {
        setVisible(false)
        setWidth(0)
      }, 400)
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px))',
        left: 0,
        right: 0,
        height: 2,
        zIndex: 9999,
        pointerEvents: 'none',
        overflow: 'hidden',
        opacity: !active && width === 100 ? 0 : 1,
        transition: !active && width === 100 ? 'opacity 0.3s ease' : 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${width}%`,
          background: 'linear-gradient(90deg, #1d4ed8, #60a5fa)',
          boxShadow: '0 0 8px rgba(96,165,250,0.6)',
          transition: active
            ? 'width 0.6s cubic-bezier(0.1, 0.9, 0.2, 1)'
            : 'width 0.25s ease-out',
        }}
      />
    </div>
  )
}
