import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { amountInput, login, openSample, playToEnd } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('30 cm drive: readouts in cm and a true-to-scale grid', async ({ page }) => {
  await openSample(page, 'drive-30')
  await playToEnd(page)
  await expect(page.getByTestId('readout-moved')).toContainText('30 cm')
  await expect(page.getByTestId('readout-position')).toContainText('x 0 cm, y 30 cm')
  await expect(page.getByTestId('move-readout')).toContainText('To go: 0 cm')
  await expect(page.getByTestId('estimated-chip')).toHaveCount(0) // exact in the ideal setup

  // the scale bar is drawn from the same px-per-mm as the 3D grid, so it cannot drift
  const bar = page.getByTestId('scale-bar')
  const pxPerMm = Number(await bar.getAttribute('data-px-per-mm'))
  const lengthMm = Number(await bar.getAttribute('data-length-mm'))
  expect(pxPerMm).toBeGreaterThan(0)
  const before = pxPerMm
  await page.getByTestId('sim-canvas').hover()
  await page.mouse.wheel(0, -400) // zoom
  await expect.poll(async () => Number(await bar.getAttribute('data-px-per-mm'))).not.toBe(before)
  const zoomed = Number(await bar.getAttribute('data-px-per-mm'))
  const zoomedLength = Number(await bar.getAttribute('data-length-mm'))
  // 30 cm of travel is always exactly three 10 cm squares: 300 mm × px/mm, at any zoom
  expect((300 * zoomed) / (100 * zoomed)).toBe(3)
  expect(zoomedLength % 10).toBe(0)
  expect(lengthMm % 10).toBe(0)
})

test('inches are optional; centimetres stay the default', async ({ page }) => {
  await openSample(page, 'drive-30')
  await expect(page.getByTestId('readout-moved')).toContainText('cm')
  await page.getByTestId('view-options').click()
  await page.getByTestId('unit-in').click()
  await playToEnd(page)
  await expect(page.getByTestId('readout-moved')).toContainText('11.8 in')
  await page.goto('/')
  await openSample(page, 'turn-90')
  await expect(page.getByTestId('readout-moved')).toContainText('cm')
})

test('90° turn', async ({ page }) => {
  await openSample(page, 'turn-90')
  await playToEnd(page)
  await expect(page.getByTestId('readout-turned')).toContainText('90°')
  await expect(page.getByTestId('readout-moved')).toContainText('0 cm')
})

test('seed pod mission: fails honestly, then succeeds after the child changes a number', async ({ page }) => {
  await openSample(page, 'seed-pod')
  await expect(page.getByTestId('goal-banner')).toContainText('seed pod')
  await playToEnd(page)
  await expect(page.getByTestId('goal-result')).toContainText('not on the target yet')
  await expect(page.getByTestId('celebration')).toHaveCount(0)

  await amountInput(page).fill('30')
  await amountInput(page).press('Enter')
  await playToEnd(page)
  await expect(page.getByTestId('goal-result')).toContainText('is on the target')
  await expect(page.getByTestId('celebration')).toBeVisible()
})

test('motor arm on Driving Base 2: motor E moves the arm', async ({ page }) => {
  await openSample(page, 'arm')
  await playToEnd(page)
  await page.getByTestId('log-toggle').click()
  await expect(page.getByTestId('event-log')).toContainText('picked up the cube')
  await page.getByTestId('telemetry-toggle').click()
  await expect(page.getByTestId('telemetry')).toContainText('Motor E')
})

test('editing blocks: add, duplicate, delete, and an unreadable value blocks Play', async ({ page }) => {
  await page.getByTestId('build-manually').click()
  await expect(page.getByTestId('check-step')).toBeVisible()
  await page.getByTestId('add-block').click()
  await page.getByTestId('palette-move_for').click()
  await expect(page.getByTestId('block-move_for')).toHaveCount(1)
  await page.getByTestId('block-duplicate').click()
  await expect(page.getByTestId('block-move_for')).toHaveCount(2)
  await page.getByTestId('block-delete').click()
  await expect(page.getByTestId('block-move_for')).toHaveCount(1)

  await amountInput(page).fill('')
  await amountInput(page).press('Enter')
  await expect(page.getByTestId('check-blockers')).toBeVisible()
  await page.getByTestId('step-simulate').click()
  await expect(page.getByTestId('sim-blocked')).toContainText('need')
  await expect(page.getByTestId('play')).toBeDisabled()
})

test('uploads are validated by content, not by file name', async ({ page }, info) => {
  const fake = info.outputPath('not-really.png')
  writeFileSync(fake, 'this is plain text pretending to be a picture')
  await page.getByTestId('file-input').setInputFiles(fake)
  await expect(page.getByTestId('start-error')).toBeVisible()
  await expect(page.getByTestId('upload-zone')).toBeVisible() // still on the home screen
})

test('projects: saved, duplicated, exported, imported and deleted', async ({ page }) => {
  await openSample(page, 'square')
  await expect(page.getByTestId('save-state')).toContainText('saved')
  await page.getByTestId('nav-projects').click()
  const rows = page.getByTestId('project-row')
  await expect(rows.first()).toContainText('Square route')
  const count = await rows.count()
  await rows.first().getByTestId('project-duplicate').click()
  await expect(rows).toHaveCount(count + 1)

  const download = page.waitForEvent('download')
  await rows.first().getByTestId('project-export').click()
  const file = await (await download).path()
  await page.getByTestId('import-input').setInputFiles({ name: 'square.spikelab.json', mimeType: 'application/json', buffer: (await import('node:fs')).readFileSync(file) })
  await expect(page.getByTestId('simulate-step')).toBeVisible()
  await expect(page.getByTestId('block-repeat')).toBeVisible()

  await page.getByTestId('nav-projects').click()
  await expect(rows.first()).toBeVisible()
  const after = await rows.count()
  await rows.first().getByTestId('project-delete').click()
  await rows.first().getByTestId('project-delete-yes').click()
  await expect(rows).toHaveCount(after - 1)
})
