import { describe, expect, it } from 'vitest'
import { chooseScaleBar, decimateTrail, distanceMarks, fitOrtho, gridLabel, gridLines, isMultiple, labelStep, minorVisible, trailCountAt } from './scale'

describe('scale bar', () => {
  it('picks the largest round cm length that fits and its pixel length is exact', () => {
    const bar = chooseScaleBar(0.5, 'cm') // 0.5 px per mm => 10 cm = 50 px, 20 cm = 100 px, 50 cm = 250 px
    expect(bar.label).toBe('20 cm')
    expect(bar.lengthMm).toBe(200)
    expect(bar.px).toBe(100)
    expect(bar.px / bar.lengthMm).toBe(0.5)
  })

  it('uses inch steps in inch mode', () => {
    const bar = chooseScaleBar(1, 'in')
    expect(bar.label).toBe('2 in')
    expect(bar.lengthMm).toBeCloseTo(50.8, 9)
  })

  it('never returns a zero-length bar when zoomed far in', () => {
    const bar = chooseScaleBar(40, 'cm')
    expect(bar.label).toBe('1 cm')
    expect(bar.px).toBe(400)
  })
})

describe('grid', () => {
  it('30 cm spans exactly three 10 cm major lines', () => {
    const lines = gridLines(0, 300, 100)
    expect(lines).toEqual([0, 100, 200, 300])
    expect(lines.length - 1).toBe(3)
  })

  it('lines are exact multiples, including negatives and non-aligned bounds', () => {
    expect(gridLines(-250, 250, 100)).toEqual([-200, -100, 0, 100, 200])
    expect(gridLines(-1000, 1000, 10).length).toBe(201)
  })

  it('knows which minor lines sit under major lines', () => {
    expect(isMultiple(200, 100)).toBe(true)
    expect(isMultiple(210, 100)).toBe(false)
    expect(isMultiple(4 * 25.4, 2 * 25.4)).toBe(true)
  })

  it('labels use the display unit', () => {
    expect(gridLabel(300, 'cm')).toBe('30')
    expect(gridLabel(-50, 'cm')).toBe('-5')
    expect(gridLabel(101.6, 'in')).toBe('4')
  })

  it('thins labels out when zoomed far and hides tiny subdivisions', () => {
    expect(labelStep(60)).toBe(1)
    expect(labelStep(20)).toBe(2)
    expect(labelStep(8)).toBe(5)
    expect(labelStep(0)).toBe(50)
    expect(minorVisible(6)).toBe(true)
    expect(minorVisible(3)).toBe(false)
  })
})

describe('trail', () => {
  const frames = Array.from({ length: 301 }, (_, i) => ({ x: 0, y: i, path: i }))

  it('keeps the first and last points and spaces the rest', () => {
    const pts = decimateTrail(frames, 4)
    expect(pts[0]).toEqual({ x: 0, y: 0, frame: 0 })
    expect(pts[pts.length - 1].frame).toBe(300)
    expect(pts.length).toBe(76)
  })

  it('a robot that never moves yields a single point', () => {
    expect(decimateTrail([{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }])).toHaveLength(1)
  })

  it('counts the points reached at a frame', () => {
    const pts = decimateTrail(frames, 4)
    expect(trailCountAt(pts, 0)).toBe(1)
    expect(trailCountAt(pts, 7)).toBe(2)
    expect(trailCountAt(pts, 300)).toBe(pts.length)
  })

  it('places a distance mark every 10 cm of travelled path', () => {
    const marks = distanceMarks(frames, 100)
    expect(marks.map((m) => m.pathMm)).toEqual([100, 200, 300])
    expect(marks[0].y).toBeCloseTo(100, 9)
    expect(marks[2].frame).toBe(300)
  })
})

describe('fit', () => {
  it('fits bounds with a margin and never zooms in on a tiny run', () => {
    const f = fitOrtho({ minX: -1000, maxX: 1000, minY: 0, maxY: 500 }, 1112, 600)
    expect(f.cx).toBe(0)
    expect(f.cy).toBe(250)
    expect(f.pxPerMm).toBeCloseTo(0.5, 9)
    const tiny = fitOrtho({ minX: 0, maxX: 10, minY: 0, maxY: 10 }, 812, 812)
    expect(tiny.pxPerMm).toBeCloseTo(1, 9)
  })
})
