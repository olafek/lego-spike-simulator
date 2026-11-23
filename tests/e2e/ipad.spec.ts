import { expect, test } from '@playwright/test'
import { login, noSidewaysScroll, openSample, touchTargets } from './helpers'

// Runs in the ipad-landscape and ipad-portrait projects (and desktop).

test('home: the upload action dominates and fits the screen', async ({ page }) => {
  await login(page)
  const hero = page.getByTestId('pick-button')
  await expect(hero).toBeVisible()
  const box = (await hero.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(60)
  expect(box.y + box.height).toBeLessThan(page.viewportSize()!.height) // above the fold
  await expect(page.getByTestId('sample-screenshot')).toBeVisible()
  await noSidewaysScroll(page)
  await touchTargets(page)
})

test('simulator: big controls, visible stage, no sideways scrolling', async ({ page }, info) => {
  await login(page)
  await openSample(page, 'seed-pod')
  const canvas = page.getByTestId('sim-canvas')
  await expect(canvas).toBeVisible()
  const stage = (await canvas.boundingBox())!
  const vp = page.viewportSize()!
  expect(stage.width).toBeGreaterThan(vp.width * 0.5)
  expect(stage.height).toBeGreaterThan(vp.height * 0.3)
  await expect(page.getByTestId('play')).toBeInViewport()
  await expect(page.getByTestId('step-next')).toBeInViewport()
  await expect(page.getByTestId('readout-moved')).toBeInViewport()
  expect((await page.getByTestId('play').boundingBox())!.height).toBeGreaterThanOrEqual(60)
  await noSidewaysScroll(page)
  await touchTargets(page)

  // works by touch alone (no hover, no keyboard)
  await page.getByTestId('play').tap()
  await expect(page.getByTestId('run-summary')).toBeVisible({ timeout: 30_000 })
  await info.attach(`simulator-${info.project.name}`, { body: await page.screenshot(), contentType: 'image/png' })
})

test('check, robot and mat steps fit and stay touch friendly', async ({ page }) => {
  await login(page)
  await page.getByTestId('sample-screenshot').tap()
  await expect(page.getByTestId('program-panel')).toBeVisible({ timeout: 30_000 })
  await noSidewaysScroll(page)
  await touchTargets(page)
  await page.getByTestId('step-robot').tap()
  await expect(page.getByTestId('robot-step')).toBeVisible()
  await noSidewaysScroll(page)
  await touchTargets(page)
  await page.getByTestId('step-mission').tap()
  await expect(page.getByTestId('mission-editor')).toBeVisible()
  await noSidewaysScroll(page)
  await touchTargets(page)
})
