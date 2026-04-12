/**
 * useDisintegrate.ts
 * Telegram-style particle disintegration effect.
 *
 * Captures a DOM element's pixels via html2canvas, then disperses them
 * as small square particles on an overlay canvas using requestAnimationFrame.
 */

import html2canvas from 'html2canvas'

// ── Particle ─────────────────────────────────────────────────────────────────

interface Particle {
  x: number
  y: number
  originX: number
  originY: number
  vx: number
  vy: number
  r: number
  g: number
  b: number
  a: number
  size: number
  life: number       // 0..1, starts at 1
  decay: number      // per-frame decay
  delay: number      // frames before particle starts moving
  gravity: number
}

// ── Config ───────────────────────────────────────────────────────────────────

const PARTICLE_GAP = 4        // sample every Nth pixel → particle size = N
const MAX_PARTICLES = 4000    // cap for performance
const BASE_SPEED = 2.5
const GRAVITY = 0.06
const LIFE_MIN = 0.008
const LIFE_MAX = 0.018

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Disintegrate a DOM element with a particle effect.
 * The element fades out while particles burst away from it.
 *
 * @param element  The DOM element to disintegrate
 * @param onDone   Callback when the animation finishes
 */
export async function disintegrate(
  element: HTMLElement,
  onDone?: () => void,
): Promise<void> {
  // 1. Capture the element as a canvas bitmap
  const snapshot = await html2canvas(element, {
    backgroundColor: null,          // transparent background
    scale: 1,                       // 1:1 pixel ratio for performance
    logging: false,
    useCORS: true,
    removeContainer: true,
  })

  const width = snapshot.width
  const height = snapshot.height
  const ctx = snapshot.getContext('2d')
  if (!ctx) { onDone?.(); return }

  const imageData = ctx.getImageData(0, 0, width, height).data

  // 2. Sample pixels → create particles
  const particles: Particle[] = []
  const gap = PARTICLE_GAP
  const maxCols = Math.ceil(width / gap)

  for (let y = 0; y < height; y += gap) {
    for (let x = 0; x < width; x += gap) {
      const i = (y * width + x) * 4
      const a = imageData[i + 3]
      if (a < 30) continue // skip nearly-transparent pixels

      // sweep delay: left-to-right, with some randomness
      const col = Math.floor(x / gap)
      const sweepProgress = col / maxCols
      const delay = Math.floor(sweepProgress * 18 + Math.random() * 8)

      // velocity: mostly upward & outward, with randomness
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.8
      const speed = BASE_SPEED * (0.5 + Math.random())

      particles.push({
        x, y,
        originX: x,
        originY: y,
        vx: Math.cos(angle) * speed + (Math.random() - 0.3) * 1.5,
        vy: Math.sin(angle) * speed,
        r: imageData[i],
        g: imageData[i + 1],
        b: imageData[i + 2],
        a: a / 255,
        size: gap,
        life: 1,
        decay: LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN),
        delay,
        gravity: GRAVITY * (0.5 + Math.random()),
      })
    }
  }

  // Cap particle count for mobile performance
  if (particles.length > MAX_PARTICLES) {
    particles.sort(() => Math.random() - 0.5)
    particles.length = MAX_PARTICLES
  }

  // 3. Position overlay canvas on top of the element
  const rect = element.getBoundingClientRect()
  const canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio || 1

  // Extra space around the element for particles to fly into
  const padding = 120
  canvas.width = (rect.width + padding * 2) * dpr
  canvas.height = (rect.height + padding * 2) * dpr
  canvas.style.cssText = `
    position: fixed;
    left: ${rect.left - padding}px;
    top: ${rect.top - padding}px;
    width: ${rect.width + padding * 2}px;
    height: ${rect.height + padding * 2}px;
    z-index: 9999;
    pointer-events: none;
  `
  document.body.appendChild(canvas)

  const drawCtx = canvas.getContext('2d')!
  drawCtx.scale(dpr, dpr)

  // Offset so particles at (0,0) start at the element's top-left
  const ox = padding
  const oy = padding

  // 4. Hide original element
  const prevOpacity = element.style.opacity
  const prevTransition = element.style.transition
  element.style.transition = 'opacity 0.35s ease-out'
  element.style.opacity = '0'

  // 5. Animate
  let frame = 0
  let alive = particles.length

  function tick() {
    drawCtx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    alive = 0
    frame++

    for (const p of particles) {
      if (p.life <= 0) continue

      if (p.delay > 0) {
        // Particle hasn't started yet — draw it in place
        p.delay--
        drawCtx.globalAlpha = p.a * p.life
        drawCtx.fillStyle = `rgb(${p.r},${p.g},${p.b})`
        drawCtx.fillRect(ox + p.originX, oy + p.originY, p.size, p.size)
        alive++
        continue
      }

      // Physics
      p.vy += p.gravity
      p.x += p.vx
      p.y += p.vy
      p.life -= p.decay

      if (p.life <= 0) continue

      // Draw
      const alpha = p.a * p.life
      drawCtx.globalAlpha = alpha
      drawCtx.fillStyle = `rgb(${p.r},${p.g},${p.b})`
      const size = p.size * (0.3 + p.life * 0.7) // shrink as life decreases
      drawCtx.fillRect(ox + p.x, oy + p.y, size, size)
      alive++
    }

    if (alive > 0) {
      requestAnimationFrame(tick)
    } else {
      // Cleanup — keep element hidden, caller handles visibility
      canvas.remove()
      onDone?.()
    }
  }

  requestAnimationFrame(tick)
}

/**
 * Disintegrate multiple elements sequentially with stagger.
 * Each element starts its animation `staggerMs` after the previous one.
 */
export async function disintegrateAll(
  elements: HTMLElement[],
  staggerMs = 80,
  onAllDone?: () => void,
): Promise<void> {
  if (elements.length === 0) { onAllDone?.(); return }

  let completed = 0
  const total = elements.length

  for (let i = 0; i < total; i++) {
    const el = elements[i]
    // stagger start
    await new Promise<void>((resolve) => setTimeout(resolve, i > 0 ? staggerMs : 0))
    disintegrate(el, () => {
      completed++
      if (completed >= total) onAllDone?.()
    })
  }
}
