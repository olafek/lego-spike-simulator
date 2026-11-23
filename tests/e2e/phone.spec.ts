import { expect, test } from '@playwright/test'
import { login, openSample } from './helpers'

// Runs in the iphone-portrait project (390 × 844, touch).

test('simulator: playback is one row with a speed button that cycles', async ({ page }) => {
  await login(page)
  await openSample(page, 'seed-pod')
  const play = (await page.getByTestId('play').boundingBox())!
  for (const id of ['reset', 'step-prev', 'step-next', 'speed-cycle']) {
    const b = (await page.getByTestId(id).boundingBox())!
    expect(Math.abs(b.y + b.height / 2 - (play.y + play.height / 2)), `${id} is on the play row`).toBeLessThan(10)
  }
  await expect(page.getByTestId('speed-1')).toHaveCount(0)
  const speed = page.getByTestId('speed-cycle')
  await expect(speed).toHaveText('1×')
  await speed.tap()
  await expect(speed).toHaveText('2×')
  await speed.tap()
  await expect(speed).toHaveText('4×')
  await speed.tap()
  await expect(speed).toHaveText('0.25×')
})

test('turning into a wide screen brings back the full controls', async ({ page }) => {
  await login(page)
  await openSample(page, 'seed-pod')
  await page.getByTestId('step-next').tap()
  const before = await page.getByTestId('timeline').inputValue()
  expect(Number(before)).toBeGreaterThan(0)
  await expect(page.getByTestId('speed-cycle')).toBeVisible()
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.getByTestId('speed-1')).toBeVisible()
  await expect(page.getByTestId('speed-cycle')).toHaveCount(0)
  await expect(page.getByTestId('timeline')).toHaveValue(before)
})

test('lab: one top row, with the project and navigation behind ☰', async ({ page }) => {
  await login(page)
  await openSample(page, 'seed-pod')
  await expect(page.getByTestId('nav-projects')).toHaveCount(0)
  const menu = page.getByTestId('lab-menu')
  const m = (await menu.boundingBox())!
  const s = (await page.getByTestId('step-simulate').boundingBox())!
  expect(Math.abs(m.y - s.y)).toBeLessThan(10)
  expect(m.y + m.height).toBeLessThan(80)
  await menu.tap()
  await expect(page.getByTestId('lab-menu-panel')).toBeVisible()
  await expect(page.getByTestId('project-name')).toHaveValue('Big seed pod')
  expect((await page.getByTestId('project-name').boundingBox())!.width).toBeGreaterThanOrEqual(250)
  await expect(page.getByTestId('save-state')).toContainText('saved')
  await page.getByTestId('nav-projects').tap()
  await expect(page).toHaveURL(/\/projects$/)
})

test('lab: ☰ closes on Escape and on a tap outside', async ({ page }) => {
  await login(page)
  await openSample(page, 'seed-pod')
  await page.getByTestId('lab-menu').tap()
  await expect(page.getByTestId('lab-menu-panel')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('lab-menu-panel')).toHaveCount(0)
  await page.getByTestId('lab-menu').tap()
  await page.getByTestId('goal-banner').tap()
  await expect(page.getByTestId('lab-menu-panel')).toHaveCount(0)
})

test('lab: a failed save shows on the top row without opening ☰', async ({ page }) => {
  await login(page)
  await openSample(page, 'seed-pod')
  await page.route('**/api/projects/*', (r) => (r.request().method() === 'PUT' ? r.abort() : r.continue()))
  await page.getByTestId('speed-cycle').tap()
  await expect(page.getByTestId('save-warning')).toBeInViewport({ timeout: 5_000 })
})

test('demo on a phone: ☰ shows Demo and has no Leave button', async ({ page }) => {
  await page.goto('/demo')
  await page.getByTestId('sample-seed-pod').tap()
  await expect(page.getByTestId('simulate-step')).toBeVisible()
  await page.getByTestId('lab-menu').tap()
  await expect(page.getByTestId('demo-chip')).toBeVisible()
  await expect(page.getByTestId('logout')).toHaveCount(0)
})

test('simulator: the view gets almost half the screen', async ({ page }) => {
  await login(page)
  await openSample(page, 'seed-pod')
  const canvas = (await page.getByTestId('sim-canvas').boundingBox())!
  expect(canvas.height).toBeGreaterThanOrEqual(380) // 45% of 844
  expect(canvas.width).toBeGreaterThanOrEqual(350)
  for (const id of ['play', 'step-next', 'readout-moved', 'camera-menu']) await expect(page.getByTestId(id)).toBeInViewport()
  const blocks = (await page.getByRole('complementary', { name: 'Program and results' }).boundingBox())!
  expect(844 - blocks.y, 'blocks stay visible under the stage').toBeGreaterThanOrEqual(160)
})

test('simulator: readout details and camera menu', async ({ page }) => {
  await login(page)
  await openSample(page, 'seed-pod')
  await expect(page.getByTestId('move-readout')).toHaveCount(0)
  await page.getByTestId('readout-details').tap()
  await expect(page.getByTestId('move-readout')).toContainText('Asked: 20 cm')
  await page.getByTestId('readout-details').tap()
  await expect(page.getByTestId('move-readout')).toHaveCount(0)

  await expect(page.getByTestId('camera-orbit')).toHaveCount(0)
  await page.getByTestId('camera-menu').tap()
  await page.getByTestId('camera-orbit').tap()
  await expect(page.getByTestId('camera-orbit')).toHaveCount(0)
  await expect(page.getByTestId('camera-menu')).toHaveAttribute('aria-label', /3D/)
  await page.getByTestId('camera-menu').tap()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('camera-top')).toHaveCount(0)
})

test('simulator: warnings stay visible with long inch readouts', async ({ page }) => {
  await login(page)
  await openSample(page, 'seed-pod')
  const url = page.url()
  await page.getByTestId('lab-menu').tap()
  await page.getByTestId('nav-settings').tap()
  // leaving the lab saves too, so wait for the save that carries the new calibration
  const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && !!r.request().postData()?.includes('"calibration":"hardware"'))
  await page.getByTestId('calibration-hardware').tap()
  await saved
  await page.goto(url)
  await expect(page.getByTestId('simulate-step')).toBeVisible()
  await page.getByTestId('view-options').tap()
  await page.getByTestId('unit-in').tap()
  await expect(page.getByTestId('estimated-chip')).toBeInViewport()
  await expect(page.getByTestId('estimated-chip')).toHaveText('≈ estimated')
  await expect(page.getByTestId('readout-position')).toContainText(' in')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

test('robot step: the badges on a card do not overlap', async ({ page }) => {
  await login(page)
  await page.getByTestId('sample-screenshot').tap()
  await expect(page.getByTestId('program-panel')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('step-robot').tap()
  const a = (await page.getByTestId('robot-suggested').boundingBox())!
  const b = (await page.getByTestId('robot-state').boundingBox())!
  const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  expect(overlap).toBe(false)
})
