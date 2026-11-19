import { expect, type Page } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { E2E_PASSWORD } from '../playwright.config'

export const FIXTURE_PNG = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/sample-program.png')

export async function login(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByTestId('gate')).toBeVisible()
  await page.getByTestId('gate-password').fill(E2E_PASSWORD)
  await page.getByTestId('gate-submit').click()
  await expect(page.getByTestId('upload-zone')).toBeVisible()
}

/** Play the current program at 4× and wait until the run has finished. */
export async function playToEnd(page: Page): Promise<void> {
  await page.getByTestId('speed-4').click()
  await page.getByTestId('play').click()
  await expect(page.getByTestId('run-summary')).toBeVisible({ timeout: 30_000 })
}

export async function openSample(page: Page, id: string): Promise<void> {
  await page.getByTestId(`sample-${id}`).click()
  await expect(page.getByTestId('simulate-step')).toBeVisible()
}

/** The first number input of the first block of that kind in the program panel. */
export function amountInput(page: Page, op = 'move_for') {
  return page.getByTestId(`block-${op}`).first().getByTestId('param-amount')
}
