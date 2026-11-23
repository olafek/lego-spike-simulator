import { expect, test, type Page } from '@playwright/test'
import { addTablePicture, dragCorner, login, matPixel, openSample, TABLE_CORNERS, TABLE_PHOTO } from './helpers'

// A photo of a table becomes the floor. The photo here is a generated picture of a made-up mat.

async function openMatStep(page: Page) {
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

// ---- tables: made once, used by many programs ---------------------------------------------------

/** From Home: make a table, name it, and wait until it is saved. Leaves the page on the Mat step of the table. */
async function makeTable(page: Page, name: string) {
  await page.goto('/')
  await page.getByTestId('new-table').click()
  await expect(page.getByTestId('mat-picture-panel')).toBeVisible()
  await page.getByTestId('project-name').fill(name)
  await page.getByTestId('project-name').press('Tab')
  await expect(page.getByTestId('save-state')).toContainText('saved')
}

async function programOnMatStep(page: Page, sample: string) {
  await page.goto('/')
  await openSample(page, sample)
  await page.getByTestId('step-mission').click()
  await expect(page.getByTestId('mission-editor')).toBeVisible()
}

test('a table is made once and a program is put on it', async ({ page }) => {
  await login(page)
  await makeTable(page, 'Practice table')
  await expect(page.getByTestId('step-check')).toHaveCount(0) // a table has no program screenshot to check
  await expect(page.getByTestId('mat-competition')).toHaveAttribute('aria-pressed', 'true')
  await addTablePicture(page)
  await page.getByTestId('add-obstacle').click()
  await expect(page.getByTestId('obj-obstacle')).toHaveCount(1)
  await expect(page.getByTestId('save-state')).toContainText('saved')

  // it shows on the home screen
  await page.goto('/')
  await expect(page.getByTestId('table-card').filter({ hasText: 'Practice table' })).toBeVisible()

  // a program is put on it
  await programOnMatStep(page, 'drive-30')
  await page.getByTestId('use-table').click()
  await page.getByTestId('table-option').filter({ hasText: 'Practice table' }).click()
  await expect(page.getByTestId('mat-picture')).toBeVisible()
  await expect(page.getByTestId('obj-obstacle')).toHaveCount(1)
  await expect(page.getByTestId('mat-competition')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('mission-done').click()
  await expect(page.getByTestId('assumptions')).toContainText('straightened photo')

  // changing the mat of the program never changes the table
  await page.getByTestId('step-mission').click()
  await page.getByRole('button', { name: 'Clear everything' }).click()
  await page.getByRole('button', { name: 'Yes, clear it' }).click()
  await expect(page.getByTestId('obj-obstacle')).toHaveCount(0)
  await expect(page.getByTestId('save-state')).toContainText('saved')
  await page.goto('/')
  await page.getByTestId('table-card').filter({ hasText: 'Practice table' }).click()
  await expect(page.getByTestId('obj-obstacle')).toHaveCount(1)
  await expect(page.getByTestId('mat-picture')).toBeVisible()
})

test('using a table asks before replacing a mat that is not empty', async ({ page }) => {
  await login(page)
  await makeTable(page, 'Table for asking')
  await programOnMatStep(page, 'seed-pod') // this sample already has things on its mat
  await page.getByTestId('use-table').click()
  await page.getByTestId('table-option').filter({ hasText: 'Table for asking' }).click()
  await expect(page.getByTestId('use-table-confirm')).toBeVisible()
  await expect(page.getByTestId('obj-seed_pod_large')).toHaveCount(1) // nothing changed yet
  await page.getByTestId('use-table-confirm').click()
  await expect(page.getByTestId('obj-seed_pod_large')).toHaveCount(0)
  await expect(page.getByTestId('mat-competition')).toHaveAttribute('aria-pressed', 'true')
})

test('the table used last is offered first', async ({ page }) => {
  await login(page)
  await makeTable(page, 'Table Alpha')
  await makeTable(page, 'Table Beta')
  await makeTable(page, 'Table Gamma')
  await programOnMatStep(page, 'drive-30')
  await page.getByTestId('use-table').click()
  await page.getByTestId('table-option').filter({ hasText: 'Table Alpha' }).click()
  await expect(page.getByTestId('mat-competition')).toHaveAttribute('aria-pressed', 'true')

  await programOnMatStep(page, 'turn-90')
  await page.getByTestId('use-table').click()
  await expect(page.getByTestId('table-option').first()).toContainText('Table Alpha')
})
