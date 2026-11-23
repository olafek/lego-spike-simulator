import { expect, test, type Page } from '@playwright/test'
import { editProject, login, openSample } from './helpers'

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

// ---- the checklist ------------------------------------------------------------------------------

const piece = (type: string, x: number, y: number, extra: object = {}) => ({ id: `t_${type}_${x}_${y}`, type, x, y, rot: 0, ...extra })
const HOOK = { uid: 'tool', kind: 'hook', port: null }
const RAM = { uid: 'tool', kind: 'custom', port: null, widthMm: 100, lengthMm: 60 }

/** The sample program is "set movement motors, move forward 30 cm". Replace its moves. */
function setMoves(data: any, moves: [string, number][]) {
  const blocks = data.program.stacks[0].blocks
  const template = blocks.find((b: any) => b.op === 'move_for')
  data.program.stacks[0].blocks = [
    ...blocks.filter((b: any) => b.op !== 'move_for'),
    ...moves.map(([direction, amount], i) => ({ ...template, id: `m${i}`, params: { ...template.params, direction, amount, unit: 'cm' } })),
  ]
}

async function kitProject(page: Page, objects: object[], tool: object, moves: [string, number][]) {
  await login(page)
  await openSample(page, 'drive-30')
  await editProject(page, (data) => {
    data.scene.objects = objects
    data.scene.goal = null
    data.attachments = [tool]
    data.step = 'simulate'
    setMoves(data, moves)
  })
  await expect(page.getByTestId('simulate-step')).toBeVisible()
}

const row = (page: Page, text: string) => page.getByTestId('task-row').filter({ hasText: text })

test('the checklist ticks what the run achieved and nothing else', async ({ page }) => {
  await kitProject(page, [piece('pull_ring', 0, 300), piece('push_bar', 300, 400)], HOOK, [['forward', 12], ['backward', 15]])
  await expect(page.getByTestId('task-checklist')).toBeVisible()
  await expect(page.getByTestId('goal-banner')).toHaveCount(0)
  await expect(row(page, 'Pull the ring out')).toHaveAttribute('data-met', 'false') // nothing is done before the run
  await expect(row(page, 'Push the bar in')).toHaveAttribute('data-met', 'false')

  await page.getByTestId('speed-4').click()
  await page.getByTestId('play').click()
  await expect(page.getByTestId('run-summary')).toBeVisible({ timeout: 30_000 })
  await expect(row(page, 'Pull the ring out')).toHaveAttribute('data-met', 'true')
  await expect(row(page, 'Push the bar in')).toHaveAttribute('data-met', 'false')
  await expect(page.getByTestId('task-count')).toContainText('1 of 2 done')
  await expect(page.getByTestId('celebration')).toHaveCount(0)

  // going back to the start un-ticks it
  await page.getByTestId('reset').click()
  await expect(row(page, 'Pull the ring out')).toHaveAttribute('data-met', 'false')
})

test('everything done is celebrated', async ({ page }) => {
  await kitProject(page, [piece('pull_ring', 0, 300)], HOOK, [['forward', 12], ['backward', 15]])
  await page.getByTestId('speed-4').click()
  await page.getByTestId('play').click()
  await expect(page.getByTestId('celebration')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('task-count')).toContainText('1 of 1 done')
})

test('a ram pushes the bar in', async ({ page }) => {
  await kitProject(page, [piece('push_bar', 0, 250)], RAM, [['forward', 18]])
  await page.getByTestId('speed-4').click()
  await page.getByTestId('play').click()
  await expect(page.getByTestId('run-summary')).toBeVisible({ timeout: 30_000 })
  await expect(row(page, 'Push the bar in')).toHaveAttribute('data-met', 'true')
})

test('"do not touch" alone is never celebrated', async ({ page }) => {
  await kitProject(page, [piece('obstacle', 300, 600, { task: true })], RAM, [['forward', 10]])
  await page.getByTestId('speed-4').click()
  await page.getByTestId('play').click()
  await expect(page.getByTestId('run-summary')).toBeVisible({ timeout: 30_000 })
  await expect(row(page, 'Do not touch the block')).toHaveAttribute('data-met', 'true')
  await page.waitForTimeout(500)
  await expect(page.getByTestId('celebration')).toHaveCount(0)
})

test('a project with only a goal looks as it always did', async ({ page }) => {
  await login(page)
  await openSample(page, 'seed-pod')
  await expect(page.getByTestId('goal-banner')).toBeVisible()
  await expect(page.getByTestId('task-checklist')).toHaveCount(0)
})
