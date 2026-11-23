import { describe, expect, it } from 'vitest'
import { isWalled, matBounds, matSize } from './scene'

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
})
