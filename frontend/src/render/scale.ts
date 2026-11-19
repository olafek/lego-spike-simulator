// Pure helpers for the viewport: scale bar, grid label thinning, trail decimation.
// No Three.js or DOM in here so they can be unit-tested.

import { MM_PER_CM, MM_PER_INCH, round, type DisplayUnit } from '@/core/units'

export interface ScaleBar {
  /** real-world length the bar stands for */
  lengthMm: number
  /** exact on-screen length of the bar */
  px: number
  label: string
}

const CM_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500]
const IN_STEPS = [1, 2, 6, 12, 24, 48, 120]

/**
 * The largest round length (in the display unit) whose bar is at most `maxPx` wide.
 * Falls back to the smallest step when even that is too wide (very zoomed in).
 */
export function chooseScaleBar(pxPerMm: number, unit: DisplayUnit, maxPx = 140): ScaleBar {
  const per = unit === 'cm' ? MM_PER_CM : MM_PER_INCH
  const steps = unit === 'cm' ? CM_STEPS : IN_STEPS
  let pick = steps[0]
  for (const s of steps) if (s * per * pxPerMm <= maxPx) pick = s
  const lengthMm = pick * per
  return { lengthMm, px: lengthMm * pxPerMm, label: `${pick} ${unit}` }
}

/** Show every Nth major-line label so neighbouring labels are at least `minPx` apart. */
export function labelStep(pxPerMajor: number, minPx = 38): number {
  if (!(pxPerMajor > 0)) return 50
  for (const s of [1, 2, 5, 10, 20, 50]) if (s * pxPerMajor >= minPx) return s
  return 50
}

/** Minor subdivisions are only worth drawing when they are a few pixels apart. */
export function minorVisible(pxPerMinor: number, minPx = 6): boolean {
  return pxPerMinor >= minPx
}

/** Text for a grid line at `mm` from the origin, in the display unit. */
export function gridLabel(mm: number, unit: DisplayUnit): string {
  return String(round(unit === 'cm' ? mm / MM_PER_CM : mm / MM_PER_INCH, 1))
}

/** Grid line positions (mm) covering [min, max], exact multiples of `step`. */
export function gridLines(min: number, max: number, step: number): number[] {
  const out: number[] = []
  if (!(step > 0)) return out
  const k0 = Math.ceil(min / step - 1e-9)
  const k1 = Math.floor(max / step + 1e-9)
  for (let k = k0; k <= k1; k++) out.push(k * step + 0) // "+ 0" turns -0 into 0
  return out
}

/** True when `value` lies on a multiple of `step` (used to skip minor lines under major ones). */
export function isMultiple(value: number, step: number): boolean {
  const q = value / step
  return Math.abs(q - Math.round(q)) < 1e-6
}

export interface TrailPoint {
  x: number
  y: number
  /** frame index this point belongs to */
  frame: number
}

/**
 * Reduce a per-step path to the points that matter: a new point whenever the robot centre has
 * moved at least `minStepMm` since the last kept point. First and last frames are always kept.
 */
export function decimateTrail(frames: ReadonlyArray<{ x: number; y: number }>, minStepMm = 4): TrailPoint[] {
  const out: TrailPoint[] = []
  if (frames.length === 0) return out
  let lx = frames[0].x
  let ly = frames[0].y
  out.push({ x: lx, y: ly, frame: 0 })
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i]
    if (Math.hypot(f.x - lx, f.y - ly) >= minStepMm) {
      out.push({ x: f.x, y: f.y, frame: i })
      lx = f.x
      ly = f.y
    }
  }
  const last = frames.length - 1
  if (out[out.length - 1].frame !== last && (frames[last].x !== lx || frames[last].y !== ly)) {
    out.push({ x: frames[last].x, y: frames[last].y, frame: last })
  }
  return out
}

/** Number of trail points whose frame is <= `frame` (points are sorted by frame). */
export function trailCountAt(points: ReadonlyArray<TrailPoint>, frame: number): number {
  let lo = 0
  let hi = points.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].frame <= frame) lo = mid + 1
    else hi = mid
  }
  return lo
}

export interface DistanceMark {
  x: number
  y: number
  /** travelled path length at this mark (mm) */
  pathMm: number
  /** first frame at which the robot has reached the mark */
  frame: number
}

/** A mark every `everyMm` of travelled path (interpolated between steps). */
export function distanceMarks(frames: ReadonlyArray<{ x: number; y: number; path: number }>, everyMm: number, max = 200): DistanceMark[] {
  const out: DistanceMark[] = []
  if (!(everyMm > 0)) return out
  let next = everyMm
  for (let i = 1; i < frames.length && out.length < max; i++) {
    const a = frames[i - 1]
    const b = frames[i]
    while (b.path >= next - 1e-9 && out.length < max) {
      const span = b.path - a.path
      const k = span > 0 ? Math.min(1, Math.max(0, (next - a.path) / span)) : 1
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, pathMm: next, frame: i })
      next += everyMm
    }
  }
  return out
}

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** Orthographic zoom (px per mm) and centre that fit `b` into a viewport with a margin. */
export function fitOrtho(b: Bounds, widthPx: number, heightPx: number, marginPx = 56, minSpanMm = 700): { cx: number; cy: number; pxPerMm: number } {
  const spanX = Math.max(b.maxX - b.minX, minSpanMm)
  const spanY = Math.max(b.maxY - b.minY, minSpanMm)
  // on a small stage the margin must not eat the whole view
  marginPx = Math.min(marginPx, 0.12 * Math.min(widthPx, heightPx))
  const w = Math.max(50, widthPx - 2 * marginPx)
  const h = Math.max(50, heightPx - 2 * marginPx)
  const pxPerMm = Math.min(w / spanX, h / spanY)
  return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, pxPerMm }
}
