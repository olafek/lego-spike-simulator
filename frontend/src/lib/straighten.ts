// Turning a photo of a table into a top-down picture of its mat, in the browser.
// The original photo never leaves the device: only the straightened mat rectangle is uploaded.

import { solveHomography, type Quad } from '@/core/homography'

export const PHOTO_REFUSED = 'This kind of photo cannot be opened here. Choose it on the iPad or iPhone, or save it as a JPEG first.'

/** Big enough for a sharp mat, small enough for a phone's memory. */
const WORK_MAX = 2600

/** Decode a photo into a canvas (shrunk if huge). Rejects with a friendly message when the browser cannot open it. */
export async function openPhoto(file: Blob): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(PHOTO_REFUSED)
  }
  const k = Math.min(1, WORK_MAX / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * k))
  canvas.height = Math.max(1, Math.round(bitmap.height * k))
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas
}

/**
 * Straighten: `corners` are the mat's corners in the photo (pixels of `photo`, TL, TR, BR, BL; they may lie
 * outside it). Every pixel of the result is looked up in the photo; parts the photo does not show get `fill`.
 */
export function straightenPhoto(photo: HTMLCanvasElement, corners: Quad, size: { width: number; height: number }, fill: [number, number, number]): Promise<Blob> {
  const { width, height } = size
  const h = solveHomography(
    [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    corners,
  )
  if (!h) return Promise.reject(new Error('The four corners must make a four-sided shape.'))

  const sw = photo.width
  const sh = photo.height
  const src = photo.getContext('2d')!.getImageData(0, 0, sw, sh).data
  const out = new ImageData(width, height)
  const dst = out.data

  for (let y = 0; y < height; y++) {
    // centre of each output pixel
    const py = y + 0.5
    for (let x = 0; x < width; x++) {
      const px = x + 0.5
      const w = h[6] * px + h[7] * py + h[8]
      const sx = (h[0] * px + h[1] * py + h[2]) / w - 0.5
      const sy = (h[3] * px + h[4] * py + h[5]) / w - 0.5
      const o = (y * width + x) * 4
      dst[o + 3] = 255
      if (!(sx >= 0 && sy >= 0 && sx <= sw - 1 && sy <= sh - 1)) {
        dst[o] = fill[0]
        dst[o + 1] = fill[1]
        dst[o + 2] = fill[2]
        continue
      }
      // bilinear blend of the four nearest photo pixels
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const x1 = Math.min(sw - 1, x0 + 1)
      const y1 = Math.min(sh - 1, y0 + 1)
      const fx = sx - x0
      const fy = sy - y0
      const a = (y0 * sw + x0) * 4
      const b = (y0 * sw + x1) * 4
      const c = (y1 * sw + x0) * 4
      const d = (y1 * sw + x1) * 4
      for (let ch = 0; ch < 3; ch++) {
        const top = src[a + ch] + (src[b + ch] - src[a + ch]) * fx
        const bottom = src[c + ch] + (src[d + ch] - src[c + ch]) * fx
        dst[o + ch] = top + (bottom - top) * fy
      }
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.putImageData(out, 0, 0)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not save the picture.'))), 'image/jpeg', 0.9))
}
