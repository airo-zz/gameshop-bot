/**
 * src/components/brand/penEngine.ts
 * Движок анимации «перо»: знак «D» пишется одним мазком (маска с анимируемой
 * обводкой), светящаяся точка идёт по переднему краю мазка. Поворот низ→ножка —
 * дуга, прямой угол знака открывает «веер» из центра поворота.
 * Только SVG-маски и обводки, без фильтров (Telegram WebView их не поддерживает).
 * Копия для сплэша (до загрузки бандла) — в index.html, держать в согласии.
 */

export const clamp = (v: number) => Math.max(0, Math.min(1, v))
/** Плавный разгон и торможение (cubic in-out) */
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
/** Сильнее разгон/торможение (quart in-out) — волна заливки букв */
export const easeFlow = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2)
/** Прогресс участка [a, b] секунд */
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a))

export interface Pen {
  seg: SVGPathElement
  path: SVGPathElement
  L: number
  bowl: SVGPathElement
  BL: number
  B0: number
  wedge: SVGPathElement
  ox: number
  oy: number
  R: number
  F0: number
  FL: number
  tip: SVGCircleElement | null
  halo: SVGCircleElement | null
}

/** Находит элементы пера внутри svg (классы pen-*) и готовит штрихи. */
export function preparePen(svg: SVGSVGElement): Pen {
  const q = <T extends Element>(sel: string) => svg.querySelector(sel) as T
  const segEl = q<SVGPathElement>('.pen-seg')
  const path = q<SVGPathElement>('.pen-c')
  const bowl = q<SVGPathElement>('.pen-bowl')
  const wedge = q<SVGPathElement>('.pen-wedge')
  const L = path.getTotalLength()
  const BL = bowl.getTotalLength()
  segEl.style.strokeDasharray = `${L} ${L}`
  bowl.style.strokeDasharray = `${BL} ${BL}`
  const [ox, oy, R] = (wedge.dataset.o ?? '0,0,0').split(',').map(Number)
  return {
    seg: segEl, path, L, bowl, BL, B0: Number(bowl.dataset.before ?? 0),
    wedge, ox, oy, R,
    F0: q<SVGPathElement>('.pen-pre').getTotalLength(),
    FL: q<SVGPathElement>('.pen-fillet').getTotalLength(),
    tip: svg.querySelector('.pen-tip'), halo: svg.querySelector('.pen-halo'),
  }
}

const bowlPart = (p: Pen, k: number) => clamp((k * p.L - p.B0) / p.BL)
const filletPart = (p: Pen, k: number) => clamp((k * p.L - p.F0) / p.FL)

/** «Веер» из центра поворота: сектор a0..a1 градусов (90 — вниз, 180 — влево) */
function wedge(p: Pen, a0: number, a1: number) {
  if (a1 - a0 < 0.01) { p.wedge.setAttribute('d', ''); return }
  let d = `M${p.ox},${p.oy}`
  for (let i = 0; i <= 12; i++) {
    const a = ((a0 + ((a1 - a0) * i) / 12) * Math.PI) / 180
    d += ` L${(p.ox + p.R * Math.cos(a)).toFixed(2)},${(p.oy + p.R * Math.sin(a)).toFixed(2)}`
  }
  p.wedge.setAttribute('d', d + ' Z')
}

/** k: 0..1 — сколько знака написано. tip — показывать светящуюся точку. */
export function drawPen(p: Pen, k: number, tip = true) {
  p.seg.style.strokeDashoffset = String(p.L * (1 - k))
  p.bowl.style.strokeDashoffset = String(p.BL * (1 - bowlPart(p, k)))
  wedge(p, 90, 90 + 90 * filletPart(p, k))
  if (!p.tip || !p.halo) return
  const pt = p.path.getPointAtLength(p.L * k)
  const show = tip ? Math.sin(Math.PI * Math.min(1, k * 1.02)) : 0
  for (const el of [p.tip, p.halo]) {
    el.setAttribute('cx', String(pt.x))
    el.setAttribute('cy', String(pt.y))
    el.style.opacity = String(show)
  }
}

/** e: 0..1 — сколько стёрто с начала мазка (цикл загрузки). */
export function erasePen(p: Pen, e: number) {
  p.seg.style.strokeDashoffset = String(-p.L * e)
  p.bowl.style.strokeDashoffset = String(-p.BL * bowlPart(p, e))
  wedge(p, 90 + 90 * filletPart(p, e), 180)
  if (p.tip && p.halo) { p.tip.style.opacity = '0'; p.halo.style.opacity = '0' }
}

/** Запуск покадровой анимации; step(t сек) → false, когда закончена. Возвращает стоп. */
export function runTimeline(step: (t: number) => boolean): () => void {
  let raf = 0
  const t0 = performance.now()
  const frame = (now: number) => {
    if (step((now - t0) / 1000)) raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(raf)
}

export const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
