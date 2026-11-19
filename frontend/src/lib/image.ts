// Client-side image helpers: rotate, crop and shrink screenshots before they are uploaded.

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']
export const ACCEPT_ATTR = 'image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif'

export function looksLikeImage(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true
  // iOS sometimes reports an empty type for HEIC files
  return /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name)
}

function load(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('This picture could not be opened.'))
    }
    img.src = url
  })
}

function toBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the picture.'))), type, 0.92))
}

/** Rotate by a multiple of 90° (positive = clockwise). */
export async function rotateImage(blob: Blob, quarterTurns: number): Promise<Blob> {
  const img = await load(blob)
  const q = ((quarterTurns % 4) + 4) % 4
  const canvas = document.createElement('canvas')
  canvas.width = q % 2 === 0 ? img.naturalWidth : img.naturalHeight
  canvas.height = q % 2 === 0 ? img.naturalHeight : img.naturalWidth
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((q * Math.PI) / 2)
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
  return toBlob(canvas)
}

/** Crop to a rectangle given as fractions (0..1) of the picture. */
export async function cropImage(blob: Blob, rect: { x: number; y: number; w: number; h: number }): Promise<Blob> {
  const img = await load(blob)
  const sx = Math.round(rect.x * img.naturalWidth)
  const sy = Math.round(rect.y * img.naturalHeight)
  const sw = Math.max(16, Math.round(rect.w * img.naturalWidth))
  const sh = Math.max(16, Math.round(rect.h * img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
  return toBlob(canvas)
}

/**
 * Shrink very large pictures before upload (faster on school Wi-Fi). Files the browser cannot
 * decode (for example HEIC on desktop) are sent unchanged so the server can try to convert them.
 */
export async function prepareForUpload(file: File, maxDimension: number): Promise<{ blob: Blob; name: string }> {
  try {
    const img = await load(file)
    const biggest = Math.max(img.naturalWidth, img.naturalHeight)
    if (biggest <= maxDimension && file.size < 3_000_000) return { blob: file, name: file.name }
    const k = Math.min(1, maxDimension / biggest)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * k)
    canvas.height = Math.round(img.naturalHeight * k)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await toBlob(canvas, 'image/jpeg')
    return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' }
  } catch {
    return { blob: file, name: file.name }
  }
}

export async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) throw new Error('The picture could not be loaded.')
  return res.blob()
}
