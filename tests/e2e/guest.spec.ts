import { expect, test } from '@playwright/test'
import { amountInput, FIXTURE_PNG, login, playToEnd } from './helpers'

// The public demo at /demo: open to anyone, but fenced off from the real lab.
test('a visitor can use the demo without a password, and it stays separate from the lab', async ({ page }) => {
  await page.goto('/demo')
  await expect(page.getByTestId('upload-zone')).toBeVisible()
  await expect(page.getByTestId('gate')).toHaveCount(0)
  await expect(page.getByTestId('demo-chip')).toBeVisible()
  await expect(page.getByTestId('demo-notice')).toContainText('public demo')
  await expect(page.getByTestId('logout')).toHaveCount(0)

  // a sample runs end to end, and can be tinkered with
  await page.getByTestId('sample-seed-pod').click()
  await expect(page).toHaveURL(/\/demo\/p\//)
  await expect(page.getByTestId('simulate-step')).toBeVisible()
  await playToEnd(page)
  await expect(page.getByTestId('goal-result')).toContainText('not on the target yet')
  await amountInput(page).fill('30')
  await amountInput(page).press('Enter')
  await playToEnd(page)
  await expect(page.getByTestId('goal-result')).toContainText('is on the target')
  await expect(page.getByTestId('save-state')).toContainText('saved')

  // uploading works too, but always shows the stored example (no AI is called in the demo)
  await page.goto('/demo')
  await page.getByTestId('file-input').setInputFiles(FIXTURE_PNG)
  await expect(page.getByTestId('program-panel')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('mock-chip')).toBeVisible()
  await expect(page.getByTestId('screenshot-image')).toBeVisible()
  expect(await page.getByTestId('screenshot-image').getAttribute('src')).toContain('/demo/api/projects/')

  // the visitor sees their own two projects, and nothing else
  await page.getByTestId('nav-projects').click()
  await expect(page).toHaveURL(/\/demo\/projects/)
  await expect(page.getByTestId('project-row')).toHaveCount(2)
  await expect(page.getByTestId('show-everyone')).toHaveCount(0)
  await expect(page.getByTestId('import-input')).toHaveCount(0)

  // the same browser still cannot get into the lab
  expect((await page.request.get('/api/projects')).status()).toBe(401)
  await page.goto('/projects')
  await expect(page.getByTestId('gate')).toBeVisible()

  // and after logging into the lab, the demo projects are not there
  const demoIds = ((await (await page.request.get('/demo/api/projects')).json()) as { id: string }[]).map((p) => p.id)
  expect(demoIds).toHaveLength(2)
  await login(page)
  const labIds = ((await (await page.request.get('/api/projects')).json()) as { id: string }[]).map((p) => p.id)
  for (const id of demoIds) expect(labIds).not.toContain(id)
  expect((await page.request.get(`/api/projects/${demoIds[0]}`)).status()).toBe(404)
})

test('another visitor does not see the first visitor’s demo projects', async ({ browser }) => {
  const first = await browser.newContext()
  const a = await first.newPage()
  await a.goto('/demo')
  await a.getByTestId('sample-drive-30').click()
  await expect(a.getByTestId('simulate-step')).toBeVisible()
  const url = a.url()

  const second = await browser.newContext()
  const b = await second.newPage()
  await b.goto('/demo/projects')
  await expect(b.getByTestId('projects-view')).toBeVisible()
  await expect(b.getByTestId('project-row')).toHaveCount(0)
  // even with the exact link, the project is not found
  await b.goto(url)
  await expect(b.getByRole('alert')).toBeVisible()
  await expect(b.getByTestId('simulate-step')).toHaveCount(0)

  await first.close()
  await second.close()
})
