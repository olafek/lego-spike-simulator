import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { amountInput, login, openSample } from './helpers'

// Records the frames for docs/screenshots/demo.gif. Skipped in normal runs.
// Usage (in /tests):  npm run demo
test.skip(!process.env.DEMO_GIF, 'only runs when recording the demo (npm run demo)')

test.use({ viewport: { width: 1200, height: 720 }, deviceScaleFactor: 1 })

test('record the demo frames', async ({ page }) => {
  test.setTimeout(180_000)
  const dir = 'test-results/demo-frames'
  mkdirSync(dir, { recursive: true })
  const frames: { file: string; ms: number }[] = []
  let last = Date.now()

  const snap = async () => {
    const file = `${dir}/${String(frames.length).padStart(4, '0')}.png`
    await page.screenshot({ path: file })
    const now = Date.now()
    if (frames.length) frames[frames.length - 1].ms = now - last
    last = now
    frames.push({ file, ms: 100 })
  }
  /** keep taking frames until `done()` is true (or the time is up) */
  const film = async (done: () => Promise<boolean>, maxMs = 15_000) => {
    const start = Date.now()
    while (Date.now() - start < maxMs) {
      await snap()
      if (await done()) break
    }
  }
  const hold = async (ms: number) => {
    await snap()
    frames[frames.length - 1].ms = ms
    last = Date.now()
  }
  const finished = () => page.getByTestId('run-summary').isVisible()

  await login(page)
  await openSample(page, 'seed-pod')
  await page.getByTestId('speed-0.5').click()
  await page.waitForTimeout(500)
  await hold(1200)

  // first try: 20 cm is not far enough
  await page.getByTestId('play').click()
  await film(finished)
  await expect(page.getByTestId('goal-result')).toContainText('not on the target yet')
  await hold(2200)

  // change the number, right here
  await amountInput(page).click()
  await hold(500)
  await amountInput(page).fill('30')
  await hold(900)
  await amountInput(page).press('Enter')
  await page.waitForTimeout(250)
  await hold(700)

  // second try: mission complete
  await page.getByTestId('play').click()
  await film(finished)
  await film(async () => false, 1600) // let the confetti fall
  await hold(2600)

  writeFileSync(`${dir}/frames.json`, JSON.stringify(frames))
})
