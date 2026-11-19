import { expect, test } from '@playwright/test'
import { amountInput, FIXTURE_PNG, login, playToEnd } from './helpers'

// The central promise of SPIKE Lab:
// upload a screenshot → check the blocks → choose the robot → place a seed pod → simulate →
// step through → change 20 cm to 30 cm inside the website → run again. No second upload.
test('screenshot → check → robot → mat → simulate → tinker → rerun', async ({ page }, info) => {
  await login(page)

  // 1. upload (through the same input the iPad photo picker uses)
  await page.getByTestId('file-input').setInputFiles(FIXTURE_PNG)

  // 2. recognise → 3. check, side by side with the original picture
  await expect(page.getByTestId('check-step')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('program-panel')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('screenshot-image')).toBeVisible()
  await expect(page.getByTestId('mock-chip')).toBeVisible() // honest about the offline fixture
  await expect(page.getByTestId('block-set_movement_motors')).toBeVisible()
  await expect(amountInput(page)).toHaveValue('20')

  // the unreadable motor port is flagged and NOT guessed
  const motor = page.getByTestId('block-motor_run_for')
  await expect(motor.getByTestId('block-flag')).toBeVisible()
  await expect(motor.getByTestId('param-ports')).toHaveValue('')
  await expect(page.getByTestId('check-blockers')).toContainText('1 block')
  // disconnected blocks are shown separately and will not run
  await expect(page.getByTestId('loose-stack')).toContainText('not connected')

  // the child fixes it
  await motor.getByTestId('param-ports').selectOption('E')
  await expect(page.getByTestId('check-blockers')).toHaveCount(0)
  await expect(page.getByTestId('review-ok')).toBeVisible()
  await page.getByTestId('check-done').click()

  // 4. robot: Driving Base 1 is suggested but must be confirmed; add a passive fork
  await expect(page.getByTestId('robot-step')).toBeVisible()
  await expect(page.getByTestId('robot-suggestion')).toBeVisible()
  await page.getByTestId('robot-db1').click()
  await expect(page.getByTestId('robot-db1')).toContainText('chosen')
  await page.getByTestId('tool-fork').click()
  await page.getByTestId('robot-confirm').click()

  // 5. mission: large seed pod on the 10 cm grid
  await expect(page.getByTestId('mission-editor')).toBeVisible()
  await page.getByTestId('add-seed_pod_large').click()
  await expect(page.getByTestId('obj-seed_pod_large')).toBeVisible()
  await page.getByTestId('mission-done').click()

  // 6. simulate, overhead view, cm readouts
  await expect(page.getByTestId('simulate-step')).toBeVisible()
  await page.getByTestId('camera-top').click()
  await expect(page.getByTestId('scale-bar')).toBeVisible()
  await expect(page.getByTestId('readout-moved')).toContainText('0 cm')
  await playToEnd(page)
  // forward 20 cm + backward 10 cm = 30 cm of travel, ending 10 cm up the mat
  await expect(page.getByTestId('readout-moved')).toContainText('30 cm')
  await expect(page.getByTestId('readout-position')).toContainText('y 10 cm')
  await expect(page.getByTestId('readout-turned')).toContainText('0°')
  // the program uses motor E but this robot has nothing there: said out loud, not faked
  await expect(page.getByTestId('sim-warning').first()).toContainText('port E')

  // step through instruction by instruction, forwards and backwards
  await page.getByTestId('reset').click()
  await expect(page.getByTestId('readout-moved')).toContainText('0 cm')
  await page.getByTestId('step-next').click()
  await expect(page.getByTestId('readout-moved')).toContainText('20 cm')
  await expect(page.getByTestId('move-readout')).toContainText('Asked: 20 cm')
  await page.getByTestId('step-next').click() // the motor block (nothing moves)
  await page.getByTestId('step-next').click()
  await expect(page.getByTestId('readout-moved')).toContainText('30 cm')
  await page.getByTestId('step-prev').click()
  await page.getByTestId('step-prev').click()
  await expect(page.getByTestId('readout-moved')).toContainText('20 cm')
  await expect(page.getByTestId('readout-position')).toContainText('y 20 cm')

  // camera changes never disturb the run
  await page.getByTestId('camera-orbit').click()
  await page.getByTestId('camera-follow').click()
  await expect(page.getByTestId('readout-moved')).toContainText('20 cm')
  await page.getByTestId('camera-top').click()

  // 7. tinker: 20 cm → 30 cm, right here
  await amountInput(page).fill('30')
  await amountInput(page).press('Enter')
  await expect(page.getByTestId('readout-moved')).toContainText('0 cm') // new run, back at the start
  await playToEnd(page)
  await expect(page.getByTestId('readout-moved')).toContainText('40 cm')
  await expect(page.getByTestId('readout-position')).toContainText('y 20 cm')
  await info.attach('simulator', { body: await page.screenshot(), contentType: 'image/png' })

  // the screenshot's own reading is preserved separately and can be restored
  await expect(page.getByTestId('restore-original')).toBeVisible()

  // saved: reload and everything is still there, without uploading again
  await expect(page.getByTestId('save-state')).toContainText('saved')
  await page.reload()
  await expect(page.getByTestId('simulate-step')).toBeVisible()
  await expect(amountInput(page)).toHaveValue('30')
  await page.getByTestId('step-check').click()
  await expect(page.getByTestId('screenshot-image')).toBeVisible()
})
