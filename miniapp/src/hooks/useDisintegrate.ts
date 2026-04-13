/**
 * useDisintegrate.ts
 *
 * Premium "Explosion Burst" animation for cart clearing.
 *
 * Visual effect (two overlapping phases):
 *
 *   Phase 1 — BURST (0ms → 600ms, compositor-only):
 *     Each element flies out at a random angle with random rotation.
 *     Uses only transform + opacity → stays on compositor thread → 60fps.
 *
 *   Phase 2 — COLLAPSE (starts at 80ms, 300ms duration):
 *     Height, margins, paddings → 0 while the element is already flying out.
 *     Overlap with Phase 1 means the gap in layout closes smoothly while
 *     the card is still mid-air — feels snappy, not laggy.
 *
 * Stagger direction: REVERSED (last element bursts first, first last).
 * This creates a natural bottom-up explosive sweep that reads as "wiped out".
 *
 * Compatible signature:
 *   disintegrateAll(elements, staggerMs, onAllDone?)
 *   disintegrate(el, onDone?)
 */

import { animate } from 'framer-motion'

// ─── tunables ────────────────────────────────────────────────────────────────

/** How long the burst flight lasts (ms). */
const BURST_DURATION_MS = 520

/** Height collapse starts this many ms after burst begins. */
const COLLAPSE_OFFSET_MS = 80

/** Height collapse duration (ms). */
const COLLAPSE_DURATION_MS = 300

// ─── random helpers ──────────────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** Returns a random burst vector. The element flies out in a random direction
 *  biased slightly outward (not straight up/down which looks boring). */
function randomBurstVector(): { x: number; y: number; rotate: number } {
  // Angle in degrees, biased away from straight vertical (avoids boring effect)
  // Full 360° but weighted so horizontal spread is prominent
  const angleDeg = randomBetween(0, 360)
  const angleRad = (angleDeg * Math.PI) / 180

  // Distance: 120–240px — far enough to feel explosive, close enough to be fast
  const distance = randomBetween(120, 240)

  return {
    x: Math.cos(angleRad) * distance,
    y: Math.sin(angleRad) * distance,
    rotate: randomBetween(-180, 180),
  }
}

// ─── layout snapshot / restore ───────────────────────────────────────────────

interface Snapshot {
  height: number
  marginTop: string
  marginBottom: string
  paddingTop: string
  paddingBottom: string
  overflow: string
  transition: string
  position: string
  zIndex: string
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
    position: el.style.position,
    zIndex: el.style.zIndex,
  }
}

function prepareElement(el: HTMLElement, snap: Snapshot, zIndex: number): void {
  el.style.height = `${snap.height}px`
  el.style.overflow = 'hidden'
  el.style.transition = 'none'
  // Lift element above siblings so it visually flies "over" everything
  el.style.position = 'relative'
  el.style.zIndex = String(zIndex)
}

function restoreElement(el: HTMLElement, snap: Snapshot): void {
  el.style.height = ''
  el.style.marginTop = ''
  el.style.marginBottom = ''
  el.style.paddingTop = ''
  el.style.paddingBottom = ''
  el.style.overflow = snap.overflow
  el.style.transition = snap.transition
  el.style.position = snap.position
  el.style.zIndex = snap.zIndex
  el.style.opacity = ''
  el.style.transform = ''
}

// ─── single element ───────────────────────────────────────────────────────────

function disintegrateOne(
  el: HTMLElement,
  zIndex: number,
  onDone?: () => void,
): void {
  if (!el || !document.contains(el)) {
    onDone?.()
    return
  }

  const snap = snapshotElement(el)

  if (snap.height === 0) {
    onDone?.()
    return
  }

  prepareElement(el, snap, zIndex)

  const burst = randomBurstVector()
  const burstSec = BURST_DURATION_MS / 1000
  const collapseSec = COLLAPSE_DURATION_MS / 1000
  const collapseDelaySec = COLLAPSE_OFFSET_MS / 1000

  // Phase 1: BURST — fly out + spin + fade
  // spring for the initial pop, then ease-in to accelerate away
  animate(
    el,
    {
      x: [0, burst.x * 0.15, burst.x],
      y: [0, burst.y * 0.15, burst.y],
      rotate: [0, burst.rotate * 0.3, burst.rotate],
      opacity: [1, 0.9, 0],
      scale: [1, 1.08, 0.4],
    },
    {
      duration: burstSec,
      ease: [0.22, 0.03, 0.8, 0.97], // custom: slow start, rocket finish
      times: [0, 0.18, 1],           // 0→18% is the "pop" micro-bounce
    },
  )

  // Phase 2: COLLAPSE — layout closes while element is mid-flight
  animate(
    el,
    {
      height: 0,
      marginTop: 0,
      marginBottom: 0,
      paddingTop: 0,
      paddingBottom: 0,
    },
    {
      duration: collapseSec,
      delay: collapseDelaySec,
      ease: [0.4, 0, 0.6, 1], // symmetric ease — smooth gap close
    },
  )

  // Cleanup: hide after burst fully completes
  const totalMs = BURST_DURATION_MS + 40
  setTimeout(() => {
    el.style.display = 'none'
    restoreElement(el, snap)
    onDone?.()
  }, totalMs)
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Animate all elements out with a stagger, then call `onAllDone`.
 *
 * Stagger runs in REVERSE order (last element explodes first) — creates a
 * dramatic bottom-up burst sweep that feels like an explosion of the whole list.
 *
 * @param elements  - Array of DOM elements to disintegrate
 * @param staggerMs - Delay between each element's animation start (ms)
 * @param onAllDone - Called once after ALL elements finish
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

  // Reversed stagger: last element in list starts first
  // zIndex increases for later elements so they appear on top of the burst
  const reversed = [...valid].reverse()

  reversed.forEach((el, reversedIndex) => {
    const delay = reversedIndex * staggerMs
    // zIndex: elements starting earlier get higher z so they burst "over" others
    const zIndex = valid.length + reversedIndex

    if (delay === 0) {
      disintegrateOne(el, zIndex, onItemDone)
    } else {
      setTimeout(() => disintegrateOne(el, zIndex, onItemDone), delay)
    }
  })
}

/**
 * Animate a single element out with the explosion burst effect.
 * Convenience wrapper for one-off use cases.
 */
export function disintegrate(el: HTMLElement, onDone?: () => void): void {
  disintegrateOne(el, 10, onDone)
}
