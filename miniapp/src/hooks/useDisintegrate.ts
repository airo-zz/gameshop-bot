/**
 * useDisintegrate.ts
 * Telegram-style "Thanos snap" dust disintegration effect.
 *
 * Captures a DOM element via html2canvas, then disperses pixels
 * as fine dust particles drifting to the RIGHT — matching Telegram's
 * message deletion animation.
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
  decay: number      // per-frame life decrease
  delay: number      // frames before particle starts moving
}

// ── Config ───────────────────────────────────────────────────────────────────

const PARTICLE_GAP = 3        // sample every 3rd pixel → finer dust than 4px
const MAX_PARTICLES = 5000    // cap for mobile performance
const BASE_SPEED = 1.8        // base rightward velocity
const LIFE_MIN = 0.012
const LIFE_MAX = 0.025

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Disintegrate a DOM element with a Telegram-style dust effect.
 * Particles sweep left→right and drift rightward like blown dust.
 */
export async function disintegrate(
  element: HTMLElement,
  onDone?: () => void,
): Promise<void> {
  // 1. Capture the element as a canvas bitmap
  const snapshot = await html2canvas(element, {
    backgroundColor: null,
    scale: 1,
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
      if (a < 30) continue

      // Sweep delay: left-to-right columns, with vertical randomness
      const col = Math.floor(x / gap)
      const sweepProgress = col / maxCols
      // Left columns start first, right columns later — Telegram-style sweep
      const delay = Math.floor(sweepProgress * 25 + Math.random() * 6)

      // Velocity: primarily RIGHTWARD with slight vertical scatter
      // This is the key Telegram difference — dust blows to the right
      const vx = BASE_SPEED * (0.6 + Math.random() * 0.8)
      const vy = (Math.random() - 0.5) * 1.2  // slight up/down scatter

      particles.push({
        x, y,
        originX: x,
        originY: y,
        vx,
        vy,
        r: imageData[i],
        g: imageData[i + 1],
        b: imageData[i + 2],
        a: a / 255,
        size: gap,
        life: 1,
        decay: LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN),
        delay,
      })
    }
  }

  // Cap particle count for mobile
  if (particles.length > MAX_PARTICLES) {
    particles.sort(() => Math.random() - 0.5)
    particles.length = MAX_PARTICLES
  }

  // 3. Position overlay canvas on top of the element
  const rect = element.getBoundingClientRect()
  const canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio || 1

  // Extra padding — more on the right side where particles fly to
  const padLeft = 20
  const padRight = 160
  const padY = 40
  canvas.width = (rect.width + padLeft + padRight) * dpr
  canvas.height = (rect.height + padY * 2) * dpr
  canvas.style.cssText = `
    position: fixed;
    left: ${rect.left - padLeft}px;
    top: ${rect.top - padY}px;
    width: ${rect.width + padLeft + padRight}px;
    height: ${rect.height + padY * 2}px;
    z-index: 9999;
    pointer-events: none;
  `
  document.body.appendChild(canvas)

  const drawCtx = canvas.getContext('2d')!
  drawCtx.scale(dpr, dpr)
  drawCtx.imageSmoothingEnabled = false

  const ox = padLeft
  const oy = padY

  // 4. Fade out original element quickly
  const prevTransition = element.style.transition
  const prevOpacity = element.style.opacity
  element.style.transition = 'opacity 0.3s ease-out'
  element.style.opacity = '0'

  // 5. Animate
  let alive = particles.length

  function tick() {
    drawCtx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    alive = 0

    for (const p of particles) {
      if (p.life <= 0) continue

      if (p.delay > 0) {
        // Not started yet — draw in original position
        p.delay--
        drawCtx.globalAlpha = p.a * p.life
        drawCtx.fillStyle = `rgb(${p.r},${p.g},${p.b})`
        drawCtx.fillRect(ox + p.originX, oy + p.originY, p.size, p.size)
        alive++
        continue
      }

      // Physics: drift rightward, slight vertical scatter, decelerate slightly
      p.vx *= 0.99
      p.vy *= 0.98
      p.x += p.vx
      p.y += p.vy
      p.life -= p.decay

      if (p.life <= 0) continue

      // Draw — particles shrink and fade as they drift
      const alpha = p.a * p.life * p.life  // quadratic fade for smoother disappearance
      drawCtx.globalAlpha = alpha
      drawCtx.fillStyle = `rgb(${p.r},${p.g},${p.b})`
      const size = p.size * (0.2 + p.life * 0.8)
      drawCtx.fillRect(ox + p.x, oy + p.y, size, size)
      alive++
    }

    if (alive > 0) {
      requestAnimationFrame(tick)
    } else {
      canvas.remove()
      onDone?.()
    }
  }

  requestAnimationFrame(tick)
}

/**
 * Disintegrate multiple elements sequentially with stagger.
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
    const el = elements[i]
    await new Promise<void>((resolve) => setTimeout(resolve, i > 0 ? staggerMs : 0))
    disintegrate(el, () => {
      completed++
      if (completed >= total) onAllDone?.()
    })
  }
}
