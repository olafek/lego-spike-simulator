// Internal simulation units: millimetres, radians, seconds. Everything shown to children is converted here.

export const MM_PER_CM = 10
export const MM_PER_INCH = 25.4
export const DEG = Math.PI / 180

export type DisplayUnit = 'cm' | 'in'

export function mmToDisplay(mm: number, unit: DisplayUnit): number {
  return unit === 'cm' ? mm / MM_PER_CM : mm / MM_PER_INCH
}

export function displayToMm(value: number, unit: DisplayUnit): number {
  return unit === 'cm' ? value * MM_PER_CM : value * MM_PER_INCH
}

export function round(value: number, decimals = 1): number {
  const f = 10 ** decimals
  const r = Math.round(value * f) / f
  return Object.is(r, -0) ? 0 : r
}

export function formatLength(mm: number, unit: DisplayUnit, decimals = 1): string {
  return `${round(mmToDisplay(mm, unit), decimals)} ${unit}`
}

export function formatDegrees(rad: number, decimals = 0): string {
  return `${round(rad / DEG, decimals)}°`
}

/** Wrap an angle in degrees to (-180, 180], the range the SPIKE hub reports for yaw. */
export function wrapDeg180(deg: number): number {
  let d = ((deg + 180) % 360 + 360) % 360 - 180
  if (d === -180) d = 180
  return d
}

export interface GridChoice {
  /** major line spacing in mm */
  majorMm: number
  /** minor subdivision spacing in mm */
  minorMm: number
  label: string
}

/** Grid sizes offered to the child. cm is the persistent default; inches are optional. */
export function gridChoices(unit: DisplayUnit): GridChoice[] {
  if (unit === 'cm') {
    return [
      { majorMm: 50, minorMm: 10, label: '5 cm' },
      { majorMm: 100, minorMm: 10, label: '10 cm' },
      { majorMm: 200, minorMm: 50, label: '20 cm' },
    ]
  }
  return [
    { majorMm: 2 * MM_PER_INCH, minorMm: MM_PER_INCH / 2, label: '2 in' },
    { majorMm: 4 * MM_PER_INCH, minorMm: MM_PER_INCH, label: '4 in' },
    { majorMm: 12 * MM_PER_INCH, minorMm: 2 * MM_PER_INCH, label: '12 in' },
  ]
}

export function defaultGrid(unit: DisplayUnit): GridChoice {
  return gridChoices(unit)[1]
}
