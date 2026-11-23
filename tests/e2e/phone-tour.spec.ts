import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { amountInput, login, openSample } from './helpers'

// Visual record of the phone layout (tests/test-results/shots/iphone-portrait), like shots.spec.ts for wider
// screens. Runs in the iphone-portrait project. docs/screenshots/iphone-*.png are copied from here.
test.use({ deviceScaleFactor: 2 })

test('capture the phone screens', async ({ page }, info) => {
  const dir = `test-results/shots/${info.project.name}`
  mkdirSync(dir, { recursive: true })
  const shot = (name: string) => page.screenshot({ path: `${dir}/${name}.png` })

  await login(page)
  await shot('1-home')
  await page.getByTestId('sample-screenshot').tap()
  await expect(page.getByTestId('program-panel')).toBeVisible({ timeout: 30_000 })
  await shot('2-check')

  // 20 cm is not enough …
  await page.goto('/')
  await openSample(page, 'seed-pod')
  await page.getByTestId('play').tap()
  await expect(page.getByTestId('goal-result')).toContainText('🤔', { timeout: 30_000 })
  await page.waitForTimeout(300)
  await page.getByTestId('readout-details').tap()
  await shot('3-sim-not-yet')
  await page.getByTestId('readout-details').tap()

  // … change it to 30 cm and run again
  await amountInput(page).fill('30')
  await amountInput(page).press('Enter')
  await page.getByTestId('play').tap()
  await expect(page.getByTestId('goal-result')).toContainText('✅', { timeout: 30_000 })
  await page.getByTestId('goal-banner').scrollIntoViewIfNeeded()
  await page.waitForTimeout(700)
  await shot('4-sim-success')

  await page.waitForTimeout(2500) // let the celebration finish
  await page.getByTestId('camera-menu').tap()
  await shot('5-camera-menu')
  await page.getByTestId('camera-orbit').tap()
  await page.waitForTimeout(800)
  await shot('6-sim-3d')

  await page.getByTestId('lab-menu').tap()
  await shot('7-menu')
})
