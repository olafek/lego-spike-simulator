# Setting up SPIKE Lab

Back to the [README](../README.md).

| Folder | What |
|---|---|
| `frontend/` | Vue 3 + TypeScript + Vite + Tailwind + Pinia + Three.js. `src/core` is the framework-free simulator. |
| `backend/` | Laravel (PHP 8.3), SQLite locally / MySQL compatible. Password gate, projects, private screenshots, quotas, AI adapters. |
| `tests/` | Playwright browser tests (real backend + real frontend, offline picture reader). |
| `fixtures/` | The sample screenshot and its HTML source. |
| `docs/` | Documentation and screenshots. |

## Run it locally (no Docker)

Needs PHP 8.3+ with Composer 2 and Node 20.19+ (or 22.12+).

```bash
# 1. backend  → http://127.0.0.1:8000
cd backend
composer install
cp .env.example .env            # then set LAB_ACCESS_PASSWORD – there is no default password
php artisan key:generate
touch database/database.sqlite
php artisan migrate
php artisan serve

# 2. frontend → http://localhost:5173  (forwards /api to the backend)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and enter the lab password.

With `AI_PROVIDER=mock` (the default in `.env.example`) every upload returns a stored example reading,
labelled "practice mode" in the app. The whole flow works with no AI service at all.

## Settings (`backend/.env`)

| Variable | Meaning |
|---|---|
| `LAB_ACCESS_PASSWORD` | The one shared lab password. Empty = nobody can log in. |
| `LAB_SESSION_HOURS` | How long a login lasts (default 8). |
| `LAB_MAX_AI_REQUESTS_PER_HOUR` | AI calls per session per hour (per IP address: six times that, because a classroom shares one). |
| `LAB_MAX_UPLOAD_MB`, `LAB_MAX_SCREENSHOTS_PER_PROJECT`, `LAB_MAX_IMAGE_DIMENSION` | Upload limits. |
| `LAB_MAX_CONCURRENT_ANALYSES`, `LAB_MAX_UPLOADS_PER_HOUR`, `LAB_MAX_PROJECTS_PER_SESSION_PER_HOUR` | Limits against misuse. |
| `LAB_LOGIN_MAX_ATTEMPTS`, `LAB_LOGIN_COOLDOWN_SECONDS` | Wrong-password throttling. |
| `LAB_RETENTION_DAYS` | Projects and screenshots untouched for this long are deleted by `php artisan lab:prune`. |
| `LAB_DEMO_ENABLED` | `true` opens a public demo at `/demo` (see below). Off by default. |
| `LAB_DEMO_RETENTION_HOURS` | Demo projects are deleted after this many hours (default 24). |
| `AI_PROVIDER` | `mock`, `openai` or `gemini`. One provider reads the screenshots, explains blocks and suggests mats. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Used when `AI_PROVIDER=openai`. The model must accept images. |
| `OPENAI_BASE_URL` | Optional. Point it at any other service that speaks the OpenAI chat-completions format. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Used when `AI_PROVIDER=gemini`. The model must accept images. |
| `AI_TIMEOUT` | Seconds to wait for the AI service (default 90). |

## The public demo (optional)

Set `LAB_DEMO_ENABLED=true` and anyone can try the app at `/demo` without the lab password. It is built so
that a stranger can play with it but cannot reach or cost you anything real:

- **No AI is ever called.** The demo always uses the offline example, whatever `AI_PROVIDER` says, so it
  cannot spend your AI credits. Uploads work, but every upload shows the stored example reading.
- **Each visitor only sees what they made.** Demo projects belong to the visitor's own browser session.
  They cannot list or open anyone else's demo projects, and they cannot see lab projects at all. The lab
  cannot see demo projects either.
- **Tighter limits.** Two screenshots per project, 5 MB per picture, and small hourly caps on uploads and
  new projects, counted separately from the lab's own quotas.
- **Short-lived.** Demo projects and their pictures are deleted after `LAB_DEMO_RETENTION_HOURS` by the
  hourly cleanup (this needs the scheduler cron line below).
- Opening project files (import) is switched off in the demo.

The lab itself is unchanged and still needs the password. With the setting off, `/demo` does not exist.

## Tests

```bash
cd frontend && npm test            # 74 simulator and unit tests (Vitest)
cd backend  && php artisan test    # 78 API and security tests (PHPUnit)
cd tests    && npm install && npx playwright install chromium && npm test   # 40 browser tests
```

The browser tests start their own backend and frontend on ports 8010 and 5183 with a separate database, a
throw-away password and the offline picture reader. They never touch real data and never call an AI service.

`node tests/live-recognition-check.mjs` sends the sample screenshot through the **real** configured picture
reader once (one paid AI request) and prints what came back.

`npm run fixture` in `tests/` redraws the sample screenshot from `fixtures/sample-program.html`.
`npm run demo` re-records the animated demo at the top of the README, and `node make-social-preview.mjs`
redraws `docs/social-preview.png`.

## Putting it on a server

```bash
cd backend
composer install --no-dev --optimize-autoloader
cp .env.example .env && php artisan key:generate     # then edit .env
touch database/database.sqlite
php artisan migrate --force
chmod -R ug+rwX storage bootstrap/cache database

cd ../frontend
npm ci && npm run build                              # writes backend/public/spa

cd ../backend
php artisan config:cache
```

In `.env` for production: `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://your-domain`,
`SESSION_SECURE_COOKIE=true`, a strong `LAB_ACCESS_PASSWORD`, and the AI provider settings.

- The web root must be `backend/public`, served over **HTTPS** (the login cookie is HTTPS-only in production).
- Run the scheduler every minute so old projects are cleaned up:
  `* * * * * cd /path/to/backend && php artisan schedule:run >> /dev/null 2>&1`
- `backend/storage/app/private` holds the screenshots. It sits outside the web root and must stay there.
- After any change to `.env`, run `php artisan config:cache` again.
- Behind a proxy or load balancer, configure trusted proxies; otherwise wrong-password throttling and
  per-address limits see the proxy's address for everyone.

### Things that went wrong on a real server (and the fix)

- **`composer-runtime-api ^2.2 … no matching package found`** – the server was running Composer 1. Use Composer 2.
- **Several PHP versions installed** – call the PHP 8.3 binary explicitly for every `artisan` command and in
  the cron line.
- **Old Node (8.x) or `GLIBC_2.28 not found`** – the frontend needs Node 20.19+, and official Node builds need
  a newer operating system than some servers have. Either build on another machine and upload
  `backend/public/spa`, or use the "glibc-217" Node build from
  https://unofficial-builds.nodejs.org/download/release/ unpacked into your home folder and put first on `PATH`.

## Known gaps and next steps

- The picture reader has been verified on the generated sample image. It needs testing and prompt tuning
  (`backend/resources/lab/vision-prompt.txt`) on real SPIKE app screenshots: light and dark theme, zoomed,
  and programs spread over several screenshots.
- Only "when program starts" stacks run. Other event blocks are shown and flagged, not simulated.
- Conditions with and/or/not run correctly but can only be replaced, not edited part by part.
- Collision is a small 2D solver: good for pushing, no tipping, stacking or friction model.
- HEIC upload depends on the server's image library and is untested; iPads normally hand over JPEG or PNG.
- The browser tests use Chromium with iPad and iPhone screen sizes and touch. Try Safari on a real iPad
  (and an iPhone) before a classroom rollout.
- Robot and tool dimensions beyond the official port and wheel facts are estimates – see [robots.md](robots.md).
