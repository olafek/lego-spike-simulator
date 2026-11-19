import { expect, test } from '@playwright/test'
import { E2E_PASSWORD } from '../playwright.config'
import { login } from './helpers'

test.describe('lab password gate', () => {
  test('every page shows the gate until the password is entered', async ({ page }) => {
    for (const path of ['/', '/projects', '/settings', '/p/0123456789abcdef0123456789abcdef']) {
      await page.goto(path)
      await expect(page.getByTestId('gate')).toBeVisible()
      await expect(page).toHaveURL(/\/login/)
    }
  })

  test('the backend rejects direct API calls without a session', async ({ request }) => {
    for (const url of ['/api/projects', '/api/usage', '/api/projects/abc', '/api/projects/abc/screenshots/def/image', '/api/projects/abc/export']) {
      const res = await request.get(url)
      expect(res.status(), url).toBe(401)
    }
    // state-changing calls are refused too (CSRF and/or auth), never executed
    for (const url of ['/api/projects', '/api/projects/abc/recognise', '/api/ai/explain', '/api/projects/import']) {
      const res = await request.post(url, { data: {} })
      expect([401, 419], url).toContain(res.status())
    }
  })

  test('the password never reaches the browser bundle', async ({ page }) => {
    const bodies: string[] = []
    page.on('response', async (res) => {
      if (res.request().resourceType() === 'script' || res.url().endsWith('/api/session')) bodies.push(await res.text().catch(() => ''))
    })
    await page.goto('/login')
    await expect(page.getByTestId('gate')).toBeVisible()
    expect(bodies.join('\n')).not.toContain(E2E_PASSWORD)
  })

  test('wrong password: friendly accessible error, show/hide toggle, then success and logout', async ({ page }) => {
    await page.goto('/login')
    const input = page.getByTestId('gate-password')
    await expect(input).toHaveAttribute('type', 'password')
    await input.fill('not-the-password')
    await page.getByTestId('gate-toggle').click()
    await expect(input).toHaveAttribute('type', 'text')
    await page.getByTestId('gate-submit').click()
    await expect(page.getByTestId('gate-error')).toContainText('not the lab password')
    await expect(input).toHaveAttribute('aria-invalid', 'true')

    await login(page)
    const res = await page.request.get('/api/projects')
    expect(res.status()).toBe(200)

    await page.getByTestId('logout').click()
    await expect(page.getByTestId('gate')).toBeVisible()
    expect((await page.request.get('/api/projects')).status()).toBe(401)
  })

  test('repeated wrong passwords start a cooldown', async ({ page }) => {
    await page.goto('/login')
    for (let i = 0; i < 6; i++) {
      const input = page.getByTestId('gate-password')
      if (await input.isDisabled()) break
      await input.fill(`wrong-${i}`)
      await page.getByTestId('gate-submit').click()
      await expect(page.getByTestId('gate-error')).not.toBeEmpty()
    }
    await expect(page.getByTestId('gate-error')).toContainText('Too many tries')
    await expect(page.getByTestId('gate-submit')).toBeDisabled()
    // even the right password is refused by the server during the cooldown
    const xsrf = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')!.value
    const res = await page.request.post('/api/login', { data: { password: E2E_PASSWORD }, headers: { 'X-XSRF-TOKEN': decodeURIComponent(xsrf) } })
    expect(res.status()).toBe(429)
    // wait it out so later tests can log in
    await expect(page.getByTestId('gate-password')).toBeEnabled({ timeout: 15_000 })
  })
})
