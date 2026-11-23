import { expect, test } from '@playwright/test'
import { addTablePicture, login, noSidewaysScroll, TABLE_PHOTO, touchTargets } from './helpers'

// Runs on both iPads and the iPhone: making a table must fit and stay touch friendly.

test('making a table fits the screen', async ({ page }) => {
  await login(page)
  await page.getByTestId('new-table').tap()
  await expect(page.getByTestId('mat-picture-panel')).toBeVisible()
  await noSidewaysScroll(page)
  await touchTargets(page)

  // the corner step: all four dots and the buttons are on the screen
  await page.getByTestId('mat-picture-choose').setInputFiles(TABLE_PHOTO)
  await expect(page.getByTestId('corner-photo')).toBeVisible()
  for (const id of ['corner-0', 'corner-1', 'corner-2', 'corner-3', 'mat-picture-next', 'mat-picture-cancel']) await expect(page.getByTestId(id)).toBeInViewport()
  await noSidewaysScroll(page)
  await touchTargets(page)
  await page.getByTestId('mat-picture-cancel').tap()

  await addTablePicture(page)
  await noSidewaysScroll(page)
  await touchTargets(page)
})

test('the tables on the home screen and the table picker fit', async ({ page }) => {
  await login(page)
  await expect(page.getByTestId('tables-section')).toBeVisible()
  await noSidewaysScroll(page)
  await touchTargets(page)
  await page.getByTestId('sample-drive-30').tap()
  await expect(page.getByTestId('simulate-step')).toBeVisible()
  await page.getByTestId('step-mission').tap()
  await page.getByTestId('use-table').tap()
  await expect(page.getByTestId('table-picker-list')).toBeVisible()
  await noSidewaysScroll(page)
  await touchTargets(page)
})
