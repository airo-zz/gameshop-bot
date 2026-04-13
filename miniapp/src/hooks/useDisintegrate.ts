/**
 * useDisintegrate.ts
 * Telegram-style "Thanos snap" dust disintegration effect.
 *
 * Hybrid approach:
 * - html2canvas for reliable DOM→image capture
 * - SVG feTurbulence + feDisplacementMap for GPU dust animation
 *   (same filter chain as Telegram Web A's SnapEffectContainer.tsx)
 * - requestAnimationFrame drives filter param updates (reliable vs SMIL)
 */

import html2canvas from 'html2canvas'

const SVG_NS = 'http://www.w3.org/2000/svg'
const DURATION = 800

let counter = 0

/**
 * Disintegrate a DOM element with Telegram-style dust effect.
 */
export async function disintegrate(
  element: HTMLElement,
  onDone?: () => void,
): Promise<void> {
  const rect = element.getBoundingClientRect()
  const { left: x, top: y, width, height } = rect

  // Skip off-screen elements
  if (
    x + width < -50 || x - 50 > window.innerWidth ||
    y + height < -50 || y - 50 > window.innerHeight
  ) {
    element.style.opacity = '0'
    onDone?.()
    return
  }

  // 1. Capture element as image
  const snapshot = await html2canvas(element, {
    backgroundColor: null,
    scale: 1,
    logging: false,
    useCORS: true,
    removeContainer: true,
  })
  const dataUrl = snapshot.toDataURL()

  // 2. Build SVG with static filter (no SMIL <animate>)
  const seed = Math.floor(Date.now() / 1000) + counter
  const filterId = `snap-${++counter}`
  const smallestSide = Math.min(width, height)

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    width: ${width}px;
    height: ${height}px;
    pointer-events: none;
    z-index: 9999;
    overflow: visible;
  `

  // Build filter with references we'll animate manually
  const defs = document.createElementNS(SVG_NS, 'defs')
  const filter = document.createElementNS(SVG_NS, 'filter')
  filter.setAttribute('id', filterId)
  filter.setAttribute('x', '-150%')
  filter.setAttribute('y', '-150%')
  filter.setAttribute('width', '400%')
  filter.setAttribute('height', '400%')
  filter.setAttribute('color-interpolation-filters', 'sRGB')

  // feTurbulence → dust noise pattern
  const turb1 = document.createElementNS(SVG_NS, 'feTurbulence')
  turb1.setAttribute('type', 'fractalNoise')
  turb1.setAttribute('baseFrequency', '0.5')
  turb1.setAttribute('numOctaves', '1')
  turb1.setAttribute('result', 'dustNoise')
  turb1.setAttribute('seed', String(seed))
  filter.appendChild(turb1)

  // feComponentTransfer → alpha mask (slope will be animated)
  const ct = document.createElementNS(SVG_NS, 'feComponentTransfer')
  ct.setAttribute('in', 'dustNoise')
  ct.setAttribute('result', 'dustNoiseMask')
  const funcA = document.createElementNS(SVG_NS, 'feFuncA')
  funcA.setAttribute('type', 'linear')
  funcA.setAttribute('slope', '5')
  funcA.setAttribute('intercept', '0')
  ct.appendChild(funcA)
  filter.appendChild(ct)

  // feComposite → mask source through noise
  const comp = document.createElementNS(SVG_NS, 'feComposite')
  comp.setAttribute('in', 'SourceGraphic')
  comp.setAttribute('in2', 'dustNoiseMask')
  comp.setAttribute('operator', 'in')
  comp.setAttribute('result', 'dustySource')
  filter.appendChild(comp)

  // Two displacement noise layers
  const turb2 = document.createElementNS(SVG_NS, 'feTurbulence')
  turb2.setAttribute('type', 'fractalNoise')
  turb2.setAttribute('baseFrequency', '0.015')
  turb2.setAttribute('numOctaves', '1')
  turb2.setAttribute('result', 'dispNoise1')
  turb2.setAttribute('seed', String(seed + 1))
  filter.appendChild(turb2)

  const turb3 = document.createElementNS(SVG_NS, 'feTurbulence')
  turb3.setAttribute('type', 'fractalNoise')
  turb3.setAttribute('baseFrequency', '1')
  turb3.setAttribute('numOctaves', '2')
  turb3.setAttribute('result', 'dispNoise2')
  turb3.setAttribute('seed', String(seed + 2))
  filter.appendChild(turb3)

  const merge = document.createElementNS(SVG_NS, 'feMerge')
  merge.setAttribute('result', 'combinedNoise')
  const mn1 = document.createElementNS(SVG_NS, 'feMergeNode')
  mn1.setAttribute('in', 'dispNoise1')
  merge.appendChild(mn1)
  const mn2 = document.createElementNS(SVG_NS, 'feMergeNode')
  mn2.setAttribute('in', 'dispNoise2')
  merge.appendChild(mn2)
  filter.appendChild(merge)

  // feDisplacementMap (scale will be animated)
  const disp = document.createElementNS(SVG_NS, 'feDisplacementMap')
  disp.setAttribute('in', 'dustySource')
  disp.setAttribute('in2', 'combinedNoise')
  disp.setAttribute('scale', '0')
  disp.setAttribute('xChannelSelector', 'R')
  disp.setAttribute('yChannelSelector', 'G')
  filter.appendChild(disp)

  defs.appendChild(filter)
  svg.appendChild(defs)

  // Image element with captured snapshot
  const img = document.createElementNS(SVG_NS, 'image')
  img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataUrl)
  img.setAttribute('width', String(width))
  img.setAttribute('height', String(height))
  img.setAttribute('filter', `url(#${filterId})`)
  svg.appendChild(img)

  // 3. Insert overlay, hide original
  document.body.appendChild(svg)
  element.style.transition = 'opacity 0.2s ease-out'
  element.style.opacity = '0'

  // 4. Animate filter params with rAF
  const maxDisp = smallestSide * 3
  const startTime = performance.now()

  function tick(now: number) {
    const elapsed = now - startTime
    const t = Math.min(elapsed / DURATION, 1) // 0→1

    // Slope: 5→0 with ease-in curve (faster dissolve at end)
    const slope = 5 * (1 - t) * (1 - t)
    funcA.setAttribute('slope', String(slope))

    // Displacement: 0→max with ease-out curve (fast scatter start)
    const eased = 1 - (1 - t) * (1 - t)
    disp.setAttribute('scale', String(eased * maxDisp))

    // Slight scale-up like Telegram
    const scale = 1 + t * 0.15
    svg.style.transform = `scale(${scale})`
    svg.style.transformOrigin = 'center center'

    if (t < 1) {
      requestAnimationFrame(tick)
    } else {
      svg.remove()
      onDone?.()
    }
  }

  requestAnimationFrame(tick)
}

/**
 * Disintegrate multiple elements with stagger.
 */
export async function disintegrateAll(
  elements: HTMLElement[],
  staggerMs = 60,
  onAllDone?: () => void,
): Promise<void> {
  if (elements.length === 0) { onAllDone?.(); return }

  let completed = 0
  const total = elements.length

  for (let i = 0; i < total; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, staggerMs))
    disintegrate(elements[i], () => {
      completed++
      if (completed >= total) onAllDone?.()
    })
  }
}
