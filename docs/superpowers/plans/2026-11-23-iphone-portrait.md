# iPhone Portrait Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On phones held upright the simulator view gets about half the screen, with compact controls, while every layout at 640 px and wider stays exactly as it is.

**Architecture:** A shared `usePhone()` flag (matchMedia, mirrors Tailwind `sm` = 640 px) lets components render a phone variant with `v-if`, so each test id exists once in the DOM. The lab gets one top row (☰ + steps), the simulator gets a readout strip inside the view frame, a single camera button and a one-row playback bar. A new Playwright project `iphone-portrait` (390 × 844, touch) proves it.

**Tech Stack:** Vue 3 + TypeScript + Tailwind 4 (`max-sm:` / `sm:` variants), Pinia, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-iphone-portrait-design.md`

## Global Constraints

- Phone layout only below 640 px: Tailwind `max-sm:` and `PHONE_QUERY = '(max-width: 639.98px)'`. At 640 px and wider nothing changes (existing desktop / iPad tests must pass untouched).
- "≈ estimated", "🧱 stuck" and the not-saved warning stay visible on phones without a tap.
- Touch targets ≥ 44 px; the page never scrolls sideways.
- Reuse existing test ids for moved elements (`readout-moved`, `readout-turned`, `readout-position`, `move-readout`, `estimated-chip`, `camera-*`, `project-name`, `save-state`, `nav-projects`, `logout`, `demo-chip`). Render the phone or the wide variant with `v-if`, never both with CSS hiding (Playwright strict mode).
- No changes to `frontend/src/core`, the renderer or the backend.
- Work on branch `iphone-portrait`. Do not commit `CLAUDE.md` (untracked; the user's call). Every commit message ends with
  `Claude-Session: https://claude.ai/code/session_01NPpemUC5yvsRfeTDm3pDrK`.
- E2E needs ports 8010 and 5183 free; the config starts its own servers.

## Review Focus

1. Crossing 640 px on the simulator (phone turned sideways, window resized): layout switches, playback position is kept → Task 1 test `turning into a wide screen brings back the full controls`.
2. Long readouts (inches plus "≈ estimated"): the strip may wrap, the marker shows in full, no sideways scroll → Task 3 test `warnings stay visible with long inch readouts`.
3. Menus left open: ☰ and the camera list close on Escape and on a tap outside → Task 2 test `☰ closes on Escape and on a tap outside`, Task 3 test `readout details and camera menu`.
4. Demo visitors on a phone: ☰ shows the Demo chip and no Leave button → Task 2 test `demo on a phone`.
5. A save failing while ☰ is closed is still visible → Task 2 test `a failed save shows on the top row`.

---

### Task 1: Phone flag, phone test project, one-row playback

**Files:**
- Create: `frontend/src/lib/phone.ts`
- Create: `frontend/src/lib/speed.ts`, `frontend/src/lib/speed.test.ts`
- Modify: `frontend/src/stores/lab.ts:14` (`SPEEDS` moves to `lib/speed.ts`; re-export it from the store so existing imports keep working)
- Modify: `frontend/src/components/SimulateStep.vue` (playback block, template lines ~155–181)
- Modify: `tests/playwright.config.ts:46-51`
- Create: `tests/e2e/phone.spec.ts`

**Interfaces:**
- Produces: `PHONE_QUERY: string`, `usePhone(): Readonly<Ref<boolean>>` (one shared ref and one matchMedia listener for the whole app; `false` when `matchMedia` is missing). `SPEEDS: readonly number[] = [0.25, 0.5, 1, 2, 4]`, `nextSpeed(current: number): number`. Test id `speed-cycle`. Playwright project `iphone-portrait`.

- [ ] **Step 1: Create the branch and commit the spec and plan**

```bash
git switch -c iphone-portrait
git add docs/superpowers/specs/2026-11-23-iphone-portrait-design.md docs/superpowers/plans/2026-11-23-iphone-portrait.md
git commit -m "Spec and plan: iPhone portrait layout"
```

- [ ] **Step 2: Write the failing unit test** in `frontend/src/lib/speed.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { nextSpeed } from './speed'

describe('nextSpeed', () => {
  it('steps through the speeds in order and wraps around', () => {
    expect(nextSpeed(1)).toBe(2)
    expect(nextSpeed(2)).toBe(4)
    expect(nextSpeed(4)).toBe(0.25)
    expect(nextSpeed(0.25)).toBe(0.5)
    expect(nextSpeed(0.5)).toBe(1)
  })
  it('falls back to 1× for a speed that is not in the list', () => {
    expect(nextSpeed(3)).toBe(1)
  })
})
```

- [ ] **Step 3: Run it** – `cd frontend && npx vitest run src/lib/speed.test.ts` → FAIL (cannot resolve `./speed`).

- [ ] **Step 4: Implement `lib/speed.ts`** (`SPEEDS`, `nextSpeed`) and `lib/phone.ts` (`PHONE_QUERY`, `usePhone`); in `stores/lab.ts` replace the `SPEEDS` constant with `export { SPEEDS } from '@/lib/speed'` (plus an import if the store uses it).

- [ ] **Step 5: Run it** – same command → PASS. Then `npm run typecheck` → no errors.

- [ ] **Step 6: Add the Playwright project.** In `tests/playwright.config.ts` add
  `const phone = { ...devices['Desktop Chrome'], hasTouch: true, isMobile: true, deviceScaleFactor: 3 }`,
  the project `{ name: 'iphone-portrait', use: { ...phone, viewport: { width: 390, height: 844 } }, testMatch: /phone/ }`,
  and change the desktop project's `testIgnore` to `/ipad|phone/`.

- [ ] **Step 7: Write the failing e2e tests** in `tests/e2e/phone.spec.ts`

```ts
import { expect, test } from '@playwright/test'
import { login, openSample } from './helpers'

// Runs in the iphone-portrait project (390 × 844, touch).

test('simulator: playback is one row with a speed button that cycles', async ({ page }) => {
  await login(page)
  await openSample(page, 'seed-pod')
  const play = (await page.getByTestId('play').boundingBox())!
  for (const id of ['reset', 'step-prev', 'step-next', 'speed-cycle']) {
    const b = (await page.getByTestId(id).boundingBox())!
    expect(Math.abs(b.y + b.height / 2 - (play.y + play.height / 2)), `${id} is on the play row`).toBeLessThan(10)
  }
  await expect(page.getByTestId('speed-1')).toHaveCount(0)
  const speed = page.getByTestId('speed-cycle')
  await expect(speed).toHaveText('1×')
  await speed.tap()
  await expect(speed).toHaveText('2×')
  await speed.tap()
  await expect(speed).toHaveText('4×')
  await speed.tap()
  await expect(speed).toHaveText('0.25×')
})

test('turning into a wide screen brings back the full controls', async ({ page }) => {
  await login(page)
  await openSample(page, 'seed-pod')
  await page.getByTestId('step-next').tap()
  const before = await page.getByTestId('timeline').inputValue()
  expect(Number(before)).toBeGreaterThan(0)
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.getByTestId('speed-1')).toBeVisible()
  await expect(page.getByTestId('speed-cycle')).toHaveCount(0)
  await expect(page.getByTestId('timeline')).toHaveValue(before)
})
```

- [ ] **Step 8: Run them** – `cd tests && npx playwright test e2e/phone.spec.ts --project=iphone-portrait` → both FAIL (no `speed-cycle`).

- [ ] **Step 9: Implement the phone playback row** in `SimulateStep.vue`: `const phone = usePhone()`; the five speed buttons render `v-if="!phone"`; on phones one `btn btn-ghost px-3` button `data-testid="speed-cycle"` shows `{{ settings.speed }}×`, has `aria-label` "Playback speed {speed}×. Tap to change." and calls `lab.setSpeed(nextSpeed(settings.speed))`. The button row gets `max-sm:flex-nowrap max-sm:gap-1.5`; Play gets `max-sm:min-w-0 max-sm:flex-1 max-sm:px-3` (it keeps `btn-xl`, so it stays the biggest button).

- [ ] **Step 10: Run** the phone spec → PASS; then `npx playwright test --project=desktop --project=ipad-landscape --project=ipad-portrait` → all PASS (unchanged).

- [ ] **Step 11: Commit** – `git add frontend/src/lib tests/playwright.config.ts tests/e2e/phone.spec.ts frontend/src/stores/lab.ts frontend/src/components/SimulateStep.vue && git commit -m "Phone layout: one-row playback with a speed button that cycles"`

---

### Task 2: One top row in the lab, with ☰

**Files:**
- Create: `frontend/src/lib/dismiss.ts`, `frontend/src/lib/leave.ts`, `frontend/src/components/LabMenu.vue`
- Modify: `frontend/src/App.vue` (header `v-if`, logout → `leaveLab`), `frontend/src/views/LabView.vue` (top row), `frontend/src/stores/lab.ts` (add `saveText`)
- Test: `tests/e2e/phone.spec.ts`

**Interfaces:**
- Consumes: `usePhone()` (Task 1).
- Produces: `useDismiss(open: Ref<boolean>, ...inside: Ref<HTMLElement | null>[]): void` – sets `open` to false on Escape and on a `pointerdown` outside every `inside` element; listeners only while open. `leaveLab(router: Router): Promise<void>` – the body of today's `logout()` in `App.vue` (saveNow → session.logout → lab.reset → replace to `login`). Lab store getter `saveText: ComputedRef<string>` = today's label (`'✓ saved' | 'saving…' | '⚠️ not saved'`). Test ids `lab-menu`, `lab-menu-panel`, `nav-home`, `nav-settings`, `save-warning`.

- [ ] **Step 1: Write the failing tests** (append to `phone.spec.ts`)

```ts
test('lab: one top row, with the project and navigation behind ☰', async ({ page }) => {
  await login(page)
  await openSample(page, 'seed-pod')
  await expect(page.getByTestId('nav-projects')).toHaveCount(0)
  const menu = page.getByTestId('lab-menu')
  const m = (await menu.boundingBox())!
  const s = (await page.getByTestId('step-simulate').boundingBox())!
  expect(Math.abs(m.y - s.y)).toBeLessThan(10)
  expect(m.y + m.height).toBeLessThan(80)
  await menu.tap()
  await expect(page.getByTestId('lab-menu-panel')).toBeVisible()
  await expect(page.getByTestId('project-name')).toHaveValue('Big seed pod')
  expect((await page.getByTestId('project-name').boundingBox())!.width).toBeGreaterThanOrEqual(250)
  await expect(page.getByTestId('save-state')).toContainText('saved')
  await page.getByTestId('nav-projects').tap()
  await expect(page).toHaveURL(/\/projects$/)
})

test('lab: ☰ closes on Escape and on a tap outside', async ({ page }) => {
  await login(page)
  await openSample(page, 'seed-pod')
  await page.getByTestId('lab-menu').tap()
  await expect(page.getByTestId('lab-menu-panel')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('lab-menu-panel')).toHaveCount(0)
  await page.getByTestId('lab-menu').tap()
  await page.getByTestId('goal-banner').tap()
  await expect(page.getByTestId('lab-menu-panel')).toHaveCount(0)
})

test('lab: a failed save shows on the top row without opening ☰', async ({ page }) => {
  await login(page)
  await openSample(page, 'seed-pod')
  await page.route('**/api/projects/*', (r) => (r.request().method() === 'PUT' ? r.abort() : r.continue()))
  await page.getByTestId('speed-cycle').tap()
  await expect(page.getByTestId('save-warning')).toBeInViewport({ timeout: 5_000 })
})

test('demo on a phone: ☰ shows Demo and has no Leave button', async ({ page }) => {
  await page.goto('/demo')
  await page.getByTestId('sample-seed-pod').tap()
  await expect(page.getByTestId('simulate-step')).toBeVisible()
  await page.getByTestId('lab-menu').tap()
  await expect(page.getByTestId('demo-chip')).toBeVisible()
  await expect(page.getByTestId('logout')).toHaveCount(0)
})
```

- [ ] **Step 2: Run** `npx playwright test e2e/phone.spec.ts --project=iphone-portrait` → the four new tests FAIL (no `lab-menu`).

- [ ] **Step 3: Implement.**
  - `lib/dismiss.ts`, `lib/leave.ts` and the store's `saveText` as in Interfaces; `App.vue` calls `leaveLab(router)`.
  - `App.vue`: the header renders only when `authed && !(phone && route.name === 'lab')`. Other pages keep their header on phones.
  - `LabMenu.vue` (no props): the ☰ button `lab-menu` (`btn btn-ghost btn-sm`, `aria-label="Menu"`, `aria-expanded`), and when open the panel `lab-menu-panel`, positioned under the row (`absolute left-2 right-2`, `card`, above the stage). Contents, in order: home link `nav-home` (RobotFace + "SPIKE Lab"), `demo-chip` when `DEMO`, the project name input `project-name` (same attributes and `@change` as LabView's today, full width), the `save-state` chip using `lab.saveText`, Projects `nav-projects`, the sound toggle (same as `App.vue`), Settings `nav-settings`, and Leave `logout` (not in `DEMO`) calling `leaveLab`. Closes via `useDismiss` and on any route change.
  - `LabView.vue`: in the top row, `v-if="!phone"` keeps today's name input, save chip and retry button; otherwise `<LabMenu />`. The row gets `max-sm:pt-2`. Below the row, phone only: `<p v-if="phone && lab.saveState === 'error'" class="notice notice-warn …" role="alert" data-testid="save-warning">⚠️ Not saved. <button …>Try saving again</button></p>` (button calls `lab.saveNow()`).

- [ ] **Step 4: Run** the phone spec → all PASS; `cd frontend && npm run typecheck` → no errors.

- [ ] **Step 5: Run** `cd tests && npx playwright test --project=desktop --project=ipad-landscape --project=ipad-portrait` → all PASS.

- [ ] **Step 6: Commit** – `git commit -am "Phone layout: one top row in the lab with a ☰ menu"` (add the new files first).

---

### Task 3: Readout strip, camera button, bigger view

**Files:**
- Modify: `frontend/src/components/SimulateStep.vue` (stage section, template lines ~104–152)
- Modify: `tests/playwright.config.ts` (`iphone-portrait` `testMatch` → `/ipad|phone/`)
- Test: `tests/e2e/phone.spec.ts`

**Interfaces:**
- Consumes: `usePhone()` (Task 1), `useDismiss()` and test id `nav-settings` (Task 2).
- Produces: test ids `camera-menu`, `readout-details`; phone `readouts` strip reusing `readout-moved`, `readout-turned`, `readout-position`, `estimated-chip`.

- [ ] **Step 1: Write the failing tests** (append to `phone.spec.ts`)

```ts
test('simulator: the view gets almost half the screen', async ({ page }) => {
  await login(page)
  await openSample(page, 'seed-pod')
  const canvas = (await page.getByTestId('sim-canvas').boundingBox())!
  expect(canvas.height).toBeGreaterThanOrEqual(380) // 45% of 844
  expect(canvas.width).toBeGreaterThanOrEqual(350)
  for (const id of ['play', 'step-next', 'readout-moved', 'camera-menu']) await expect(page.getByTestId(id)).toBeInViewport()
  const blocks = (await page.getByRole('complementary', { name: 'Program and results' }).boundingBox())!
  expect(844 - blocks.y, 'blocks stay visible under the stage').toBeGreaterThanOrEqual(160)
})

test('simulator: readout details and camera menu', async ({ page }) => {
  await login(page)
  await openSample(page, 'seed-pod')
  await expect(page.getByTestId('move-readout')).toHaveCount(0)
  await page.getByTestId('readout-details').tap()
  await expect(page.getByTestId('move-readout')).toContainText('Asked: 20 cm')
  await page.getByTestId('readout-details').tap()
  await expect(page.getByTestId('move-readout')).toHaveCount(0)

  await expect(page.getByTestId('camera-orbit')).toHaveCount(0)
  await page.getByTestId('camera-menu').tap()
  await page.getByTestId('camera-orbit').tap()
  await expect(page.getByTestId('camera-orbit')).toHaveCount(0)
  await expect(page.getByTestId('camera-menu')).toHaveAttribute('aria-label', /3D/)
  await page.getByTestId('camera-menu').tap()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('camera-top')).toHaveCount(0)
})

test('simulator: warnings stay visible with long inch readouts', async ({ page }) => {
  await login(page)
  await openSample(page, 'seed-pod')
  const url = page.url()
  await page.getByTestId('lab-menu').tap()
  await page.getByTestId('nav-settings').tap()
  // leaving the lab saves too, so wait for the save that carries the new calibration
  const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && !!r.request().postData()?.includes('"calibration":"hardware"'))
  await page.getByTestId('calibration-hardware').tap()
  await saved
  await page.goto(url)
  await expect(page.getByTestId('simulate-step')).toBeVisible()
  await page.getByTestId('view-options').tap()
  await page.getByTestId('unit-in').tap()
  await expect(page.getByTestId('estimated-chip')).toBeInViewport()
  await expect(page.getByTestId('estimated-chip')).toHaveText('≈ estimated')
  await expect(page.getByTestId('readout-position')).toContainText(' in')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
```

- [ ] **Step 2: Run** the phone spec → the three new tests FAIL (canvas ≈ 190–330 px high, no `camera-menu`).

- [ ] **Step 3: Implement** in `SimulateStep.vue`:
  - Today's two readout rows (`readouts`, `move-readout`) render `v-if="!phone"`, unchanged.
  - The view frame (border, rounded, overflow-hidden) becomes `flex flex-col`; an inner `relative min-h-0 flex-1` holds `SimViewport` and the existing overlays (cameras, celebration, `sim-blocked`). On phones a `shrink-0` strip `data-testid="readouts"` sits at the bottom of the frame, below the canvas: `Moved <b>…</b> · <b>…°</b> · <b>x …, y …</b>` (same `len()` / `round()` formatting, test ids `readout-moved` / `readout-turned` / `readout-position`), then `estimated-chip` ("≈ estimated") and the "🧱 stuck" chip when they apply. The strip may wrap to a second line; the markers keep their full text. At the end, the ⓘ button `readout-details` (`btn btn-ghost btn-sm`, `aria-label="More numbers"`, `aria-expanded`) toggles today's `move-readout` content as an overlay at the bottom of the inner area (`absolute inset-x-2 bottom-2`, card style).
  - Cameras on phones: one `camera-menu` button (current camera's icon; `aria-label` "Camera: {label}. Change view"; `aria-expanded`). The existing camera button group renders `v-if="!phone || cameraMenu"`; on phones as a vertical list with labels visible. Choosing a camera closes it; `useDismiss` closes it too.
  - Stage height on phones: `max-sm:h-[70dvh]` (keep `max-lg:h-[62dvh]` for 640–1023 px). Tune between 64 and 74 dvh until the size test passes on both limits (canvas ≥ 380 px, ≥ 160 px of blocks visible).
  - In `playwright.config.ts` set the `iphone-portrait` `testMatch` to `/ipad|phone/`, so the general layout checks in `ipad.spec.ts` (no sideways scroll, 44 px targets, Play ≥ 60 px) run on the phone too.

- [ ] **Step 4: Run** `cd tests && npx playwright test --project=iphone-portrait` → all PASS (phone spec and ipad spec).

- [ ] **Step 5: Run** `npx playwright test --project=desktop --project=ipad-landscape --project=ipad-portrait` → all PASS.

- [ ] **Step 6: Commit** – `git commit -am "Phone layout: readout strip, camera button and a bigger view"`

---

### Task 4: Robot card badges on phones

**Files:**
- Modify: `frontend/src/components/RobotStep.vue:115-117`
- Test: `tests/e2e/phone.spec.ts`

**Interfaces:**
- Produces: test ids `robot-suggested`, `robot-state` on the two card badges.

- [ ] **Step 1: Write the failing test**

```ts
test('robot step: the badges on a card do not overlap', async ({ page }) => {
  await login(page)
  await page.getByTestId('sample-screenshot').tap()
  await expect(page.getByTestId('program-panel')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('step-robot').tap()
  const a = (await page.getByTestId('robot-suggested').boundingBox())!
  const b = (await page.getByTestId('robot-state').boundingBox())!
  const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  expect(overlap).toBe(false)
})
```

- [ ] **Step 2: Run** → FAIL (no `robot-suggested` test id; after adding the ids, the boxes overlap).

- [ ] **Step 3: Implement:** wrap both badges in `<div class="flex w-full flex-wrap justify-between gap-1 sm:contents">`; the badges get `sm:absolute sm:left-2 sm:top-2` and `sm:absolute sm:right-2 sm:top-2` instead of the unconditional classes, and the preview's `mt-5` becomes `sm:mt-5`. At 640 px and wider the card is unchanged.

- [ ] **Step 4: Run** the phone spec → PASS, and the three wide projects → PASS.

- [ ] **Step 5: Commit** – `git commit -am "Phone layout: robot card badges no longer overlap"`

---

### Task 5: Full check and docs

**Files:**
- Modify: `README.md` ("Under the hood" test counts and device list), `docs/setup.md` ("Tests" counts)
- Modify (not committed): `CLAUDE.md` (Playwright project list)

- [ ] **Step 1: Run everything**
  - `cd frontend && npm run typecheck && npm test` → no type errors; all tests pass (note the count).
  - `cd backend && php artisan test` → 78 pass (unchanged).
  - `cd tests && npm test` → all projects pass (note the total).

- [ ] **Step 2: Update docs:** README "covered by N unit tests; 78 server tests and M browser tests (desktop, iPad landscape, iPad portrait, iPhone portrait)"; the same counts in `docs/setup.md`'s Tests block; add `iphone-portrait` (390 × 844, runs `ipad|phone` specs) to the project list in `CLAUDE.md`.

- [ ] **Step 3: Commit** – `git add README.md docs/setup.md && git commit -m "Docs: test counts and the iPhone portrait test project"`
