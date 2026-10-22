/**
 * src/components/brand/BrandMotion.tsx
 * Фирменная анимация «перо»:
 *   <PenLogo animate />  — полный логотип: «D» пишется мазком, контуры букв
 *                          рисуются вместе с ним, заливка растекается из «D»,
 *                          в конце блик (~3 с). Без animate — статичный вектор.
 *   <PenLoader size />   — знак загрузки: «D» пишется и стирается по кругу.
 * Сплэш миниапки — отдельная копия в index.html (играет до загрузки бандла).
 */
import { useEffect, useId, useRef, useState } from 'react'
import {
  FULL_VIEWBOX, ICON_D, ICON_GLYPH_TRANSFORM, LETTERS, MARK_D, PEN_FULL, PEN_ICON, type PenGeometry,
} from './logoPaths'
import {
  drawPen, ease, easeFlow, erasePen, preparePen, prefersReducedMotion, runTimeline, seg,
} from './penEngine'

const [VW, VH] = FULL_VIEWBOX
const ACCENT = '#2563EB'
const LIGHT = '#DCEBFF'

const cleanId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '')
/** Штрих «пусто» до первого кадра — иначе на мгновение мелькает готовый знак */
const HIDDEN_STROKE = { strokeDasharray: '0 100000' }

/** Маска-мазок «D» + вспомогательные пути пера (классы читает penEngine) */
function PenMask({ id, g }: { id: string; g: PenGeometry }) {
  return (
    <mask id={id} maskUnits="userSpaceOnUse" x="-60" y="-60" width={VW + 120} height={VH + 260}>
      <path className="pen-seg" d={g.path} fill="none" stroke="#fff" strokeWidth={g.width} strokeLinecap="butt" strokeLinejoin="round" style={HIDDEN_STROKE} />
      <path className="pen-bowl" data-before={g.bowl[1]} d={g.bowl[0]} fill="none" stroke="#fff" strokeWidth={g.bowl[2]} strokeLinecap="butt" style={HIDDEN_STROKE} />
      <path className="pen-wedge" data-o={g.corner.join(',')} d="" fill="#fff" />
    </mask>
  )
}
function PenHelpers({ g }: { g: PenGeometry }) {
  return (
    <>
      <path className="pen-c" d={g.path} fill="none" stroke="none" />
      <path className="pen-pre" d={g.pre} fill="none" stroke="none" />
      <path className="pen-fillet" d={g.fillet} fill="none" stroke="none" />
    </>
  )
}

// ── Полный логотип ───────────────────────────────────────────────────────────

export function PenLogo({ animate = false, className, onDone }: {
  animate?: boolean
  className?: string
  onDone?: () => void
}) {
  const uid = cleanId(useId())
  const ref = useRef<SVGSVGElement>(null)
  const [playing, setPlaying] = useState(() => animate && !prefersReducedMotion())
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (!playing || !ref.current) return
    const svg = ref.current
    const pen = preparePen(svg)
    const lines = [...svg.querySelectorAll<SVGPathElement>('.ltr-line')].map((el) => {
      const L = el.getTotalLength()
      el.style.strokeDasharray = `${L} ${L}`
      return { el, L }
    })
    const core = svg.querySelector('.fl-core')!, fl = svg.querySelector('.fl-left')!, fr = svg.querySelector('.fl-right')!
    const sheen = svg.querySelector('.pen-sheen')!
    // Волна заливки — из середины «D» к краям слова, мягкий край растёт вместе с ней
    const CX = 260, F = 160, R = Math.max(CX, VW - CX) + F
    const stop = runTimeline((t) => {
      drawPen(pen, ease(seg(t, 0.15, 1.55)))
      const d = ease(seg(t, 0.45, 1.55))
      for (const l of lines) l.el.style.strokeDashoffset = String(l.L * (1 - d))
      const r = R * easeFlow(seg(t, 1.15, 2.4))
      const f = Math.min(F, r)
      core.setAttribute('x', String(CX - r)); core.setAttribute('width', String(2 * r))
      fl.setAttribute('x', String(CX - r - f)); fl.setAttribute('width', String(f))
      fr.setAttribute('x', String(CX + r)); fr.setAttribute('width', String(f))
      sheen.setAttribute('x', String(-220 + ease(seg(t, 2.25, 2.95)) * (VW + 420)))
      if (t >= 3.05) { setPlaying(false); doneRef.current?.(); return false }
      return true
    })
    return stop
  }, [playing])

  const props = {
    ref, className, viewBox: `0 0 ${VW} ${VH}`, width: VW, height: VH,
    role: 'img', 'aria-label': 'reDonate', style: { overflow: 'visible' as const },
  }

  if (!playing) {
    return (
      <svg {...props}>
        {LETTERS.map((d, i) => <path key={i} d={d} fill={LIGHT} />)}
        <path d={MARK_D} fill={ACCENT} />
      </svg>
    )
  }

  return (
    <svg {...props}>
      <defs>
        <PenMask id={`${uid}m`} g={PEN_FULL} />
        <linearGradient id={`${uid}fl`} x1="0" x2="1"><stop offset="0" stopColor="#000" /><stop offset="1" stopColor="#fff" /></linearGradient>
        <linearGradient id={`${uid}fr`} x1="0" x2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#000" /></linearGradient>
        <mask id={`${uid}flood`} maskUnits="userSpaceOnUse" x="-20" y="-20" width={VW + 40} height={VH + 40}>
          <rect className="fl-core" x="0" y="-20" width="0" height={VH + 40} fill="#fff" />
          <rect className="fl-left" x="0" y="-20" width="0" height={VH + 40} fill={`url(#${uid}fl)`} />
          <rect className="fl-right" x="0" y="-20" width="0" height={VH + 40} fill={`url(#${uid}fr)`} />
        </mask>
        <radialGradient id={`${uid}tip`}><stop offset="0" stopColor="#fff" /><stop offset=".35" stopColor="#CFE0FF" stopOpacity=".9" /><stop offset="1" stopColor="#7FA6F5" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${uid}halo`}><stop offset="0" stopColor="#5B8DF5" stopOpacity=".55" /><stop offset="1" stopColor={ACCENT} stopOpacity="0" /></radialGradient>
        <linearGradient id={`${uid}sheen`} x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <clipPath id={`${uid}all`}><path d={MARK_D} />{LETTERS.map((d, i) => <path key={i} d={d} />)}</clipPath>
      </defs>
      <PenHelpers g={PEN_FULL} />
      <g mask={`url(#${uid}flood)`}>{LETTERS.map((d, i) => <path key={i} d={d} fill={LIGHT} />)}</g>
      <g>{LETTERS.map((d, i) => (
        <path key={i} className="ltr-line" d={d} fill="none" stroke={LIGHT} strokeWidth={1.6} strokeLinejoin="round" style={HIDDEN_STROKE} />
      ))}</g>
      <path d={MARK_D} fill={ACCENT} mask={`url(#${uid}m)`} />
      <circle className="pen-halo" r={34} fill={`url(#${uid}halo)`} style={{ opacity: 0 }} />
      <circle className="pen-tip" r={11} fill={`url(#${uid}tip)`} style={{ opacity: 0 }} />
      <g clipPath={`url(#${uid}all)`}>
        <rect className="pen-sheen" x="-220" y="-20" width="200" height={VH + 40} fill={`url(#${uid}sheen)`} transform="skewX(-18)" />
      </g>
    </svg>
  )
}

// ── Знак загрузки ────────────────────────────────────────────────────────────

/**
 * «D» пишется и стирается по кругу (2,2 с).
 * tone="tile" — в тёмной плитке (страницы); "bare" — только знак цветом текста
 * (внутри кнопок). Светящаяся точка — от 48px.
 */
export function PenLoader({ size = 32, tone = 'tile', className, label = 'Загрузка' }: {
  size?: number
  tone?: 'tile' | 'bare'
  className?: string
  label?: string
}) {
  const uid = cleanId(useId())
  const ref = useRef<SVGSVGElement>(null)
  const comet = size >= 48

  useEffect(() => {
    if (!ref.current) return
    const pen = preparePen(ref.current)
    if (prefersReducedMotion()) { drawPen(pen, 1, false); return }
    return runTimeline((t) => {
      const c = (t % 2.2) / 2.2
      if (c < 0.5) drawPen(pen, ease(c / 0.5), comet)
      else erasePen(pen, ease((c - 0.5) / 0.5))
      return true
    })
  }, [comet])

  const glyph = tone === 'tile' ? LIGHT : 'currentColor'
  return (
    <svg ref={ref} className={className} width={size} height={size} viewBox="0 0 256 256" role="img" aria-label={label} style={{ overflow: 'visible', flexShrink: 0 }}>
      <defs>
        <PenMask id={`${uid}m`} g={PEN_ICON} />
        <radialGradient id={`${uid}tip`}><stop offset="0" stopColor="#fff" /><stop offset=".35" stopColor="#E4EEFF" stopOpacity=".9" /><stop offset="1" stopColor="#9DBBFF" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${uid}halo`}><stop offset="0" stopColor="#fff" stopOpacity=".35" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
      </defs>
      {tone === 'tile' && <rect width="256" height="256" rx="58" fill="var(--bg3, #1E2128)" />}
      <g transform={ICON_GLYPH_TRANSFORM}>
        <path d={ICON_D} fill={glyph} opacity={tone === 'tile' ? 0.12 : 0.25} />
        <PenHelpers g={PEN_ICON} />
        <path d={ICON_D} fill={glyph} mask={`url(#${uid}m)`} />
        {comet && <>
          <circle className="pen-halo" r={40} fill={`url(#${uid}halo)`} style={{ opacity: 0 }} />
          <circle className="pen-tip" r={14} fill={`url(#${uid}tip)`} style={{ opacity: 0 }} />
        </>}
      </g>
    </svg>
  )
}
