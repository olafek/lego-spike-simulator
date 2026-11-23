import { expect, test } from '@playwright/test'
import { addTablePicture, dragCorner, login, matPixel, openSample, TABLE_CORNERS, TABLE_PHOTO } from './helpers'

// A photo of a table becomes the floor. The photo here is a generated picture of a made-up mat.

async function openMatStep(page: import('@playwright/test').Page) {
  await login(page)
  await openSample(page, 'drive-30')
  await page.getByTestId('step-mission').click()
  await expect(page.getByTestId('mission-editor')).toBeVisible()
  await page.getByTestId('mat-competition').click()
  await expect(page.getByTestId('mat-picture-panel')).toBeVisible()
}

test('a table photo becomes the floor', async ({ page }) => {
  await openMatStep(page)
  await addTablePicture(page)
  await expect(page.getByTestId('mat-picture-chip')).toContainText('≈')

  // the straightened picture puts the made-up mat's markers where they really are
  const [r, g, b] = await matPixel(page, 0, 0)
  expect(r, 'red square on the centre').toBeGreaterThan(180)
  expect(g).toBeLessThan(90)
  expect(b).toBeLessThan(90)
  const [r2, g2, b2] = await matPixel(page, -400, -250)
  expect(b2, 'blue square 40 cm left and 25 cm up').toBeGreaterThan(180)
  expect(r2).toBeLessThan(90)
  expect(g2).toBeLessThan(120)
  const [r3, g3, b3] = await matPixel(page, 300, 300)
  expect(Math.min(r3, g3, b3), 'plain mat elsewhere').toBeGreaterThan(150)

  // and the simulator says the floor is a photo
  await page.getByTestId('mission-done').click()
  await expect(page.getByTestId('simulate-step')).toBeVisible()
  await expect(page.getByTestId('assumptions')).toContainText('straightened photo')
})

test('a corner can sit outside the photo', async ({ page }) => {
  await openMatStep(page)
  const corners = TABLE_CORNERS.map((c) => [...c]) as [number, number][]
  corners[3] = [-0.04, 0.9] // the bottom-left corner was cut off by the edge of the photo
  await addTablePicture(page, corners)
  const [r, g, b] = await matPixel(page, 0, 300)
  expect(Math.min(r, g, b)).toBeGreaterThan(120)
})

test('the mat kind is locked while a picture is on it', async ({ page }) => {
  await openMatStep(page)
  await expect(page.getByTestId('mat-open')).toBeEnabled()
  await addTablePicture(page)
  await expect(page.getByTestId('mat-open')).toBeDisabled()
  await expect(page.getByTestId('mat-classroom')).toBeDisabled()
  await expect(page.getByTestId('mission-editor')).toContainText('Remove the picture to change the mat')

  await page.getByTestId('mat-picture-remove').click()
  await expect(page.getByTestId('mat-picture')).toHaveCount(0)
  await expect(page.getByTestId('mat-open')).toBeEnabled()
})

test('crossed corners cannot be used', async ({ page }) => {
  await openMatStep(page)
  await page.getByTestId('mat-picture-choose').setInputFiles(TABLE_PHOTO)
  await expect(page.getByTestId('corner-photo')).toBeVisible()
  await dragCorner(page, 0, 0.9, 0.9) // top-left dragged past the bottom-right: an hourglass
  await expect(page.getByTestId('mat-picture-next')).toBeDisabled()
  await expect(page.getByTestId('mat-picture-panel')).toContainText('four corners')
})

test('a photo the browser cannot open is refused', async ({ page }) => {
  await openMatStep(page)
  const uploads: string[] = []
  page.on('request', (r) => r.url().includes('/mat-image') && uploads.push(r.url()))
  await page.getByTestId('mat-picture-choose').setInputFiles({ name: 'photo.heic', mimeType: 'image/heic', buffer: Buffer.from('this is not a picture') })
  await expect(page.getByTestId('mat-picture-error')).toContainText('cannot be opened here')
  await expect(page.getByTestId('corner-photo')).toHaveCount(0)
  expect(uploads).toEqual([])
})
