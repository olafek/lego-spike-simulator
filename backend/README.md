# SPIKE Lab backend (Laravel)

Password gate, projects, private screenshot storage, usage quotas and the AI adapters. No Docker, no user accounts.

## Run locally

```powershell
composer install
copy .env.example .env        # then set LAB_ACCESS_PASSWORD
php artisan key:generate
php artisan migrate
php artisan serve             # http://127.0.0.1:8000
php artisan test
```

The Vue app is built into `public/spa` (Vite `base: '/spa/'`); every non-API GET serves `public/spa/index.html`
and redirects to `/login` until the session has passed the gate.

## Access model

One shared password (`LAB_ACCESS_PASSWORD`) checked server-side with a constant-time comparison. It is an access
barrier, not an identity: everyone who knows it can see every project. Empty password = login refused (503).
Sessions are server-side (HttpOnly, SameSite=Lax, Secure when `APP_ENV=production`), expire after `LAB_SESSION_HOURS`,
and all state-changing requests need the CSRF token (`X-XSRF-TOKEN` from the `XSRF-TOKEN` cookie).
Production must run behind HTTPS; set `APP_ENV=production`, `APP_DEBUG=false`, and configure trusted proxies if the
app sits behind a load balancer (login throttling and IP quotas use the client IP).

## API (JSON; everything except `session` and `login` needs the gate)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/session` | public; `{authenticated, limits, vision:{driver,live}, assistant:{available}}` |
| POST | `/api/login` `{password}` | 422 `wrong_password` (+`attemptsLeft`), 429 `cooldown` (+`retryAfter`), 503 `not_configured` |
| POST | `/api/logout` | |
| GET | `/api/usage` | counters and limits |
| GET/POST | `/api/projects` | list (50 newest) / create `{name?, data?}` |
| GET/PUT/DELETE | `/api/projects/{id}` | `data` is an opaque JSON object owned by the frontend (max 600 KB) |
| POST | `/api/projects/{id}/duplicate` | copies screenshot files too |
| GET | `/api/projects/{id}/export` · POST `/api/projects/import` | `{format:'spike-lab-project', version:1, ...}` |
| POST | `/api/projects/{id}/screenshots` | multipart `image`, optional `replaces` (screenshot id) |
| PUT | `/api/projects/{id}/screenshots/order` `{ids}` | |
| DELETE | `/api/projects/{id}/screenshots/{sid}` | |
| GET | `/api/projects/{id}/screenshots/{sid}/image` | private bytes |
| POST | `/api/projects/{id}/recognise` `{screenshotIds?}` | `{raw, driver, model, screenshotIds}` |
| POST | `/api/ai/explain` `{blockText, programText?}` | `{text}` from the AI provider |
| POST | `/api/ai/scene` `{description}` | `{raw}` from the AI provider |

Errors are always `{message, code, ...}`; `message` is written for a child.

## Uploads

Validated by content (finfo + full decode), never by extension. PNG/JPEG/WebP; HEIC only if Imagick has a HEIC
codec. Images are re-encoded (metadata stripped, EXIF orientation applied), downscaled to `LAB_MAX_IMAGE_DIMENSION`
and stored on the private `local` disk under random names. `php artisan lab:prune` (scheduled hourly; needs
`php artisan schedule:run` in cron) deletes projects not saved for `LAB_RETENTION_DAYS`.

## AI

One provider does every AI job. `AI_PROVIDER` selects it; the class is `App\Services\Ai\AiProvider`
(`recognise()` for screenshots, `text()` for the two text helpers).

- `mock` – returns `resources/lab/mock-extraction.json` without looking at the picture. The text helpers are off.
- `openai` – Chat Completions with the images and `resources/lab/vision-prompt.txt`. `OPENAI_BASE_URL` can point
  at any service that speaks the same format.
- `gemini` – `generateContent` with the images as inline data.

A misconfigured or unknown provider returns `ai_not_configured`; it never falls back to the mock. The backend
returns the model's JSON untouched; the frontend validates it. The same provider answers `/api/ai/explain` and
`/api/ai/scene`.

AI never runs the simulation and never changes a program. Every AI call counts against
`LAB_MAX_AI_REQUESTS_PER_HOUR` (per session; an IP gets 6×), and recognitions are capped at
`LAB_MAX_CONCURRENT_ANALYSES` at a time.
