/**
 * useDisintegrate.ts
 * Telegram-style "Thanos snap" dust disintegration effect.
 *
 * html2canvas captures DOM → SVG filter chain (feTurbulence + feDisplacementMap)
 * animates via native SMIL <animate> (GPU-accelerated).
 * Animations are started manually via beginElement() after DOM insertion.
 */

import html2canvas from 'html2canvas'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'
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

  if (width === 0 || height === 0) {
    onDone?.()
    return
  }

  // 1. Capture element
  const snapshot = await html2canvas(element, {
    backgroundColor: null,
    scale: 1,
    logging: false,
    useCORS: true,
    removeContainer: true,
  })
  const dataUrl = snapshot.toDataURL()

  // 2. Build SVG
  const seed = Math.floor(Date.now() / 1000) + counter
  const filterId = `snap-${++counter}`
  const smallestSide = Math.min(width, height)
  const dur = `${DURATION / 1000}s`

  // We build SVG as innerHTML string — SMIL <animate> elements
  // created this way are properly registered by the browser engine
  const svgHTML = `
<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}"
     width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
     style="position:fixed;left:${x}px;top:${y}px;width:${width}px;height:${height}px;pointer-events:none;z-index:9999;overflow:visible;transform-origin:center center;">
  <defs>
    <filter id="${filterId}" x="-150%" y="-150%" width="400%" height="400%"
            color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="1"
                    result="dustNoise" seed="${seed}"/>
      <feComponentTransfer in="dustNoise" result="dustNoiseMask">
        <feFuncA type="linear" slope="5" intercept="0">
          <animate attributeName="slope" values="5;2;1;0" dur="${dur}"
                   fill="freeze" begin="indefinite"/>
        </feFuncA>
      </feComponentTransfer>
      <feComposite in="SourceGraphic" in2="dustNoiseMask" operator="in" result="dustySource"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="1"
                    result="dispNoise1" seed="${seed + 1}"/>
      <feTurbulence type="fractalNoise" baseFrequency="1" numOctaves="2"
                    result="dispNoise2" seed="${seed + 2}"/>
      <feMerge result="combinedNoise">
        <feMergeNode in="dispNoise1"/>
        <feMergeNode in="dispNoise2"/>
      </feMerge>
      <feDisplacementMap in="dustySource" in2="combinedNoise" scale="0"
                         xChannelSelector="R" yChannelSelector="G">
        <animate attributeName="scale" values="0;${smallestSide * 3}" dur="${dur}"
                 fill="freeze" begin="indefinite"/>
      </feDisplacementMap>
    </filter>
  </defs>
  <image xlink:href="${dataUrl}" width="${width}" height="${height}"
         filter="url(#${filterId})"/>
</svg>`

  // 3. Insert into DOM via wrapper div (innerHTML parses SMIL correctly)
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:9999;'
  wrapper.innerHTML = svgHTML
  const svg = wrapper.firstElementChild as SVGSVGElement
  document.body.appendChild(wrapper)

  // 4. Hide original element
  element.style.transition = 'opacity 0.2s ease-out'
  element.style.opacity = '0'

  // 5. Start SMIL animations manually — they have begin="indefinite"
  const animates = svg.querySelectorAll('animate')
  requestAnimationFrame(() => {
    animates.forEach(a => {
      try { (a as SVGAnimateElement).beginElement() } catch (_) { /* ignore */ }
    })

    // Also animate the scale transform on the SVG via CSS transition
    svg.style.transition = `transform ${DURATION}ms ease-in`
    svg.style.transform = 'scale(1.15)'
  })

  // 6. Cleanup after animation
  setTimeout(() => {
    wrapper.remove()
    onDone?.()
  }, DURATION + 50)
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
