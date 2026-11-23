import { describe, expect, it } from 'vitest'
import { isWalled, matBounds, matSize, pictureFitsMat } from './scene'

describe('mats', () => {
  it('gives the competition mat its size and bounds', () => {
    expect(matSize('competition')).toEqual({ widthMm: 2362, lengthMm: 1143 })
    expect(matBounds('competition')).toEqual({ x0: -1181, x1: 1181, y0: -250, y1: 893 })
    expect(matBounds('classroom')).toEqual({ x0: -1000, x1: 1000, y0: -250, y1: 850 })
    expect(matBounds('open')).toBeNull()
    expect(matSize('open')).toBeNull()
    expect(isWalled('competition')).toBe(true)
    expect(isWalled('classroom')).toBe(true)
    expect(isWalled('open')).toBe(false)
  })

  it('knows whether a picture was straightened for a mat', () => {
    expect(pictureFitsMat({ width: 2362, height: 1143 }, 'competition')).toBe(true)
    expect(pictureFitsMat({ width: 1181, height: 572 }, 'competition')).toBe(true) // shrunk, rounded
    expect(pictureFitsMat({ width: 2362, height: 1143 }, 'classroom')).toBe(false) // would be stretched
    expect(pictureFitsMat({ width: 2000, height: 1100 }, 'classroom')).toBe(true)
    expect(pictureFitsMat({ width: 2362, height: 1143 }, 'open')).toBe(false) // the open floor has no picture
  })
})
