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
