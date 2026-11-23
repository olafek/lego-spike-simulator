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
      const bitmap = await createImageBitmap(await (await fetch(href!, { credentials: 'same-origin' })).blob())
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
