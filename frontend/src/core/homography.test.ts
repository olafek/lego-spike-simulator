import { describe, expect, it } from 'vitest'
import { isProperQuad, mapPoint, matPictureSize, solveHomography, type Quad } from './homography'

const rect = (w: number, h: number): Quad => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
]
// an angled photo of a mat: far edge shorter than the near edge
const skewed: Quad = [
  { x: 240, y: 240 },
  { x: 1360, y: 144 },
  { x: 1520, y: 1020 },
  { x: 80, y: 1080 },
]

describe('straightening maths', () => {
  it('maps a rectangle onto itself', () => {
    const h = solveHomography(rect(100, 50), rect(100, 50))!
    const p = mapPoint(h, { x: 37, y: 12 })
    expect(p.x).toBeCloseTo(37, 9)
    expect(p.y).toBeCloseTo(12, 9)
  })

  it('maps the four corners exactly', () => {
    const mat = rect(2362, 1143)
    const h = solveHomography(mat, skewed)!
    mat.forEach((corner, i) => {
      const p = mapPoint(h, corner)
      expect(p.x).toBeCloseTo(skewed[i].x, 6)
      expect(p.y).toBeCloseTo(skewed[i].y, 6)
    })
  })

  it('puts the crossing of the diagonals on the centre of the rectangle', () => {
    // the diagonals of the photographed mat cross where the diagonals of the real mat cross: its centre
    const [a, b, c, d] = skewed
    const t = ((d.x - a.x) * (b.y - d.y) - (d.y - a.y) * (b.x - d.x)) / ((c.x - a.x) * (b.y - d.y) - (c.y - a.y) * (b.x - d.x))
    const cross = { x: a.x + t * (c.x - a.x), y: a.y + t * (c.y - a.y) }
    const p = mapPoint(solveHomography(skewed, rect(2362, 1143))!, cross)
    expect(p.x).toBeCloseTo(1181, 6)
    expect(p.y).toBeCloseTo(571.5, 6)
  })

  it('maps points outside the source image', () => {
    const cutOff: Quad = [skewed[0], skewed[1], skewed[2], { x: -200, y: 1300 }]
    expect(isProperQuad(cutOff)).toBe(true)
    const h = solveHomography(rect(2362, 1143), cutOff)!
    const p = mapPoint(h, { x: 0, y: 1143 })
    expect(p.x).toBeCloseTo(-200, 6)
    expect(p.y).toBeCloseTo(1300, 6)
  })

  it('refuses a crossed quad and a collapsed quad', () => {
    expect(isProperQuad(skewed)).toBe(true)
    expect(isProperQuad([skewed[0], skewed[2], skewed[1], skewed[3]])).toBe(false) // two corners swapped: an hourglass
    expect(isProperQuad([skewed[0], skewed[0], skewed[2], skewed[3]])).toBe(false) // two corners on one spot
    expect(isProperQuad([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }])).toBe(false) // a line
    expect(solveHomography(rect(10, 10), [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }])).toBeNull()
  })

  it('matPictureSize caps the long side', () => {
    const mat = { widthMm: 2362, lengthMm: 1143 }
    expect(matPictureSize(mat, 4096)).toEqual({ width: 2362, height: 1143 })
    expect(matPictureSize(mat, 1000)).toEqual({ width: 1000, height: 484 })
    expect(matPictureSize({ widthMm: 1100, lengthMm: 2000 }, 500)).toEqual({ width: 275, height: 500 })
  })
})
