import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { amountInput, dragCorner, editProject, login, openSample, playToEnd, TABLE_CORNERS, TABLE_PHOTO } from './helpers'

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

  // your own table: a photo (here a generated, made-up mat) straightened into the floor
  await page.goto('/')
  await page.getByTestId('new-table').click()
  await expect(page.getByTestId('mat-picture-panel')).toBeVisible()
  await page.getByTestId('mat-picture-choose').setInputFiles(TABLE_PHOTO)
  await expect(page.getByTestId('corner-photo')).toBeVisible()
  for (let i = 0; i < 4; i++) await dragCorner(page, i, TABLE_CORNERS[i][0], TABLE_CORNERS[i][1])
  await shot('13-table-corners')
  await page.getByTestId('mat-picture-next').click()
  await page.getByTestId('mat-picture-use').click()
  await expect(page.getByTestId('mat-picture')).toBeVisible()
  await page.getByTestId('add-obstacle').click()
  await shot('14-table-editor')
  await page.getByTestId('mission-done').click()
  await page.getByTestId('camera-orbit').click()
  await page.waitForTimeout(1000)
  await shot('15-table-3d')

  // the practice kit: stand-ins on the mat, a hook on the robot, and the checklist
  await page.goto('/')
  await openSample(page, 'drive-30')
  await editProject(page, (data) => {
    data.scene.objects = [
      { id: 'ring', type: 'pull_ring', x: 0, y: 300, rot: 0 },
      { id: 'bar', type: 'push_bar', x: 300, y: 300, rot: 20 },
      { id: 'plate', type: 'press_plate', x: -300, y: 300, rot: -30 },
      { id: 'block', type: 'obstacle', x: -250, y: 60, rot: 0, task: true, h: 160 },
    ]
    data.attachments = [{ uid: 'tool', kind: 'hook', port: null }]
    data.step = 'mission'
    const blocks = data.program.stacks[0].blocks
    const move = blocks.find((b: any) => b.op === 'move_for')
    data.program.stacks[0].blocks = [
      ...blocks.filter((b: any) => b.op !== 'move_for'),
      { ...move, id: 'kit_a', params: { ...move.params, amount: 12 } },
      { ...move, id: 'kit_b', params: { ...move.params, direction: 'backward', amount: 15 } },
    ]
  })
  await expect(page.getByTestId('mission-editor')).toBeVisible()
  await page.getByTestId('obj-push_bar').click()
  await shot('16-kit-editor')
  await page.getByTestId('mission-done').click()
  await page.getByTestId('camera-orbit').click()
  await playToEnd(page)
  await page.waitForTimeout(600)
  await shot('17-kit-3d')
})
