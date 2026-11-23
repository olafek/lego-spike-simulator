// Draws fixtures/sample-table.png: a photo-like picture of a MADE-UP practice mat lying on a grey floor,
// seen at an angle. It is not any real competition mat. The browser tests straighten it and check that
// the coloured squares land where they should.
//
// The mat is 2362 × 1143 mm. In the picture (1600 × 1200) its corners sit at exactly these fractions:
//   top-left (0.15, 0.20) · top-right (0.85, 0.12) · bottom-right (0.95, 0.85) · bottom-left (0.05, 0.90)
// On the mat: a red 200 mm square on the centre, a blue 200 mm square 400 mm left and 250 mm up from the
// centre, a black guide line with a white edge, and a 100 mm grid.
//
// Usage (in /tests):  npm run table-fixture
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const W = 1600
const H = 1200
const MAT = { w: 2362, h: 1143 }
export const CORNERS = [
  [0.15, 0.2],
  [0.85, 0.12],
  [0.95, 0.85],
  [0.05, 0.9],
]

/** 3×3 matrix taking each `from` corner to the matching `to` corner (same method as src/core/homography.ts). */
function solve(from, to) {
  const m = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i]
    const [X, Y] = to[i]
    m.push([x, y, 1, 0, 0, 0, -X * x, -X * y, X])
    m.push([0, 0, 0, x, y, 1, -Y * x, -Y * y, Y])
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col
    for (let row = col + 1; row < 8; row++) if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row
    ;[m[col], m[pivot]] = [m[pivot], m[col]]
    for (let row = 0; row < 8; row++) {
      if (row === col) continue
      const k = m[row][col] / m[col][col]
      for (let j = col; j < 9; j++) m[row][j] -= k * m[col][j]
    }
  }
  return [...m.map((row, i) => row[8] / row[i]), 1]
}

const photoCorners = CORNERS.map(([fx, fy]) => [fx * W, fy * H])
const matCorners = [
  [0, 0],
  [MAT.w, 0],
  [MAT.w, MAT.h],
  [0, MAT.h],
]
const toMat = solve(photoCorners, matCorners)

/** Colour of the made-up mat at a point (mm from its top-left corner). */
function matColour(x, y) {
  const cx = MAT.w / 2
  const cy = MAT.h / 2
  if (Math.abs(x - cx) <= 100 && Math.abs(y - cy) <= 100) return [220, 40, 40] // red square on the centre
  if (Math.abs(x - (cx - 400)) <= 100 && Math.abs(y - (cy - 250)) <= 100) return [40, 80, 220] // blue square
  if (x >= 1500 && x <= 2100 && Math.abs(y - 850) <= 12) return [20, 20, 24] // black guide line …
  if (x >= 1480 && x <= 2120 && Math.abs(y - 850) <= 32) return [250, 250, 250] // … with a white edge
  if (x < 14 || y < 14 || x > MAT.w - 14 || y > MAT.h - 14) return [60, 110, 70] // printed border
  if (x % 100 < 5 || y % 100 < 5) return [176, 204, 160] // 100 mm grid
  return [226, 240, 212]
}

const png = new PNG({ width: W, height: H })
for (let py = 0; py < H; py++) {
  for (let px = 0; px < W; px++) {
    const w = toMat[6] * px + toMat[7] * py + toMat[8]
    const x = (toMat[0] * px + toMat[1] * py + toMat[2]) / w
    const y = (toMat[3] * px + toMat[4] * py + toMat[5]) / w
    const inside = x >= 0 && y >= 0 && x <= MAT.w && y <= MAT.h
    const [r, g, b] = inside ? matColour(x, y) : [126 + ((px * 7 + py * 13) % 9), 128 + ((px * 5 + py * 3) % 9), 134]
    const i = (py * W + px) * 4
    png.data[i] = r
    png.data[i + 1] = g
    png.data[i + 2] = b
    png.data[i + 3] = 255
  }
}

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/sample-table.png')
writeFileSync(out, PNG.sync.write(png))
console.log(`wrote ${out} (${W}×${H}); mat corners at`, CORNERS.map(([x, y]) => `(${x}, ${y})`).join(' '))
