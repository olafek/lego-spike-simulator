import { expect, test, type Page } from '@playwright/test'
import { login, openSample } from './helpers'

// The practice kit: stand-ins that react to the robot, the hook, and the checklist.

async function matStep(page: Page, sample = 'drive-30') {
  await login(page)
  await openSample(page, sample)
  await page.getByTestId('step-mission').click()
  await expect(page.getByTestId('mission-editor')).toBeVisible()
}

test('the practice pieces can be put on the mat and adjusted', async ({ page }) => {
  await matStep(page)

  await page.getByTestId('add-push_bar').click()
  await expect(page.getByTestId('obj-push_bar')).toHaveCount(1)
  await expect(page.getByTestId('piece-front')).toHaveCount(1) // its front is marked
  await expect(page.getByTestId('piece-target')).toContainText('5 cm')
  await page.getByTestId('piece-target-more').click()
  await expect(page.getByTestId('piece-target')).toContainText('6 cm')
  await page.getByTestId('piece-target-less').click()
  await page.getByTestId('piece-target-less').click()
  await expect(page.getByTestId('piece-target')).toContainText('4 cm')
  await expect(page.getByTestId('piece-task-toggle')).toHaveAttribute('aria-pressed', 'true')

  await page.getByTestId('add-press_plate').click()
  await expect(page.getByTestId('obj-press_plate')).toHaveCount(1)
  await expect(page.getByTestId('piece-target')).toHaveCount(0) // a plate has no distance
  await page.getByTestId('piece-task-toggle').click()
  await expect(page.getByTestId('piece-task-toggle')).toHaveAttribute('aria-pressed', 'false')

  await page.getByTestId('add-pull_ring').click()
  await expect(page.getByTestId('obj-pull_ring')).toHaveCount(1)
  await expect(page.getByTestId('piece-target')).toContainText('10 cm')

  await page.getByTestId('add-obstacle').click()
  await expect(page.getByTestId('block-height-medium')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('block-height-tall').click()
  await page.getByTestId('block-avoid-toggle').click()
  await expect(page.getByTestId('block-avoid-toggle')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('save-state')).toContainText('saved')

  // everything is still there after a reload
  await page.reload()
  await expect(page.getByTestId('mission-editor')).toBeVisible()
  await page.getByTestId('obj-obstacle').click()
  await expect(page.getByTestId('block-height-tall')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('block-avoid-toggle')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('obj-push_bar').click()
  await expect(page.getByTestId('piece-target')).toContainText('4 cm')
  await page.getByTestId('obj-press_plate').click()
  await expect(page.getByTestId('piece-task-toggle')).toHaveAttribute('aria-pressed', 'false')
})

test('the hook can be chosen and sized, and the ram is pointed out', async ({ page }) => {
  await login(page)
  await openSample(page, 'drive-30')
  await page.getByTestId('step-robot').click()
  await page.getByTestId('tool-hook').click()
  await expect(page.getByTestId('tool-hook')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('tool-length')).toHaveValue('11')
  await expect(page.getByTestId('tool-width')).toHaveValue('1.6')
  await page.getByTestId('tool-length').fill('15')
  await page.getByTestId('tool-length').press('Tab')
  await expect(page.getByTestId('save-state')).toContainText('saved')
  await page.reload()
  await expect(page.getByTestId('tool-hook')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('tool-length')).toHaveValue('15')

  await page.getByTestId('tool-custom').click()
  await expect(page.getByTestId('robot-step')).toContainText('Use it as a ram')
})
