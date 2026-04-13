/**
 * useDisintegrate.ts
 *
 * Premium "Vortex Glitch" animation for cart clearing.
 *
 * Visual effect (three overlapping phases):
 *
 *   Phase 0 — GLITCH SLICE (0ms → 180ms):
 *     A fixed clone of each element is created. The clone gets split into
 *     3 horizontal "slices" via clip-path: inset(). The slices shift
 *     left/right rapidly (box-shadow RGB offset illusion), simulating a
 *     digital corruption before the element is destroyed.
 *
 *   Phase 1 — VORTEX PULL (100ms → 700ms):
 *     Each clone translates toward a single focal point (center of the
 *     viewport, slightly upward) while rotating and scaling down to zero.
 *     The trajectory curves like a spiral: x uses an ease-in curve,
 *     y uses a softer curve. The combination produces a spiral path
 *     without any complex math.
 *
 *   Phase 2 — LAYOUT COLLAPSE (staggered, 80ms after clone is created):
 *     The original element (still in DOM flow) collapses its height,
 *     margins, and paddings to zero while the clone is mid-flight.
 *     The gap in the list closes smoothly.
 *
 * Stagger direction: top-to-bottom (natural reading order). All elements
 * converge to the same vortex point, creating a "black hole" visual.
 *
 * Public API:
 *   disintegrateAll(elements, staggerMs, onAllDone?)
 *   disintegrate(el, onDone?)
 */

import { animate } from 'framer-motion'

// ─── tunables ────────────────────────────────────────────────────────────────

const GLITCH_DURATION_MS = 180
const VORTEX_DURATION_MS = 580
const VORTEX_OFFSET_MS   = 80   // vortex starts this many ms after clone spawn
const COLLAPSE_OFFSET_MS = 60   // layout collapse starts this many ms after clone spawn
const COLLAPSE_DURATION_MS = 320

// Vortex focal point: slightly above center — feels like an upward drain
const VORTEX_Y_OFFSET_VH = -0.12  // fraction of viewport height, negative = up

// ─── focal point ─────────────────────────────────────────────────────────────

function getVortexPoint(): { x: number; y: number } {
  return {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2 + window.innerHeight * VORTEX_Y_OFFSET_VH,
  }
}

// ─── glitch slice effect on a clone ──────────────────────────────────────────

/**
 * Creates three invisible overlay divs inside `container` that each show
 * a horizontal slice of the clone via clip-path, then animate them with
 * chromatic aberration-style offsets.
 *
 * We use box-shadow with a colored spread as a cheap RGB-channel shift —
 * no SVG filters needed.
 */
function applyGlitchSlices(container: HTMLElement, durationMs: number): void {
  const h = container.offsetHeight
  if (h === 0) return

  // Three horizontal bands: top ~33%, middle ~34%, bottom ~33%
  const bands: Array<{ top: number; bottom: number; xShift: number; color: string }> = [
    { top: 0,          bottom: h * 0.33, xShift: -6,  color: '255,40,80'  },
    { top: h * 0.33,   bottom: h * 0.67, xShift:  8,  color: '40,220,255' },
    { top: h * 0.67,   bottom: h,        xShift: -4,  color: '120,40,255' },
  ]

  const sliceDivs: HTMLElement[] = []

  bands.forEach(({ top, bottom, xShift, color }) => {
    const slice = document.createElement('div')
    slice.style.cssText = `
      position: absolute;
      inset: 0;
      clip-path: inset(${top}px 0 ${h - bottom}px 0);
      pointer-events: none;
      will-change: transform, opacity;
      background: transparent;
    `

    // Copy the visual appearance from the container's first child (the card)
    // by giving the slice the same background color as the container
    const bg = getComputedStyle(container).backgroundColor
    slice.style.backgroundColor = bg || 'transparent'

    container.appendChild(slice)
    sliceDivs.push(slice)

    const durationSec = durationMs / 1000

    // Rapid jitter: shift left-right 4 times during glitch window
    animate(
      slice,
      {
        x:       [0, xShift, -xShift * 0.5, xShift * 1.2, 0],
        opacity: [1, 1,       1,              1,             0],
        // CSS box-shadow as a colored glow that imitates channel separation
        boxShadow: [
          `0 0 0px rgba(${color},0)`,
          `${xShift * 2}px 0 8px rgba(${color},0.9)`,
          `${-xShift}px 0 6px rgba(${color},0.6)`,
          `${xShift * 1.5}px 0 10px rgba(${color},0.8)`,
          `0 0 0px rgba(${color},0)`,
        ],
      },
      {
        duration: durationSec,
        ease: 'linear',
        times: [0, 0.25, 0.5, 0.75, 1],
      },
    )
  })

  // Cleanup slices after animation
  setTimeout(() => {
    sliceDivs.forEach(s => {
      if (s.parentNode) s.parentNode.removeChild(s)
    })
  }, durationMs + 20)
}

// ─── clone creation and positioning ─────────────────────────────────────────

interface CloneInfo {
  clone: HTMLElement
  rect: DOMRect
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
  `

  // Remove any transitions from the clone so framer-motion owns it entirely
  const allInner = clone.querySelectorAll<HTMLElement>('*')
  allInner.forEach(child => {
    child.style.transition = 'none'
    child.style.animation = 'none'
  })

  document.body.appendChild(clone)
  return { clone, rect }
}

// ─── layout collapse of the original element ────────────────────────────────

interface LayoutSnapshot {
  height: number
  marginTop: string
  marginBottom: string
  paddingTop: string
  paddingBottom: string
  overflow: string
  transition: string
  opacity: string
  visibility: string
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
  // Make original invisible immediately — the clone takes its visual place
  el.style.transition = 'none'
  el.style.opacity    = '0'
  el.style.visibility = 'hidden'
  // Lock height so it still occupies space until collapse runs
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
        ease: [0.4, 0, 0.2, 1],
      },
    ).then(() => {
      // Full cleanup of original
      el.style.display    = 'none'
      el.style.height     = snap.height > 0 ? `${snap.height}px` : ''
      el.style.marginTop  = snap.marginTop
      el.style.marginBottom = snap.marginBottom
      el.style.paddingTop = snap.paddingTop
      el.style.paddingBottom = snap.paddingBottom
      el.style.overflow   = snap.overflow
      el.style.transition = snap.transition
      el.style.opacity    = snap.opacity
      el.style.visibility = snap.visibility
      onDone?.()
    })
  }, delayMs)
}

// ─── vortex animation on clone ───────────────────────────────────────────────

function animateVortex(
  clone: HTMLElement,
  rect: DOMRect,
  delayMs: number,
  durationMs: number,
  onDone?: () => void,
): void {
  const vortex = getVortexPoint()

  // Delta from clone center to vortex focal point
  const cloneCenterX = rect.left + rect.width  / 2
  const cloneCenterY = rect.top  + rect.height / 2
  const dx = vortex.x - cloneCenterX
  const dy = vortex.y - cloneCenterY

  // Rotation: amount scales with horizontal distance so far-away items spin more
  const baseRotation = dx > 0 ? 180 : -180
  const spinExtra    = Math.abs(dx) / window.innerWidth * 120

  setTimeout(() => {
    animate(
      clone,
      {
        // Translate to vortex center, using keyframes for curved path feel:
        // midpoint is offset to one side to create a hook/arc trajectory
        x: [0, dx * 0.3 + (dy > 0 ? -40 : 40), dx],
        y: [0, dy * 0.4,                          dy],
        rotate: [0, baseRotation * 0.6, baseRotation + (dx > 0 ? spinExtra : -spinExtra)],
        scale:  [1, 0.7, 0],
        opacity:[1, 0.8, 0],
      },
      {
        duration: durationMs / 1000,
        // x accelerates sharply at end (sucked in), y is softer arc
        ease: [0.2, 0.05, 0.95, 0.85],
        times: [0, 0.45, 1],
      },
    ).then(() => {
      if (clone.parentNode) clone.parentNode.removeChild(clone)
      onDone?.()
    })
  }, delayMs)
}

// ─── single element ───────────────────────────────────────────────────────────

function disintegrateOne(
  el: HTMLElement,
  onDone?: () => void,
): void {
  if (!el || !document.contains(el)) {
    onDone?.()
    return
  }

  const snap = snapshotLayout(el)
  if (snap.height === 0) {
    onDone?.()
    return
  }

  // 1. Create a fixed clone that visually replaces the element
  const cloneInfo = createFixedClone(el)
  if (!cloneInfo) {
    onDone?.()
    return
  }
  const { clone, rect } = cloneInfo

  // 2. Immediately hide the original (clone takes its place visually)
  hideOriginalInstantly(el)

  // 3. Glitch effect on clone (starts immediately)
  applyGlitchSlices(clone, GLITCH_DURATION_MS)

  // 4. Vortex animation on clone (starts after short glitch window)
  animateVortex(clone, rect, VORTEX_OFFSET_MS, VORTEX_DURATION_MS)

  // 5. Collapse original layout while clone flies away
  const totalAnimMs = VORTEX_OFFSET_MS + VORTEX_DURATION_MS
  collapseElement(el, snap, COLLAPSE_OFFSET_MS, COLLAPSE_DURATION_MS)

  // 6. Signal completion after the full vortex animation ends
  setTimeout(() => {
    onDone?.()
  }, totalAnimMs + 40)
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Animate all elements out with a stagger, then call `onAllDone`.
 *
 * Stagger runs top-to-bottom: the topmost element starts first and all
 * converge to the same vortex point, creating a "black hole drain" effect.
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

  // Sort top-to-bottom by DOM position so the drain looks natural
  const sorted = [...valid].sort((a, b) => {
    const ay = a.getBoundingClientRect().top
    const by = b.getBoundingClientRect().top
    return ay - by
  })

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
 * Animate a single element out with the vortex glitch effect.
 * Convenience wrapper for one-off use cases (e.g., removing one cart item).
 */
export function disintegrate(el: HTMLElement, onDone?: () => void): void {
  disintegrateOne(el, onDone)
}
