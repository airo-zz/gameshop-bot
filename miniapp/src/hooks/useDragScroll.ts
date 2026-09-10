/**
 * src/hooks/useDragScroll.ts
 * Горизонтальная прокрутка ленты мышью на ПК: click-drag + вертикальное колесо
 * → горизонтальный скролл. На тач-устройствах не мешает (использует mouse-события).
 * Возвращает ref, который нужно повесить на прокручиваемый контейнер.
 */

import { useEffect, useRef, type RefObject } from 'react'

export function useDragScroll<T extends HTMLElement = HTMLDivElement>(
  external?: RefObject<T>,
) {
  const internal = useRef<T>(null)
  const ref: RefObject<T> = external ?? internal

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let down = false
    let startX = 0
    let startScroll = 0
    let moved = false

    const onDown = (e: MouseEvent) => {
      down = true
      moved = false
      startX = e.pageX
      startScroll = el.scrollLeft
      el.style.cursor = 'grabbing'
    }
    const onMove = (e: MouseEvent) => {
      if (!down) return
      const dx = e.pageX - startX
      if (Math.abs(dx) > 3) moved = true
      el.scrollLeft = startScroll - dx
    }
    const onUp = () => {
      down = false
      el.style.cursor = ''
    }
    // Гасим клик по элементу, если это было перетаскивание (чтобы не сработал таб/карточка)
    const onClick = (e: MouseEvent) => {
      if (moved) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0 && el.scrollWidth > el.clientWidth) {
        el.scrollLeft += e.deltaY
        e.preventDefault()
      }
    }

    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    el.addEventListener('click', onClick, true)
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      el.removeEventListener('click', onClick, true)
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  return ref
}
