import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { amountInput, login, openSample, playToEnd } from './helpers'

// Visual record of every main screen (tests/test-results/shots). Not an assertion-heavy test:
// it exists so a human can look at the real pages after a run.
test('capture the main screens', async ({ page }, info) => {
  const dir = `test-results/shots/${info.project.name}`
  mkdirSync(dir, { recursive: true })
  const shot = (name: string) => page.screenshot({ path: `${dir}/${name}.png` })

  await page.goto('/login')
  await expect(page.getByTestId('gate')).toBeVisible()
  await shot('1-gate')
  await login(page)
  await shot('2-home')

  await page.getByTestId('sample-screenshot').click()
  await expect(page.getByTestId('program-panel')).toBeVisible({ timeout: 30_000 })
  await shot('3-check')
  await page.getByTestId('step-robot').click()
  await expect(page.getByTestId('robot-step')).toBeVisible()
  await page.getByTestId('tool-fork').click()
  await shot('4-robot')
  await page.getByTestId('step-mission').click()
  await expect(page.getByTestId('mission-editor')).toBeVisible()
  await page.getByTestId('preset-seed-pod').click().catch(() => undefined)
  await shot('5-mission')

  await page.goto('/')
  await openSample(page, 'seed-pod')
  await page.waitForTimeout(600)
  await shot('6-sim-start')
  await playToEnd(page)
  await page.waitForTimeout(300)
  await shot('7-sim-end-top')
  await page.getByTestId('camera-orbit').click()
  await page.waitForTimeout(800)
  await shot('8-sim-orbit')
  await page.getByTestId('camera-behind').click()
  await page.waitForTimeout(800)
  await shot('9-sim-behind')

  // the fix: 20 cm -> 30 cm, mission complete
  await page.getByTestId('camera-top').click()
  await amountInput(page).fill('30')
  await amountInput(page).press('Enter')
  await playToEnd(page)
  await page.waitForTimeout(700)
  await shot('11-sim-success')

  await page.goto('/')
  await openSample(page, 'square')
  await playToEnd(page)
  await page.waitForTimeout(400)
  await shot('12-square-top')

  await page.goto('/')
  await openSample(page, 'arm')
  await page.getByTestId('camera-orbit').click()
  await playToEnd(page)
  await page.waitForTimeout(500)
  await shot('10-arm-orbit')
})
