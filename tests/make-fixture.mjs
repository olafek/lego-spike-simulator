// Renders fixtures/sample-program.html to fixtures/sample-program.png and copies it to the
// frontend's public folder, where the "Example screenshot" sample loads it from.
import { chromium } from '@playwright/test'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'fixtures/sample-program.png')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 620 }, deviceScaleFactor: 2 })
await page.goto(pathToFileURL(resolve(root, 'fixtures/sample-program.html')).href)
await page.screenshot({ path: out })
await browser.close()

mkdirSync(resolve(root, 'frontend/public/samples'), { recursive: true })
copyFileSync(out, resolve(root, 'frontend/public/samples/sample-program.png'))
console.log('wrote', out)
