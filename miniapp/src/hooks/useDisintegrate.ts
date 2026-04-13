/**
 * useDisintegrate.ts
 * Telegram-style "Thanos snap" dust disintegration effect.
 *
 * Uses SVG filters (feTurbulence + feDisplacementMap) — the exact same
 * technique Telegram Web A uses in SnapEffectContainer.tsx.
 * GPU-accelerated, no canvas, no html2canvas dependency.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'
const DURATION = 800   // ms — slightly faster than TG's 1000ms per user request
const VISIBILITY_MARGIN = 50

let counter = 0

/**
 * Disintegrate a DOM element with Telegram's SVG-filter dust effect.
 */
export function disintegrate(
  element: HTMLElement,
  onDone?: () => void,
): boolean {
  const rect = element.getBoundingClientRect()
  const x = rect.left
  const y = rect.top
  const width = rect.width
  const height = rect.height

  // Skip if off-screen
  if (
    x + width + VISIBILITY_MARGIN < 0 || x - VISIBILITY_MARGIN > window.innerWidth ||
    y + height + VISIBILITY_MARGIN < 0 || y - VISIBILITY_MARGIN > window.innerHeight
  ) {
    element.style.opacity = '0'
    onDone?.()
    return false
  }

  const seed = Math.floor(Date.now() / 1000)
  const filterId = `snap-dust-${++counter}`

  // Create SVG container
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    pointer-events: none;
    z-index: 9999;
    overflow: visible;
    transform-origin: center center;
    animation: snapScale ${DURATION}ms ease-in forwards;
  `

  // Build SVG filter — exact Telegram approach
  const smallestSide = Math.min(width, height)

  const defs = document.createElementNS(SVG_NS, 'defs')
  const filter = document.createElementNS(SVG_NS, 'filter')
  filter.setAttribute('id', filterId)
  filter.setAttribute('x', '-150%')
  filter.setAttribute('y', '-150%')
  filter.setAttribute('width', '400%')
  filter.setAttribute('height', '400%')
  filter.setAttribute('color-interpolation-filters', 'sRGB')

  // 1) Noise mask — dissolves pixels through fractal noise
  const turbulence1 = document.createElementNS(SVG_NS, 'feTurbulence')
  turbulence1.setAttribute('type', 'fractalNoise')
  turbulence1.setAttribute('baseFrequency', '0.5')
  turbulence1.setAttribute('numOctaves', '1')
  turbulence1.setAttribute('result', 'dustNoise')
  turbulence1.setAttribute('seed', String(seed))
  filter.appendChild(turbulence1)

  // 2) Animate alpha mask: slope 5→0 (pixels dissolve through noise)
  const compTransfer = document.createElementNS(SVG_NS, 'feComponentTransfer')
  compTransfer.setAttribute('in', 'dustNoise')
  compTransfer.setAttribute('result', 'dustNoiseMask')
  const funcA = document.createElementNS(SVG_NS, 'feFuncA')
  funcA.setAttribute('type', 'linear')
  funcA.setAttribute('slope', '5')
  funcA.setAttribute('intercept', '0')
  const animSlope = document.createElementNS(SVG_NS, 'animate')
  animSlope.setAttribute('attributeName', 'slope')
  animSlope.setAttribute('values', '5; 2; 1; 0')
  animSlope.setAttribute('dur', `${DURATION}ms`)
  animSlope.setAttribute('fill', 'freeze')
  funcA.appendChild(animSlope)
  compTransfer.appendChild(funcA)
  filter.appendChild(compTransfer)

  // 3) Composite source through dust mask
  const composite = document.createElementNS(SVG_NS, 'feComposite')
  composite.setAttribute('in', 'SourceGraphic')
  composite.setAttribute('in2', 'dustNoiseMask')
  composite.setAttribute('operator', 'in')
  composite.setAttribute('result', 'dustySource')
  filter.appendChild(composite)

  // 4) Displacement noises — two layers for organic movement
  const turbulence2 = document.createElementNS(SVG_NS, 'feTurbulence')
  turbulence2.setAttribute('type', 'fractalNoise')
  turbulence2.setAttribute('baseFrequency', '0.015')
  turbulence2.setAttribute('numOctaves', '1')
  turbulence2.setAttribute('result', 'displacementNoise1')
  turbulence2.setAttribute('seed', String(seed + 1))
  filter.appendChild(turbulence2)

  const turbulence3 = document.createElementNS(SVG_NS, 'feTurbulence')
  turbulence3.setAttribute('type', 'fractalNoise')
  turbulence3.setAttribute('baseFrequency', '1')
  turbulence3.setAttribute('numOctaves', '2')
  turbulence3.setAttribute('result', 'displacementNoise2')
  turbulence3.setAttribute('seed', String(seed + 2))
  filter.appendChild(turbulence3)

  const merge = document.createElementNS(SVG_NS, 'feMerge')
  merge.setAttribute('result', 'combinedNoise')
  const mergeNode1 = document.createElementNS(SVG_NS, 'feMergeNode')
  mergeNode1.setAttribute('in', 'displacementNoise1')
  merge.appendChild(mergeNode1)
  const mergeNode2 = document.createElementNS(SVG_NS, 'feMergeNode')
  mergeNode2.setAttribute('in', 'displacementNoise2')
  merge.appendChild(mergeNode2)
  filter.appendChild(merge)

  // 5) Displacement map — animate scale 0→N to scatter pixels
  const displacement = document.createElementNS(SVG_NS, 'feDisplacementMap')
  displacement.setAttribute('in', 'dustySource')
  displacement.setAttribute('in2', 'combinedNoise')
  displacement.setAttribute('scale', '0')
  displacement.setAttribute('xChannelSelector', 'R')
  displacement.setAttribute('yChannelSelector', 'G')
  const animScale = document.createElementNS(SVG_NS, 'animate')
  animScale.setAttribute('attributeName', 'scale')
  animScale.setAttribute('values', `0; ${smallestSide * 3}`)
  animScale.setAttribute('dur', `${DURATION}ms`)
  animScale.setAttribute('fill', 'freeze')
  displacement.appendChild(animScale)
  filter.appendChild(displacement)

  defs.appendChild(filter)
  svg.appendChild(defs)

  // Group with filter applied
  const g = document.createElementNS(SVG_NS, 'g')
  g.setAttribute('filter', `url(#${filterId})`)

  // foreignObject to hold cloned DOM element
  const fo = document.createElementNS(SVG_NS, 'foreignObject')
  fo.setAttribute('width', String(width))
  fo.setAttribute('height', String(height))
  fo.style.overflow = 'visible'

  // Clone element with computed styles
  const clone = element.cloneNode(true) as HTMLElement
  const computedStyle = window.getComputedStyle(element)
  clone.style.cssText = ''
  // Copy key visual properties
  const propsToClone = [
    'background', 'background-color', 'border', 'border-radius',
    'padding', 'color', 'font-size', 'font-weight', 'font-family',
    'line-height', 'box-shadow', 'display', 'flex-direction',
    'align-items', 'justify-content', 'gap', 'width', 'height',
    'overflow',
  ]
  for (const prop of propsToClone) {
    clone.style.setProperty(prop, computedStyle.getPropertyValue(prop), 'important')
  }
  clone.style.setProperty('margin', '0', 'important')
  clone.style.setProperty('position', 'static', 'important')
  clone.style.setProperty('opacity', '1', 'important')

  fo.appendChild(clone)
  g.appendChild(fo)
  svg.appendChild(g)

  // Insert SVG overlay & hide original
  document.body.appendChild(svg)
  element.style.transition = `opacity ${DURATION * 0.3}ms ease-out`
  element.style.opacity = '0'

  // Cleanup after animation
  svg.addEventListener('animationend', () => {
    svg.remove()
    onDone?.()
  }, { once: true })

  // Fallback cleanup (in case animationend doesn't fire)
  setTimeout(() => {
    if (svg.parentNode) {
      svg.remove()
      onDone?.()
    }
  }, DURATION + 100)

  return true
}

/**
 * Disintegrate multiple elements sequentially with stagger.
 */
export function disintegrateAll(
  elements: HTMLElement[],
  staggerMs = 60,
  onAllDone?: () => void,
): void {
  if (elements.length === 0) { onAllDone?.(); return }

  let completed = 0
  const total = elements.length

  elements.forEach((el, i) => {
    setTimeout(() => {
      disintegrate(el, () => {
        completed++
        if (completed >= total) onAllDone?.()
      })
    }, i * staggerMs)
  })
}
