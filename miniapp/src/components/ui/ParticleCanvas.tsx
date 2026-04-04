import { useEffect, useRef } from 'react'

// ── Simplex noise 3D (exact port) ─────────────────────────────────────────────
const _V = 1 / 3, _c = 1 / 6
const _fl = (b: number) => Math.floor(b) | 0
const _L = new Float64Array([
  1,1,0,-1,1,0,1,-1,0,-1,-1,0,
  1,0,1,-1,0,1,1,0,-1,-1,0,-1,
  0,1,1,0,-1,1,0,1,-1,0,-1,-1,
])
function buildPerm(rng = Math.random) {
  const o = new Uint8Array(512)
  for (let t = 0; t < 256; t++) o[t] = t
  for (let t = 0; t < 255; t++) {
    const z = t + ~~(rng() * (256 - t)), l = o[t]; o[t] = o[z]; o[z] = l
  }
  for (let t = 256; t < 512; t++) o[t] = o[t - 256]
  return o
}
function makeNoise3D() {
  const e = buildPerm()
  const ox = new Float64Array(e).map(l => _L[l % 12 * 3])
  const oy = new Float64Array(e).map(l => _L[l % 12 * 3 + 1])
  const oz = new Float64Array(e).map(l => _L[l % 12 * 3 + 2])
  return (A: number, S: number, G: number): number => {
    let h = 0, D = 0, M = 0, N = 0
    const P = (A + S + G) * _V
    const T = _fl(A + P), U = _fl(S + P), X = _fl(G + P)
    const Y = (T + U + X) * _c
    const i = A - (T - Y), r = S - (U - Y), s = G - (X - Y)
    let a,f,m,p,u,y
    if (i >= r) {
      if (r >= s)      { a=1;f=0;m=0;p=1;u=1;y=0 }
      else if (i >= s) { a=1;f=0;m=0;p=1;u=0;y=1 }
      else             { a=0;f=0;m=1;p=1;u=0;y=1 }
    } else {
      if (r < s)       { a=0;f=0;m=1;p=0;u=1;y=1 }
      else if (i < s)  { a=0;f=1;m=0;p=0;u=1;y=1 }
      else             { a=0;f=1;m=0;p=1;u=1;y=0 }
    }
    const Z=i-a+_c,q=r-f+_c,v=s-m+_c
    const B=i-p+2*_c,C=r-u+2*_c,E=s-y+2*_c
    const H=i-1+3*_c,I=r-1+3*_c,J=s-1+3*_c
    const k=T&255,w=U&255,x=X&255
    let d=.6-i*i-r*r-s*s
    if (d>=0) { const n=k+e[w+e[x]]; d*=d; h=d*d*(ox[n]*i+oy[n]*r+oz[n]*s) }
    let F=.6-Z*Z-q*q-v*v
    if (F>=0) { const n=k+a+e[w+f+e[x+m]]; F*=F; D=F*F*(ox[n]*Z+oy[n]*q+oz[n]*v) }
    let g=.6-B*B-C*C-E*E
    if (g>=0) { const n=k+p+e[w+u+e[x+y]]; g*=g; M=g*g*(ox[n]*B+oy[n]*C+oz[n]*E) }
    let j=.6-H*H-I*I-J*J
    if (j>=0) { const n=k+1+e[w+1+e[x+1]]; j*=j; N=j*j*(ox[n]*H+oy[n]*I+oz[n]*J) }
    return 32*(h+D+M+N)
  }
}

// ── Helpers (exact from reference) ───────────────────────────────────────────
const TAU = 2 * Math.PI
const lerp  = (a: number, b: number, t: number) => (1 - t) * a + t * b
const triWave = (t: number, period: number) => {
  const s = .5 * period
  return Math.abs((t + s) % period - s) / s
}
const rand  = (n: number) => n * Math.random()
const randS = (n: number) => n - rand(2 * n)

// ── Config ────────────────────────────────────────────────────────────────────
const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 768
const TARGET_FPS = IS_MOBILE ? 30 : 60
const FRAME_MS   = 1000 / TARGET_FPS

function getDPR() {
  return IS_MOBILE ? Math.min(devicePixelRatio, 1.5) : (devicePixelRatio || 1)
}

// Particle settings — magenta/pink palette
const PARTICLE_COUNT = IS_MOBILE ? 75  : 300
const RANGE_Y        = 100
const BASE_HUE       = 295   // pink-magenta base (#d946ef territory)
const RANGE_SPEED    = 1.2
const PROPS_PER      = 9     // x y vx vy life maxLife speed size hue

// ── Component ─────────────────────────────────────────────────────────────────
export default function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const noise3D = makeNoise3D()
    const dpr = getDPR()

    const parent = canvas.parentElement
    let W = parent?.offsetWidth  ?? window.innerWidth
    let H = parent?.offsetHeight ?? window.innerHeight

    canvas.width  = W * dpr
    canvas.height = H * dpr
    canvas.style.width  = `${W}px`
    canvas.style.height = `${H}px`

    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineCap = 'round'

    const total = PARTICLE_COUNT * PROPS_PER
    const props = new Float32Array(total)
    let tick = 0
    let center = [W * .5, H * .5]

    function initParticle(i: number) {
      props[i]   = rand(W)
      props[i+1] = center[1] + randS(RANGE_Y)
      props[i+2] = 0
      props[i+3] = 0
      props[i+4] = 0
      props[i+5] = 50 + rand(150)
      props[i+6] = rand(RANGE_SPEED)
      props[i+7] = 1 + rand(2)
      props[i+8] = BASE_HUE + rand(50)   // magenta → pink range
    }

    for (let i = 0; i < total; i += PROPS_PER) initParticle(i)

    // ── Resize ────────────────────────────────────────────────────────────────
    function resize() {
      W = parent?.offsetWidth  ?? window.innerWidth
      H = parent?.offsetHeight ?? window.innerHeight
      canvas!.width  = W * dpr
      canvas!.height = H * dpr
      canvas!.style.width  = `${W}px`
      canvas!.style.height = `${H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.lineCap = 'round'
      center = [W * .5, H * .5]
    }
    window.addEventListener('resize', resize)

    // ── Frame loop ────────────────────────────────────────────────────────────
    let raf = 0
    let lastFrame = 0
    let paused = false

    function draw(now: number) {
      raf = requestAnimationFrame(draw)
      if (paused) return
      const delta = now - lastFrame
      if (delta < FRAME_MS) return
      lastFrame = now - (delta % FRAME_MS)

      tick++

      ctx.clearRect(0, 0, W, H)
      // transparent background — page bg shows through
      ctx.fillStyle = 'rgba(8,8,16,0)'
      ctx.fillRect(0, 0, W, H)

      for (let i = 0; i < total; i += PROPS_PER) {
        const x      = props[i]
        const y      = props[i+1]
        const life   = props[i+4]
        const maxLife= props[i+5]
        const speed  = props[i+6]
        const size   = props[i+7]
        const hue    = props[i+8]

        // Noise-driven angle (exact formula from reference)
        const angle = noise3D(x * 0.00125, y * 0.00125, tick * 5e-4) * 3 * TAU

        const vx = lerp(props[i+2], Math.cos(angle), .5)
        const vy = lerp(props[i+3], Math.sin(angle), .5)
        const nx = x + vx * speed
        const ny = y + vy * speed

        const alpha = triWave(life, maxLife)

        ctx.lineWidth   = size
        ctx.strokeStyle = `hsla(${hue},100%,68%,${Math.min(alpha * 1.25, 1).toFixed(3)})`
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(nx, ny)
        ctx.stroke()

        props[i]   = nx
        props[i+1] = ny
        props[i+2] = vx
        props[i+3] = vy
        props[i+4] = life + 1

        if (nx > W || nx < 0 || ny > H || ny < 0 || life + 1 > maxLife) {
          initParticle(i)
        }
      }

      // Bloom (desktop only — exact from reference)
      if (!IS_MOBILE) {
        try {
          ctx.save()
          ctx.filter = 'blur(8px) brightness(200%)'
          ctx.globalCompositeOperation = 'lighter'
          ctx.drawImage(canvas!, 0, 0, W, H)
          ctx.restore()
        } catch {
          ctx.restore()
        }
      }

    }

    const onVisibility = () => { paused = document.hidden }
    document.addEventListener('visibilitychange', onVisibility)

    const tg = (window as any).Telegram?.WebApp
    const onActivated   = () => { paused = false }
    const onDeactivated = () => { paused = true  }
    tg?.onEvent?.('activated',   onActivated)
    tg?.onEvent?.('deactivated', onDeactivated)

    if (!document.hidden) {
      lastFrame = performance.now()
      raf = requestAnimationFrame(draw)
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
      tg?.offEvent?.('activated',   onActivated)
      tg?.offEvent?.('deactivated', onDeactivated)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        display: 'block',
        contain: 'strict',
        backfaceVisibility: 'hidden',
      }}
    />
  )
}
