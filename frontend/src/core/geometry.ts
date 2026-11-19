// 2D floor-plane geometry (mm). World frame: +x right, +y "up the mat".
// Heading h is in radians, clockwise from +y (so a right turn increases h, like SPIKE yaw).

export interface Vec {
  x: number
  y: number
}

export type Shape = { kind: 'poly'; pts: Vec[] } | { kind: 'circle'; c: Vec; r: number }

export interface Pose {
  x: number
  y: number
  h: number
}

/** Robot/local frame (lx = right, ly = forward) to world. */
export function toWorld(p: Pose, lx: number, ly: number): Vec {
  const c = Math.cos(p.h)
  const s = Math.sin(p.h)
  return { x: p.x + lx * c + ly * s, y: p.y - lx * s + ly * c }
}

export function toLocal(p: Pose, wx: number, wy: number): Vec {
  const dx = wx - p.x
  const dy = wy - p.y
  const c = Math.cos(p.h)
  const s = Math.sin(p.h)
  return { x: dx * c - dy * s, y: dx * s + dy * c }
}

/** Axis-aligned-in-local-frame rectangle [x0,x1]×[y0,y1] transformed by pose. */
export function rectShape(p: Pose, x0: number, x1: number, y0: number, y1: number): Shape {
  return { kind: 'poly', pts: [toWorld(p, x0, y0), toWorld(p, x1, y0), toWorld(p, x1, y1), toWorld(p, x0, y1)] }
}

/** Centred box of width w (local x) and length l (local y). */
export function boxShape(cx: number, cy: number, w: number, l: number, h: number): Shape {
  return rectShape({ x: cx, y: cy, h }, -w / 2, w / 2, -l / 2, l / 2)
}

export function circleShape(cx: number, cy: number, r: number): Shape {
  return { kind: 'circle', c: { x: cx, y: cy }, r }
}

function centroid(s: Shape): Vec {
  if (s.kind === 'circle') return s.c
  let x = 0
  let y = 0
  for (const p of s.pts) {
    x += p.x
    y += p.y
  }
  return { x: x / s.pts.length, y: y / s.pts.length }
}

function project(s: Shape, ax: number, ay: number): [number, number] {
  if (s.kind === 'circle') {
    const c = s.c.x * ax + s.c.y * ay
    return [c - s.r, c + s.r]
  }
  let min = Infinity
  let max = -Infinity
  for (const p of s.pts) {
    const d = p.x * ax + p.y * ay
    if (d < min) min = d
    if (d > max) max = d
  }
  return [min, max]
}

function axes(s: Shape, other: Shape, out: Vec[]): void {
  if (s.kind === 'poly') {
    const n = s.pts.length
    for (let i = 0; i < n; i++) {
      const a = s.pts[i]
      const b = s.pts[(i + 1) % n]
      const ex = b.x - a.x
      const ey = b.y - a.y
      const len = Math.hypot(ex, ey)
      if (len > 1e-9) out.push({ x: -ey / len, y: ex / len })
    }
  } else if (other.kind === 'poly') {
    // circle vs polygon: axis from the closest vertex to the circle centre
    let best: Vec | null = null
    let bestD = Infinity
    for (const p of other.pts) {
      const d = Math.hypot(p.x - s.c.x, p.y - s.c.y)
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    if (best && bestD > 1e-9) out.push({ x: (best.x - s.c.x) / bestD, y: (best.y - s.c.y) / bestD })
  } else {
    const d = Math.hypot(other.c.x - s.c.x, other.c.y - s.c.y)
    out.push(d > 1e-9 ? { x: (other.c.x - s.c.x) / d, y: (other.c.y - s.c.y) / d } : { x: 1, y: 0 })
  }
}

/**
 * Minimum translation vector that moves `b` out of `a` (separating-axis test, convex shapes).
 * Returns null when the shapes do not overlap.
 */
export function mtv(a: Shape, b: Shape): Vec | null {
  const ax: Vec[] = []
  axes(a, b, ax)
  axes(b, a, ax)
  let bestOverlap = Infinity
  let best: Vec | null = null
  for (const n of ax) {
    const [a0, a1] = project(a, n.x, n.y)
    const [b0, b1] = project(b, n.x, n.y)
    const overlap = Math.min(a1, b1) - Math.max(a0, b0)
    if (overlap <= 0) return null
    if (overlap < bestOverlap) {
      bestOverlap = overlap
      best = n
    }
  }
  if (!best) return null
  const ca = centroid(a)
  const cb = centroid(b)
  const sign = (cb.x - ca.x) * best.x + (cb.y - ca.y) * best.y < 0 ? -1 : 1
  return { x: best.x * bestOverlap * sign, y: best.y * bestOverlap * sign }
}

export function overlaps(a: Shape, b: Shape): boolean {
  return mtv(a, b) !== null
}

export function pointInShape(p: Vec, s: Shape): boolean {
  if (s.kind === 'circle') return Math.hypot(p.x - s.c.x, p.y - s.c.y) <= s.r
  let sign = 0
  const n = s.pts.length
  for (let i = 0; i < n; i++) {
    const a = s.pts[i]
    const b = s.pts[(i + 1) % n]
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (Math.abs(cross) < 1e-12) continue
    const sg = cross > 0 ? 1 : -1
    if (sign === 0) sign = sg
    else if (sg !== sign) return false
  }
  return true
}

/** Distance along a ray (origin o, unit direction d) to the first hit on the shape, or null. */
export function raycast(o: Vec, d: Vec, s: Shape): number | null {
  if (s.kind === 'circle') {
    const fx = o.x - s.c.x
    const fy = o.y - s.c.y
    const b = fx * d.x + fy * d.y
    const c = fx * fx + fy * fy - s.r * s.r
    const disc = b * b - c
    if (disc < 0) return null
    const t = -b - Math.sqrt(disc)
    if (t >= 0) return t
    return c <= 0 ? 0 : null
  }
  if (pointInShape(o, s)) return 0
  let best: number | null = null
  const n = s.pts.length
  for (let i = 0; i < n; i++) {
    const a = s.pts[i]
    const b = s.pts[(i + 1) % n]
    const ex = b.x - a.x
    const ey = b.y - a.y
    const denom = d.x * ey - d.y * ex
    if (Math.abs(denom) < 1e-12) continue
    const t = ((a.x - o.x) * ey - (a.y - o.y) * ex) / denom
    const u = ((a.x - o.x) * d.y - (a.y - o.y) * d.x) / denom
    if (t >= 0 && u >= 0 && u <= 1 && (best === null || t < best)) best = t
  }
  return best
}
