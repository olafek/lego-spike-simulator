// Draws docs/social-preview.png (1280x640), the picture GitHub shows when the repo link is shared.
// Upload it under Settings -> Social preview. Usage (in /tests): node make-social-preview.mjs
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const shot = readFileSync(resolve(root, 'docs/screenshots/sim-success.png')).toString('base64')

const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; width: 1280px; height: 640px; overflow: hidden; color: #f4f6ff;
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: radial-gradient(900px 600px at 10% -10%, #2a3690 0%, transparent 60%), radial-gradient(800px 600px at 110% 20%, #5a2a86 0%, transparent 55%), #0e1433; }
  .text { position: absolute; left: 64px; top: 92px; width: 500px; }
  h1 { font-size: 84px; line-height: 1; margin: 0 0 22px; font-weight: 900; letter-spacing: -2px; }
  h1 span { color: #ffd23f; }
  p { font-size: 34px; line-height: 1.25; margin: 0 0 26px; font-weight: 700; }
  small { font-size: 24px; color: #b4bde8; font-weight: 600; line-height: 1.35; display: block; }
  .chips { margin-top: 30px; display: flex; gap: 12px; }
  .chip { background: #ffd23f; color: #2b2200; font-weight: 800; font-size: 22px; padding: 8px 18px; border-radius: 999px; }
  .chip.b { background: #34ccf1; color: #00303b; } .chip.p { background: #ff4ccd; color: #fff; }
  img { position: absolute; left: 610px; top: 70px; width: 860px; border-radius: 22px; border: 4px solid #36438f; box-shadow: 0 30px 80px rgba(0,0,0,.55); transform: rotate(-2deg); }
</style>
<div class="text">
  <h1>SPIKE <span>Lab</span></h1>
  <p>Screenshot your SPIKE Prime program. Watch a robot drive it.</p>
  <small>No robot needed. Change a number, run it again.</small>
  <div class="chips"><span class="chip">Moved: 30 cm</span><span class="chip b">Turned: 90°</span><span class="chip p">▶ Play</span></div>
</div>
<img src="data:image/png;base64,${shot}">`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } })
await page.setContent(html)
await page.screenshot({ path: resolve(root, 'docs/social-preview.png') })
await browser.close()
console.log('wrote docs/social-preview.png')
