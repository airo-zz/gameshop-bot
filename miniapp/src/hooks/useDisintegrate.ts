/**
 * useDisintegrate.ts
 * Telegram-style "Thanos snap" dust disintegration effect.
 *
 * Hybrid approach:
 * - html2canvas for reliable DOM→image capture (handles CSS vars, Tailwind, images)
 * - SVG feTurbulence + feDisplacementMap for GPU-accelerated dust animation
 *   (same filter chain as Telegram Web A's SnapEffectContainer.tsx)
 */

import html2canvas from 'html2canvas'

const SVG_NS = 'http://www.w3.org/2000/svg'
const DURATION = 800
const VISIBILITY_MARGIN = 50

let counter = 0

/**
 * Build the SVG filter element — exact Telegram filter chain.
 */
function createDustFilter(id: string, smallestSide: number, seed: number): SVGFilterElement {
  const filter = document.createElementNS(SVG_NS, 'filter')
  filter.setAttribute('id', id)
  filter.setAttribute('x', '-150%')
  filter.setAttribute('y', '-150%')
  filter.setAttribute('width', '400%')
  filter.setAttribute('height', '400%')
  filter.setAttribute('color-interpolation-filters', 'sRGB')

  // 1) Fractal noise → dust mask
  const turb1 = document.createElementNS(SVG_NS, 'feTurbulence')
  turb1.setAttribute('type', 'fractalNoise')
  turb1.setAttribute('baseFrequency', '0.5')
  turb1.setAttribute('numOctaves', '1')
  turb1.setAttribute('result', 'dustNoise')
  turb1.setAttribute('seed', String(seed))
  filter.appendChild(turb1)

  // 2) Alpha mask: slope animates 5→0 (dissolves pixels through noise)
  const ct = document.createElementNS(SVG_NS, 'feComponentTransfer')
  ct.setAttribute('in', 'dustNoise')
  ct.setAttribute('result', 'dustNoiseMask')
  const fa = document.createElementNS(SVG_NS, 'feFuncA')
  fa.setAttribute('type', 'linear')
  fa.setAttribute('slope', '5')
  fa.setAttribute('intercept', '0')
  const anim1 = document.createElementNS(SVG_NS, 'animate')
  anim1.setAttribute('attributeName', 'slope')
  anim1.setAttribute('values', '5; 2; 1; 0')
  anim1.setAttribute('dur', `${DURATION}ms`)
  anim1.setAttribute('fill', 'freeze')
  fa.appendChild(anim1)
  ct.appendChild(fa)
  filter.appendChild(ct)

  // 3) Composite source through dust mask
  const comp = document.createElementNS(SVG_NS, 'feComposite')
  comp.setAttribute('in', 'SourceGraphic')
  comp.setAttribute('in2', 'dustNoiseMask')
  comp.setAttribute('operator', 'in')
  comp.setAttribute('result', 'dustySource')
  filter.appendChild(comp)

  // 4) Two displacement noise layers for organic movement
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

  // 5) Displacement map: scale animates 0→N (scatters pixels)
  const disp = document.createElementNS(SVG_NS, 'feDisplacementMap')
  disp.setAttribute('in', 'dustySource')
  disp.setAttribute('in2', 'combinedNoise')
  disp.setAttribute('scale', '0')
  disp.setAttribute('xChannelSelector', 'R')
  disp.setAttribute('yChannelSelector', 'G')
  const anim2 = document.createElementNS(SVG_NS, 'animate')
  anim2.setAttribute('attributeName', 'scale')
  anim2.setAttribute('values', `0; ${smallestSide * 3}`)
  anim2.setAttribute('dur', `${DURATION}ms`)
  anim2.setAttribute('fill', 'freeze')
  disp.appendChild(anim2)
  filter.appendChild(disp)

  return filter
}

/**
 * Disintegrate a DOM element with Telegram-style dust effect.
 * Uses html2canvas for capture + SVG filters for GPU animation.
 */
export async function disintegrate(
  element: HTMLElement,
  onDone?: () => void,
): Promise<void> {
  const rect = element.getBoundingClientRect()
  const { left: x, top: y, width, height } = rect

  // Skip if off-screen
  if (
    x + width + VISIBILITY_MARGIN < 0 || x - VISIBILITY_MARGIN > window.innerWidth ||
    y + height + VISIBILITY_MARGIN < 0 || y - VISIBILITY_MARGIN > window.innerHeight
  ) {
    element.style.opacity = '0'
    onDone?.()
    return
  }

  // 1. Capture element as image via html2canvas
  const snapshot = await html2canvas(element, {
    backgroundColor: null,
    scale: 1,
    logging: false,
    useCORS: true,
    removeContainer: true,
  })
  const dataUrl = snapshot.toDataURL()

  // 2. Build SVG with filter + captured image
  const seed = Math.floor(Date.now() / 1000) + counter
  const filterId = `snap-dust-${++counter}`
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
    transform-origin: center center;
    animation: snapScale ${DURATION}ms ease-in forwards;
  `

  // Defs + filter
  const defs = document.createElementNS(SVG_NS, 'defs')
  defs.appendChild(createDustFilter(filterId, smallestSide, seed))
  svg.appendChild(defs)

  // Image with filter applied
  const img = document.createElementNS(SVG_NS, 'image')
  img.setAttribute('href', dataUrl)
  img.setAttribute('width', String(width))
  img.setAttribute('height', String(height))
  img.setAttribute('filter', `url(#${filterId})`)
  svg.appendChild(img)

  // 3. Insert SVG & hide original
  document.body.appendChild(svg)
  element.style.transition = `opacity ${DURATION * 0.25}ms ease-out`
  element.style.opacity = '0'

  // 4. Cleanup
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    svg.remove()
    onDone?.()
  }

  svg.addEventListener('animationend', cleanup, { once: true })
  // Fallback in case animationend doesn't fire
  setTimeout(cleanup, DURATION + 150)
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
