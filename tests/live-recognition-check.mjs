// Manual check of the REAL AI provider: reads the sample screenshot and explains one block
// (two paid AI requests). Not part of the test suite.
// Usage: start the backend (cd backend && php artisan serve), then: node live-recognition-check.mjs [image]
// Reads the lab password from backend/.env and never prints it.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const base = process.env.LAB_BACKEND_URL ?? 'http://127.0.0.1:8000'
const image = resolve(process.argv[2] ?? resolve(root, 'fixtures/sample-program.png'))
const env = readFileSync(resolve(root, 'backend/.env'), 'utf8')
const password = (env.match(/^LAB_ACCESS_PASSWORD=(.*)$/m)?.[1] ?? '').trim().replace(/^"|"$/g, '')

const jar = new Map()
async function call(method, path, body, isForm = false) {
  const headers = { Accept: 'application/json', Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }
  if (jar.has('XSRF-TOKEN')) headers['X-XSRF-TOKEN'] = decodeURIComponent(jar.get('XSRF-TOKEN'))
  if (body && !isForm) headers['Content-Type'] = 'application/json'
  const res = await fetch(base + path, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined })
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';')
    jar.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1))
  }
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text.slice(0, 300)
  }
  return { status: res.status, json }
}

const session = await call('GET', '/api/session')
console.log('vision:', session.json.vision)
const login = await call('POST', '/api/login', { password })
if (login.status !== 200) throw new Error(`login failed: ${login.status}`)
const project = await call('POST', '/api/projects', { name: 'Live recognition check' })
const form = new FormData()
form.append('image', new Blob([readFileSync(image)], { type: 'image/png' }), 'check.png')
const upload = await call('POST', `/api/projects/${project.json.id}/screenshots`, form, true)
console.log('upload:', upload.status)
const started = Date.now()
const rec = await call('POST', `/api/projects/${project.json.id}/recognise`, {})
console.log('recognise:', rec.status, `${((Date.now() - started) / 1000).toFixed(1)} s`, 'driver:', rec.json.driver, 'model:', rec.json.model)
console.log(JSON.stringify(rec.json.raw ?? rec.json, null, 1))
await call('DELETE', `/api/projects/${project.json.id}`)

// the same provider also answers the text helper (one more AI request)
const explain = await call('POST', '/api/ai/explain', { blockText: 'move forward for 20 cm', programText: 'when program starts\n  move forward for 20 cm' })
console.log('explain:', explain.status, JSON.stringify(explain.json))
