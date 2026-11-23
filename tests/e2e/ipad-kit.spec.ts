import { expect, test } from '@playwright/test'
import { editProject, login, noSidewaysScroll, touchTargets } from './helpers'

// Runs on both iPads and the iPhone: the practice kit must fit and stay touch friendly.

test('the checklist and the piece controls fit the screen', async ({ page }) => {
  await login(page)
  await page.getByTestId('sample-drive-30').tap()
  await expect(page.getByTestId('simulate-step')).toBeVisible()
  await editProject(page, (data) => {
    data.scene.objects = [
      { id: 'ring', type: 'pull_ring', x: 0, y: 300, rot: 0 },
      { id: 'bar', type: 'push_bar', x: 300, y: 400, rot: 0 },
      { id: 'block', type: 'obstacle', x: -300, y: 400, rot: 0, task: true },
    ]
    data.attachments = [{ uid: 'tool', kind: 'hook', port: null }]
  })
  await expect(page.getByTestId('task-checklist')).toBeVisible()
  await expect(page.getByTestId('task-row')).toHaveCount(3)
  await noSidewaysScroll(page)
  await touchTargets(page)

  await page.getByTestId('step-mission').tap()
  await expect(page.getByTestId('mission-editor')).toBeVisible()
  await page.getByTestId('obj-push_bar').tap()
  await expect(page.getByTestId('piece-target')).toBeVisible()
  await noSidewaysScroll(page)
  await touchTargets(page)
  await page.getByTestId('obj-obstacle').tap()
  await expect(page.getByTestId('block-avoid-toggle')).toBeVisible()
  await noSidewaysScroll(page)
  await touchTargets(page)
})
