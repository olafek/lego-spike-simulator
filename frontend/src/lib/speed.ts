// Playback speeds, slowest first.

export const SPEEDS: readonly number[] = [0.25, 0.5, 1, 2, 4]

/** The speed after `current`, wrapping from the fastest back to the slowest. Unknown speeds go to 1×. */
export function nextSpeed(current: number): number {
  const i = SPEEDS.indexOf(current)
  return i === -1 ? 1 : SPEEDS[(i + 1) % SPEEDS.length]
}
