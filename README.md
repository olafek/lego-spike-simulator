# SPIKE Lab

Screenshot-first LEGO® Education SPIKE™ Prime simulator for 10–11 year olds.
A child screenshots their program in the SPIKE app, uploads it, checks the reconstructed blocks, and
watches a robot drive **that exact program** on a metric grid – then changes numbers and reruns, without
going back to the iPad app.

The motion is deterministic maths (fixed timestep, differential drive). AI only *reads the screenshot*
and can *explain a block* or *suggest a mat*; it never moves the robot and never edits the program.

| Folder | What |
|---|---|
| `frontend/` | Vue 3 + TypeScript + Vite + Tailwind + Pinia + Three.js. `src/core` is the framework-free simulator. |
| `backend/` | Laravel (PHP 8.3), SQLite locally / MySQL compatible. Password gate, projects, private screenshots, quotas, AI adapters. |
| `tests/` | Playwright end-to-end tests (real backend + real frontend, mock picture reader). |
| `fixtures/` | Sample screenshot (`sample-program.png`) and its HTML source. |
| `docs/` | [architecture](docs/architecture.md), [robots & physics assumptions](docs/robots.md), original brief (`prompt.md`). |

## Run it locally (no Docker)

Needs PHP 8.3+ with Composer and Node 20+.

```powershell
# 1. backend  → http://127.0.0.1:8000
cd backend
composer install
copy .env.example .env          # set LAB_ACCESS_PASSWORD (there is no default password)
php artisan key:generate
php artisan migrate
php artisan serve

# 2. frontend → http://localhost:5173  (proxies /api to the backend)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and enter the lab password.
With `VISION_DRIVER=mock` (the `.env.example` default) every upload returns a stored example reading, clearly
labelled "practice mode" – the whole flow works with no AI service at all.

### Environment (`backend/.env`)

| Variable | Meaning |
|---|---|
| `LAB_ACCESS_PASSWORD` | The one shared lab password. Empty = nobody can log in. |
| `LAB_SESSION_HOURS` | Session lifetime (default 8). |
| `LAB_MAX_AI_REQUESTS_PER_HOUR` | AI calls per session per hour (per IP: ×6, a classroom shares an IP). |
| `LAB_MAX_UPLOAD_MB`, `LAB_MAX_SCREENSHOTS_PER_PROJECT`, `LAB_MAX_IMAGE_DIMENSION` | Upload caps. |
| `LAB_MAX_CONCURRENT_ANALYSES`, `LAB_MAX_UPLOADS_PER_HOUR`, `LAB_MAX_PROJECTS_PER_SESSION_PER_HOUR` | Abuse limits. |
| `LAB_LOGIN_MAX_ATTEMPTS`, `LAB_LOGIN_COOLDOWN_SECONDS` | Bad-password throttling. |
| `LAB_RETENTION_DAYS` | Projects and screenshots untouched this long are deleted by `php artisan lab:prune` (scheduled daily). |
| `VISION_DRIVER` | `mock` or `openai` – who reads the screenshots. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Used when `VISION_DRIVER=openai`. The model must accept images. |
| `AIBRAIN_BASE_URL`, `AIBRAIN_API_KEY`, `AIBRAIN_TIMEOUT` | AI Brain gateway (text only): block explanations and mat suggestions. Optional. |

## Tests

```powershell
cd frontend; npm test            # 72 simulator/unit tests (Vitest)
cd backend;  php artisan test    # 65 API/security tests (PHPUnit)
cd tests;    npm install; npx playwright install chromium; npm test   # 25 browser tests
```

The Playwright run starts its own backend (separate `e2e.sqlite`, throw-away password, mock picture reader)
and frontend on ports 8010/5183, so it never touches your data or spends AI credits.
`node tests/live-recognition-check.mjs` sends the sample screenshot through the **real** configured
picture reader once (costs one AI request) and prints what came back.

## Production

```powershell
cd frontend; npm ci; npm run build        # writes backend/public/spa
cd backend;  composer install --no-dev --optimize-autoloader
php artisan migrate --force; php artisan config:cache; php artisan route:cache
```

- Serve `backend/public` with PHP-FPM behind **HTTPS** (required: the session cookie is `Secure` in production).
- `APP_ENV=production`, `APP_DEBUG=false`, a strong `LAB_ACCESS_PASSWORD`, `SESSION_SECURE_COOKIE=true`.
- Behind a proxy/load balancer configure trusted proxies, otherwise login throttling and IP quotas see the proxy's address.
- Run the scheduler (`php artisan schedule:run` every minute) so `lab:prune` enforces retention.
- `storage/app/private` holds the screenshots; it must not be web-accessible (it is outside `public/`).
- Cap request size at the web server (e.g. 12 MB) in addition to the app limits.

**What the password is and is not.** One shared password keeps the public out. It does not identify a child and
does not isolate projects: anyone with the password can list and open every lab project. The UI says so.

## Status – what really works

Verified by the automated tests above, plus one live OpenAI recognition of the sample screenshot.

| Milestone | State |
|---|---|
| 1. Gate, protected API, upload → review → edit → save | **Done.** |
| 2. 3D Driving Base, metric grid, cameras, playback/step/rewind, trail | **Done.** |
| 3. Real vision adapter, strict validation, multi-screenshot | **Done** with OpenAI. Verified live on the generated sample image only – **not yet on a real iPad SPIKE screenshot**. |
| 4. Driving Base 2/3/Advanced, attachments, port mapping | **Done** as data-driven configs; geometry beyond the official port/wheel facts is approximate (see `docs/robots.md`). |
| 5. Scene editor, seed pods, pushing, lifting, goals | **Done with documented simplifications** (objects slide but do not rotate or tip; lifting/grabbing is rule-based). |
| 6. Sensors, control flow, parallel stacks, calibration, export/import, iPad layouts | **Done.** |

Known gaps / next steps:

- Try real SPIKE app screenshots (light/dark theme, zoomed, multi-screenshot programs) and tune `backend/resources/lab/vision-prompt.txt`.
- Only "when program starts" stacks run; other event hats are shown and flagged, not simulated.
- Conditions with and/or/not are executed correctly but can only be replaced, not edited part by part.
- No custom Rapier physics: collision is a small 2D solver (enough for pushing; no tipping, stacking or friction model).
- HEIC upload depends on the server's Imagick codec and is untested; iPads normally hand over JPEG/PNG.
- Browser tests use Chromium with iPad viewports + touch; run them in WebKit/on a real iPad before a classroom rollout.
- The 3D camera feel and touch gestures were checked through screenshots and automated taps, not by hand on a device.
