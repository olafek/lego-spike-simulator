// "On this iPad" project list. The lab password is shared, so this is a convenience, not privacy:
// anyone with the password can open any project they have the link to.

const KEY = 'spikelab.recent'

export function recentIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function rememberProject(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([id, ...recentIds().filter((x) => x !== id)].slice(0, 30)))
  } catch {
    /* storage may be unavailable (private mode): the list is optional */
  }
}

export function forgetProject(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(recentIds().filter((x) => x !== id)))
  } catch {
    /* optional */
  }
}
