// Straightening a photo of a table: the mapping between the four corners of the mat as they appear
// in the photo and the true rectangle of the mat. Pure maths, no browser APIs.

export interface Pt {
  x: number
  y: number
}

/** Four corners in this order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt]

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** A usable four-sided shape: every corner turns the same way (convex, not crossed) and none are collapsed. */
export function isProperQuad(q: Quad): boolean {
  let sign = 0
  let area = 0
  for (let i = 0; i < 4; i++) {
    const turn = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4])
    if (Math.abs(turn) < 1e-9) return false
    if (sign !== 0 && Math.sign(turn) !== sign) return false
    sign = Math.sign(turn)
    area += q[i].x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * q[i].y
  }
  return Math.abs(area) / 2 > 1e-6
}

/**
 * The 3×3 matrix (row-major, last entry 1) that takes each corner of `from` to the same corner of `to`.
 * Null when the corners do not describe a proper shape.
 */
export function solveHomography(from: Quad, to: Quad): number[] | null {
  if (!isProperQuad(from) || !isProperQuad(to)) return null
  // 8 equations, 8 unknowns: for each corner, X = (a x + b y + c) / (g x + h y + 1), Y = (d x + e y + f) / (same)
  const m: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]
    const { x: X, y: Y } = to[i]
    m.push([x, y, 1, 0, 0, 0, -X * x, -X * y, X])
    m.push([0, 0, 0, x, y, 1, -Y * x, -Y * y, Y])
  }
  // Gaussian elimination with partial pivoting
  for (let col = 0; col < 8; col++) {
    let pivot = col
    for (let row = col + 1; row < 8; row++) if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row
    if (Math.abs(m[pivot][col]) < 1e-12) return null
    ;[m[col], m[pivot]] = [m[pivot], m[col]]
    for (let row = 0; row < 8; row++) {
      if (row === col) continue
      const k = m[row][col] / m[col][col]
      if (k === 0) continue
      for (let j = col; j < 9; j++) m[row][j] -= k * m[col][j]
    }
  }
  const h = m.map((row, i) => row[8] / row[i])
  return [...h, 1]
}

export function mapPoint(h: number[], p: Pt): Pt {
  const w = h[6] * p.x + h[7] * p.y + h[8]
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w }
}

/** Pixel size of a straightened mat picture: one pixel per millimetre, shrunk so the longer side fits `maxDimension`. */
export function matPictureSize(mat: { widthMm: number; lengthMm: number }, maxDimension: number): { width: number; height: number } {
  const k = Math.min(1, maxDimension / Math.max(mat.widthMm, mat.lengthMm))
  return { width: Math.round(mat.widthMm * k), height: Math.round(mat.lengthMm * k) }
}
