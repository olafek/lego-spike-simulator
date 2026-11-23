import { expect, type Page } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { E2E_PASSWORD } from '../playwright.config'

export const FIXTURE_PNG = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/sample-program.png')

export async function login(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByTestId('gate')).toBeVisible()
  await page.getByTestId('gate-password').fill(E2E_PASSWORD)
  await page.getByTestId('gate-submit').click()
  await expect(page.getByTestId('upload-zone')).toBeVisible()
}

/** Play the current program at 4× and wait until the run has finished. */
export async function playToEnd(page: Page): Promise<void> {
  await page.getByTestId('speed-4').click()
  await page.getByTestId('play').click()
  await expect(page.getByTestId('run-summary')).toBeVisible({ timeout: 30_000 })
}

export async function openSample(page: Page, id: string): Promise<void> {
  await page.getByTestId(`sample-${id}`).click()
  await expect(page.getByTestId('simulate-step')).toBeVisible()
}

/** The first number input of the first block of that kind in the program panel. */
export function amountInput(page: Page, op = 'move_for') {
  return page.getByTestId(`block-${op}`).first().getByTestId('param-amount')
}

// ---- tables -------------------------------------------------------------------------------------

/** A generated picture of a made-up mat seen at an angle (see tests/make-table-fixture.mjs). */
export const TABLE_PHOTO = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/sample-table.png')
/** Where the mat's corners are in that picture, as fractions of its width and height (TL, TR, BR, BL). */
/** The same picture as an iPhone would save it (HEIC). Made from the PNG with pillow-heif. */
export const TABLE_PHOTO_HEIC = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/sample-table.heic')
export const TABLE_CORNERS: [number, number][] = [
  [0.15, 0.2],
  [0.85, 0.12],
  [0.95, 0.85],
  [0.05, 0.9],
]

/** Drag corner handle `i` to a spot given as a fraction of the photo (may be outside 0…1). */
export async function dragCorner(page: Page, i: number, fx: number, fy: number): Promise<void> {
  const photo = (await page.getByTestId('corner-photo').boundingBox())!
  const handle = (await page.getByTestId(`corner-${i}`).boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(photo.x + fx * photo.width, photo.y + fy * photo.height, { steps: 5 })
  await page.mouse.up()
}

/** In the Mat step: choose the test photo, mark the corners, and use the straightened picture. */
export async function addTablePicture(page: Page, corners: [number, number][] = TABLE_CORNERS): Promise<void> {
  await page.getByTestId('mat-picture-choose').setInputFiles(TABLE_PHOTO)
  await expect(page.getByTestId('corner-photo')).toBeVisible()
  for (let i = 0; i < 4; i++) await dragCorner(page, i, corners[i][0], corners[i][1])
  await page.getByTestId('mat-picture-next').click()
  await expect(page.getByTestId('mat-picture-preview')).toBeVisible()
  await page.getByTestId('mat-picture-use').click()
  await expect(page.getByTestId('mat-picture')).toBeVisible()
}

/** Colour of the stored mat picture at a spot given in millimetres from the mat's centre (x right, y down). */
export async function matPixel(page: Page, dxMm: number, dyMm: number): Promise<[number, number, number]> {
  const href = await page.getByTestId('mat-picture').getAttribute('href')
  return page.evaluate(
    async ({ href, dxMm, dyMm }) => {
      const bitmap = await createImageBitmap(await (await fetch(href!, { credentials: 'same-origin', cache: 'no-store' })).blob())
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      const k = bitmap.width / 2362
      const d = ctx.getImageData(Math.round(bitmap.width / 2 + dxMm * k), Math.round(bitmap.height / 2 + dyMm * k), 1, 1).data
      return [d[0], d[1], d[2]] as [number, number, number]
    },
    { href, dxMm, dyMm },
  )
}

// ---- layout checks (tablets and phones) ---------------------------------------------------------

export async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'page must not scroll sideways').toBeLessThanOrEqual(1)
}

/** Every visible button must be a comfortable touch target. */
export async function touchTargets(page: Page, min = 44) {
  const small = await page.evaluate((minSize) => {
    const out: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('button, a.btn, [role="radio"], input[type="range"]')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const style = getComputedStyle(el)
      if (style.visibility === "hidden" || style.display === "none") continue
      // layout size, not the drawn size: a button that is being pressed shrinks a little while it animates
      const w = el.offsetWidth || r.width
      const h = el.offsetHeight || r.height
      if (h < minSize - 0.5 || w < minSize - 0.5) out.push(`${el.getAttribute("data-testid") ?? el.textContent?.trim().slice(0, 20)} ${Math.round(w)}×${Math.round(h)}`)
    }
    return out
  }, min)
  expect(small, 'buttons smaller than 44px').toEqual([])
}

// ---- talking to the lab API from a test --------------------------------------------------------

/** Call the lab API from inside the page (same session, with the CSRF token). */
export async function labApi(page: Page, method: string, url: string, body?: unknown): Promise<any> {
  return page.evaluate(
    async ({ method, url, body }) => {
      const token = decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)![1])
      const res = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': token },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return res.json()
    },
    { method, url, body },
  )
}

export const projectId = (page: Page) => page.url().match(/\/p\/([0-9a-f]{32})/)![1]

/**
 * Change the open project behind the scenes and reload it: a quick way to set up a mat, a tool and a program.
 * `edit` gets the project document and changes it in place.
 */
export async function editProject(page: Page, edit: (data: any) => void): Promise<void> {
  const id = projectId(page)
  const project = await labApi(page, 'GET', `/api/projects/${id}`)
  edit(project.data)
  await labApi(page, 'PUT', `/api/projects/${id}`, { data: project.data })
  await page.reload()
}
