// Records the demo (e2e/demo.spec.ts) and turns its frames into docs/screenshots/demo.gif.
// Usage (in /tests): npm run demo        (add --encode-only to reuse the last recording)
import gifenc from 'gifenc'
import { PNG } from 'pngjs'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const { GIFEncoder, quantize, applyPalette } = gifenc
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, 'test-results/demo-frames')
const out = resolve(here, '../docs/screenshots/demo.gif')

if (!process.argv.includes('--encode-only')) {
  execSync('npx playwright test demo --project=desktop', { cwd: here, stdio: 'inherit', env: { ...process.env, DEMO_GIF: '1' } })
}

const frames = JSON.parse(readFileSync(resolve(dir, 'frames.json'), 'utf8'))
const images = frames.map((f) => PNG.sync.read(readFileSync(resolve(here, f.file))))
const { width, height } = images[0]

// One palette for the whole clip (sampled from a few frames) keeps colours steady.
// Index 255 is kept free and means "same as the frame before", which keeps the file small.
const picks = [0, 0.2, 0.45, 0.7, 0.9, 1].map((k) => images[Math.min(images.length - 1, Math.floor(k * (images.length - 1)))])
const sample = new Uint8Array(picks.reduce((n, img) => n + img.data.length, 0))
let offset = 0
for (const img of picks) {
  sample.set(img.data, offset)
  offset += img.data.length
}
const palette = quantize(sample, 255, { format: 'rgb565' })
while (palette.length < 256) palette.push([0, 0, 0])
const SAME = 255

const gif = GIFEncoder()
let previous = null
images.forEach((img, i) => {
  const index = applyPalette(img.data, palette.slice(0, 255), 'rgb565')
  const frame = new Uint8Array(index)
  if (previous) for (let p = 0; p < frame.length; p++) if (index[p] === previous[p]) frame[p] = SAME
  gif.writeFrame(frame, width, height, {
    palette: i === 0 ? palette : undefined,
    delay: frames[i].ms,
    repeat: 0,
    transparent: i > 0,
    transparentIndex: SAME,
    dispose: 1,
  })
  previous = index
})
gif.finish()
writeFileSync(out, gif.bytes())
console.log(`wrote ${out}: ${images.length} frames, ${width}x${height}, ${(gif.bytes().length / 1024 / 1024).toFixed(2)} MB`)
