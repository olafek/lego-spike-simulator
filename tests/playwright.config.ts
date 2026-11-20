import { defineConfig, devices } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// End-to-end tests run the REAL Laravel backend and the REAL frontend, with:
//  - their own SQLite database (backend/database/e2e.sqlite), wiped on every run
//  - a throw-away lab password
//  - the offline mock picture reader, so the tests never call (or pay for) an AI service
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BACKEND_PORT = 8010
const FRONTEND_PORT = 5183

export const E2E_PASSWORD = 'e2e-only-password-7431'

const backendEnv = {
  APP_ENV: 'local',
  APP_DEBUG: 'false',
  DB_CONNECTION: 'sqlite',
  DB_DATABASE: resolve(root, 'backend/database/e2e.sqlite'),
  LAB_ACCESS_PASSWORD: E2E_PASSWORD,
  LAB_LOGIN_MAX_ATTEMPTS: '5',
  LAB_LOGIN_COOLDOWN_SECONDS: '5',
  LAB_MAX_AI_REQUESTS_PER_HOUR: '500',
  LAB_MAX_UPLOADS_PER_HOUR: '2000',
  LAB_MAX_PROJECTS_PER_SESSION_PER_HOUR: '2000',
  AI_PROVIDER: 'mock',
  LAB_DEMO_ENABLED: 'true',
}

const tablet = { ...devices['Desktop Chrome'], hasTouch: true, isMobile: false, deviceScaleFactor: 2 }

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 800 } }, testIgnore: /ipad/ },
    // iPad (10th gen) CSS viewport, touch enabled. Chromium engine: see docs/testing.md for WebKit.
    { name: 'ipad-landscape', use: { ...tablet, viewport: { width: 1180, height: 820 } }, testMatch: /ipad|journey|shots/ },
    { name: 'ipad-portrait', use: { ...tablet, viewport: { width: 820, height: 1180 } }, testMatch: /ipad|journey|shots/ },
  ],
  webServer: [
    {
      // PHP's built-in server with Laravel's router script (what `artisan serve` runs underneath);
      // started directly so the environment above reaches the app unchanged.
      command:
        `php -r "touch('database/e2e.sqlite');" && php artisan migrate:fresh --force && php artisan cache:clear && ` +
        `cd public && php -S 127.0.0.1:${BACKEND_PORT} ../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php`,
      cwd: resolve(root, 'backend'),
      env: backendEnv,
      url: `http://127.0.0.1:${BACKEND_PORT}/api/session`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'ignore',
    },
    {
      command: 'npm run dev -- --host 127.0.0.1',
      cwd: resolve(root, 'frontend'),
      env: { LAB_FRONTEND_PORT: String(FRONTEND_PORT), LAB_BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}` },
      url: `http://127.0.0.1:${FRONTEND_PORT}/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
