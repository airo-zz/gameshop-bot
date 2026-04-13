/**
 * useDisintegrate.ts
 *
 * Apple-style "fold into trash" animation for cart clearing.
 *
 * Visual effect (three overlapping phases):
 *
 *   Phase 0 — CLONE DETACH (0ms):
 *     A fixed clone of each element is created at the element's exact
 *     screen position. The original element is hidden instantly so the
 *     clone takes its visual place.
 *
 *   Phase 1 — ARC FLIGHT (0ms → 750ms):
 *     The clone travels along a curved Bezier-style path toward the
 *     bottom-right corner of the viewport (where the cart/tab-bar lives).
 *     Three keyframes simulate the arc: start → control point (offset
 *     diagonally) → destination. Scale goes from 1 → 0.5 → 0.1, rotation
 *     adds a gentle 8-12° tilt. Opacity stays near 1 until the final 25%
 *     of the path, then fades to 0 — exactly as Apple does it.
 *
 *   Phase 2 — LAYOUT COLLAPSE (60ms → 380ms):
 *     The original element's height, margins and paddings animate to zero
 *     while the clone is mid-flight. The gap in the list closes smoothly
 *     with a Material/Apple standard ease curve [0.4, 0, 0.2, 1].
 *
 * Stagger direction: top-to-bottom (natural reading order).
 * All clones converge to the same bottom-right destination.
 *
 * Public API:
 *   disintegrateAll(elements, staggerMs, onAllDone?)
 *   disintegrate(el, onDone?)
 */

import { animate } from 'framer-motion'

// ─── tunables ────────────────────────────────────────────────────────────────

const FLIGHT_DURATION_MS   = 750   // clone arc flight
const COLLAPSE_OFFSET_MS   = 60    // layout collapse starts this many ms after clone spawn
const COLLAPSE_DURATION_MS = 360   // how long the height animates to zero

// Control-point offset: how far the arc bows outward from a straight line.
// Positive = bows to the left/up, creating a natural genie-style curve.
const ARC_CTRL_X_OFFSET = -80   // pixels: arc bows left
const ARC_CTRL_Y_OFFSET = -60   // pixels: arc bows upward at midpoint

// Final scale when clone reaches destination (near-zero but not exactly 0
// so spring overshoot looks natural)
const FINAL_SCALE = 0.08

// Tilt: positive = clockwise. Items tilt slightly as they fly.
const TILT_DEG = 10

// ─── destination point ───────────────────────────────────────────────────────

/**
 * Returns the pixel coordinate of the bottom-right "trash" destination.
 * Positioned 32px from the right and 48px from the bottom to align roughly
 * with a typical tab-bar icon.
 */
function getTrashPoint(): { x: number; y: number } {
  return {
    x: window.innerWidth  - 32,
    y: window.innerHeight - 48,
  }
}

// ─── clone creation ──────────────────────────────────────────────────────────

interface CloneInfo {
  clone: HTMLElement
  rect:  DOMRect
}

function createFixedClone(el: HTMLElement): CloneInfo | null {
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return null

  const clone = el.cloneNode(true) as HTMLElement

  clone.style.cssText = `
    position: fixed;
    top: ${rect.top}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    margin: 0;
    padding: 0;
    z-index: 9999;
    pointer-events: none;
    will-change: transform, opacity;
    transform-origin: center center;
    box-sizing: border-box;
    overflow: hidden;
    border-radius: inherit;
  `

  // Strip any transitions/animations on cloned children so Framer Motion
  // has full ownership of the clone's visual state.
  clone.querySelectorAll<HTMLElement>('*').forEach(child => {
    child.style.transition = 'none'
    child.style.animation  = 'none'
  })

  document.body.appendChild(clone)
  return { clone, rect }
}

// ─── layout collapse of the original element ────────────────────────────────

interface LayoutSnapshot {
  height:        number
  marginTop:     string
  marginBottom:  string
  paddingTop:    string
  paddingBottom: string
  overflow:      string
  transition:    string
  opacity:       string
  visibility:    string
}

function snapshotLayout(el: HTMLElement): LayoutSnapshot {
  const cs = getComputedStyle(el)
  return {
    height:        el.getBoundingClientRect().height,
    marginTop:     cs.marginTop,
    marginBottom:  cs.marginBottom,
    paddingTop:    cs.paddingTop,
    paddingBottom: cs.paddingBottom,
    overflow:      cs.overflow,
    transition:    el.style.transition,
    opacity:       el.style.opacity,
    visibility:    el.style.visibility,
  }
}

function hideOriginalInstantly(el: HTMLElement): void {
  el.style.transition  = 'none'
  el.style.opacity     = '0'
  el.style.visibility  = 'hidden'
  const h = el.getBoundingClientRect().height
  if (h > 0) el.style.height = `${h}px`
  el.style.overflow = 'hidden'
}

function collapseElement(
  el: HTMLElement,
  snap: LayoutSnapshot,
  delayMs: number,
  durationMs: number,
  onDone?: () => void,
): void {
  setTimeout(() => {
    animate(
      el,
      {
        height:        0,
        marginTop:     0,
        marginBottom:  0,
        paddingTop:    0,
        paddingBottom: 0,
      },
      {
        duration: durationMs / 1000,
        // Standard Apple/Material easing for layout transitions
        ease: [0.4, 0, 0.2, 1],
      },
    ).then(() => {
      el.style.display       = 'none'
      el.style.height        = snap.height > 0 ? `${snap.height}px` : ''
      el.style.marginTop     = snap.marginTop
      el.style.marginBottom  = snap.marginBottom
      el.style.paddingTop    = snap.paddingTop
      el.style.paddingBottom = snap.paddingBottom
      el.style.overflow      = snap.overflow
      el.style.transition    = snap.transition
      el.style.opacity       = snap.opacity
      el.style.visibility    = snap.visibility
      onDone?.()
    })
  }, delayMs)
}

// ─── arc flight animation on clone ───────────────────────────────────────────

/**
 * Animates the clone along a curved arc toward the trash destination,
 * scaling it down and fading it out at the end — Apple Genie/Trash style.
 *
 * Path shape:
 *   start (clone center)
 *     → control point (offset to bow the path into a natural arc)
 *     → destination (bottom-right trash point)
 *
 * Three keyframes at t=0, t=0.45, t=1 produce a smooth perceived curve
 * because scale and translation both decelerate together.
 */
function animateArcFlight(
  clone: HTMLElement,
  rect:  DOMRect,
  durationMs: number,
  onDone?: () => void,
): void {
  const dest = getTrashPoint()

  // Delta from clone center to destination
  const cloneCenterX = rect.left + rect.width  / 2
  const cloneCenterY = rect.top  + rect.height / 2
  const totalDx = dest.x - cloneCenterX
  const totalDy = dest.y - cloneCenterY

  // Control point at ~45% of the path, bowed away from the straight line.
  // The bow direction is perpendicular-ish: nudge X left and Y up so the
  // arc has a gentle outward sweep like macOS Genie.
  const midDx = totalDx * 0.45 + ARC_CTRL_X_OFFSET
  const midDy = totalDy * 0.45 + ARC_CTRL_Y_OFFSET

  // Tilt direction: items to the left of destination tilt clockwise (+),
  // items to the right tilt counter-clockwise (−).
  const tilt = totalDx >= 0 ? TILT_DEG : -TILT_DEG

  animate(
    clone,
    {
      // Three keyframes produce the arc illusion via easing + midpoint offset
      x:       [0,    midDx,  totalDx],
      y:       [0,    midDy,  totalDy],

      // Scale: stays relatively large until the arc's midpoint, then
      // collapses sharply — mimics the acceleration into the dock icon
      scale:   [1,    0.45,   FINAL_SCALE],

      // Gentle tilt builds through the arc
      rotate:  [0,    tilt * 0.6, tilt],

      // Opacity: full during flight, vanishes only in the last quarter.
      // times array below maps each keyframe to a progress fraction.
      opacity: [1,    1,       0],
    },
    {
      duration: durationMs / 1000,

      // Custom cubic-bezier: starts slightly slow (natural pickup), then
      // accelerates toward destination — like iOS icon shrink.
      // Equivalent to CSS cubic-bezier(0.25, 0.1, 0.55, 1.0)
      ease: [0.25, 0.1, 0.55, 1.0],

      // Keyframe timing: control point is at 45% of duration,
      // destination at 100%. Opacity keyframe at 45% = still 1, so the
      // fade happens only between 45%→100% of the animation.
      times: [0, 0.45, 1],
    },
  ).then(() => {
    if (clone.parentNode) clone.parentNode.removeChild(clone)
    onDone?.()
  })
}

// ─── single element ───────────────────────────────────────────────────────────

function disintegrateOne(el: HTMLElement, onDone?: () => void): void {
  if (!el || !document.contains(el)) {
    onDone?.()
    return
  }

  const snap = snapshotLayout(el)
  if (snap.height === 0) {
    onDone?.()
    return
  }

  // 1. Snapshot rect before any DOM changes
  const cloneInfo = createFixedClone(el)
  if (!cloneInfo) {
    onDone?.()
    return
  }
  const { clone, rect } = cloneInfo

  // 2. Hide the original — clone takes its visual place
  hideOriginalInstantly(el)

  // 3. Fly the clone to the trash destination along an arc
  animateArcFlight(clone, rect, FLIGHT_DURATION_MS, onDone)

  // 4. Collapse the original's layout space while the clone is mid-arc
  collapseElement(el, snap, COLLAPSE_OFFSET_MS, COLLAPSE_DURATION_MS)
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Animate all elements out with a stagger, then call `onAllDone`.
 *
 * Elements are sorted top-to-bottom so the list empties from the top,
 * matching the natural reading direction. All clones converge to the
 * same bottom-right trash point.
 *
 * @param elements  - Array of DOM elements to animate out
 * @param staggerMs - Delay between each element's animation start (ms)
 * @param onAllDone - Called once after ALL elements have finished
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
  const total   = valid.length

  function onItemDone() {
    completed++
    if (completed >= total) onAllDone?.()
  }

  // Sort top-to-bottom: topmost item leaves first, feels natural
  const sorted = [...valid].sort(
    (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
  )

  sorted.forEach((el, index) => {
    const delay = index * staggerMs
    if (delay === 0) {
      disintegrateOne(el, onItemDone)
    } else {
      setTimeout(() => disintegrateOne(el, onItemDone), delay)
    }
  })
}

/**
 * Animate a single element out with the Apple arc-to-trash effect.
 * Convenience wrapper for one-off use cases (e.g., removing one cart item).
 */
export function disintegrate(el: HTMLElement, onDone?: () => void): void {
  disintegrateOne(el, onDone)
}
