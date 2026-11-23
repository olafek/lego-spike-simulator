import { describe, expect, it } from 'vitest'
import { nextSpeed } from './speed'

describe('nextSpeed', () => {
  it('steps through the speeds in order and wraps around', () => {
    expect(nextSpeed(1)).toBe(2)
    expect(nextSpeed(2)).toBe(4)
    expect(nextSpeed(4)).toBe(0.25)
    expect(nextSpeed(0.25)).toBe(0.5)
    expect(nextSpeed(0.5)).toBe(1)
  })
  it('falls back to 1× for a speed that is not in the list', () => {
    expect(nextSpeed(3)).toBe(1)
  })
})
