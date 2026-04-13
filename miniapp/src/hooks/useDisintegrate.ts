/**
 * useDisintegrate.ts
 *
 * Premium staggered collapse animation for cart clearing.
 *
 * Visual effect: each element simultaneously
 *   - slides left  (x: 0 → -32px)
 *   - fades out    (opacity: 1 → 0)
 *   - collapses    (height + margins/paddings → 0)
 *
 * Uses Framer Motion imperative `animate()` — no React, no SVG filters,
 * no canvas. Runs entirely on the compositor thread → smooth 60fps on mobile.
 *
 * Compatible signature:
 *   disintegrateAll(elements, staggerMs, onAllDone?)
 */

import { animate, type AnimationPlaybackControls } from 'framer-motion'

// ─── tunables ────────────────────────────────────────────────────────────────

/** Duration of a single element's exit animation (ms). */
const ITEM_DURATION_MS = 380

/** Easing — snappy ease-in feels intentional, not sluggish. */
const EASE = [0.4, 0, 1, 1] as const // cubic-bezier ease-in

// ─── helpers ─────────────────────────────────────────────────────────────────

interface Snapshot {
  height: number
  marginTop: string
  marginBottom: string
  paddingTop: string
  paddingBottom: string
  overflow: string
  transition: string
}

function snapshotElement(el: HTMLElement): Snapshot {
  const cs = getComputedStyle(el)
  return {
    height: el.getBoundingClientRect().height,
    marginTop: cs.marginTop,
    marginBottom: cs.marginBottom,
    paddingTop: cs.paddingTop,
    paddingBottom: cs.paddingBottom,
    overflow: cs.overflow,
    transition: el.style.transition,
  }
}

function lockHeight(el: HTMLElement, snap: Snapshot): void {
  // Pin explicit height so Framer Motion can tween it to 0
  el.style.height = `${snap.height}px`
  el.style.overflow = 'hidden'
  // Remove any existing CSS transitions — FM drives everything
  el.style.transition = 'none'
}

function restoreElement(el: HTMLElement, snap: Snapshot): void {
  el.style.height = snap.height + 'px'
  el.style.marginTop = snap.marginTop
  el.style.marginBottom = snap.marginBottom
  el.style.paddingTop = snap.paddingTop
  el.style.paddingBottom = snap.paddingBottom
  el.style.overflow = snap.overflow
  el.style.transition = snap.transition
  el.style.opacity = ''
  el.style.transform = ''
}

// ─── single element ───────────────────────────────────────────────────────────

function disintegrateOne(el: HTMLElement, onDone?: () => void): void {
  if (!el || !document.contains(el)) {
    onDone?.()
    return
  }

  const snap = snapshotElement(el)

  if (snap.height === 0) {
    onDone?.()
    return
  }

  lockHeight(el, snap)

  const durationSec = ITEM_DURATION_MS / 1000
  const controls: AnimationPlaybackControls[] = []

  // Phase 1: slide + fade (starts immediately)
  controls.push(
    animate(el, { opacity: 0, x: -32 }, { duration: durationSec, ease: EASE }),
  )

  // Phase 2: height collapse (slight delay so slide leads)
  const collapseDuration = durationSec * 0.75
  const collapseDelay = durationSec * 0.15

  controls.push(
    animate(
      el,
      { height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 },
      { duration: collapseDuration, delay: collapseDelay, ease: EASE },
    ),
  )

  // Cleanup after the longest animation finishes
  const totalMs = ITEM_DURATION_MS + 20 // small buffer
  const timer = setTimeout(() => {
    // Remove element from layout flow cleanly
    el.style.display = 'none'
    // Restore inline styles so if React re-renders the element it's clean
    restoreElement(el, snap)
    onDone?.()
  }, totalMs)

  // Safety: if animations are cancelled externally, still clean up
  controls.forEach(c => {
    if (typeof c?.then === 'function') {
      c.then(() => {}).catch(() => {
        clearTimeout(timer)
        el.style.display = 'none'
        restoreElement(el, snap)
        onDone?.()
      })
    }
  })
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Animate all elements out with a stagger, then call `onAllDone`.
 *
 * @param elements  - Array of DOM elements to disintegrate
 * @param staggerMs - Delay between each element's animation start (ms)
 * @param onAllDone - Called once after the LAST element finishes
 */
export function disintegrateAll(
  elements: HTMLElement[],
  staggerMs: number,
  onAllDone?: () => void,
): void {
  const valid = elements.filter(el => el && document.contains(el))

  if (valid.length === 0) {
    onAllDone?.()
    return
  }

  let completed = 0
  const total = valid.length

  function onItemDone() {
    completed++
    if (completed >= total) {
      onAllDone?.()
    }
  }

  valid.forEach((el, index) => {
    const delay = index * staggerMs
    if (delay === 0) {
      disintegrateOne(el, onItemDone)
    } else {
      setTimeout(() => disintegrateOne(el, onItemDone), delay)
    }
  })
}

/**
 * Animate a single element out.
 * Convenience wrapper exposed for one-off use cases.
 */
export function disintegrate(el: HTMLElement, onDone?: () => void): void {
  disintegrateOne(el, onDone)
}
