# Competition Table with a Photo Floor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A competition-size walled mat whose floor is a straightened photo of a real table, saved as a reusable "table" that any program can be put on.

**Architecture:** The frontend owns the scene (`mat: 'competition'`) and straightens the photo in the browser (a homography solved in `core`, pixels warped on a canvas); only the straightened mat rectangle is uploaded. The backend stores it as a `screenshots` row with `kind = 'mat'`, keeps program screenshots (`kind = 'program'`) separate through the model relation, and marks table projects with a real `is_table` column for listing and retention. The picture is display-only: the simulator is unchanged apart from the new mat size and one assumption line.

**Tech Stack:** Vue 3 + TypeScript + Pinia + Three.js + Zod, Laravel (PHP 8.3, GD), Vitest, PHPUnit, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-competition-table-design.md`

## Global Constraints

- Work on `master` (owner's instruction). Do not commit `CLAUDE.md` unless asked. Do not push without asking. Every commit message ends with `Claude-Session: https://claude.ai/code/session_01NPpemUC5yvsRfeTDm3pDrK`.
- Competition mat: 2362 × 1143 mm, one named constant, shown as "about 236 × 114 cm". Run limit becomes 150 s when a project goes onto it and still has the default 60 s.
- The original photo never reaches the server; only the straightened picture is uploaded. A photo the browser cannot decode is refused with: "This kind of photo cannot be opened here. Choose it on the iPad or iPhone, or save it as a JPEG first."
- Nothing from any real competition (artwork, season or organiser names) in code, fixtures, samples, docs or screenshots. Test and doc pictures come from a generated, made-up mat.
- The picture is labelled "≈ picture of the table" in the editor, and a run on it lists: "The floor picture is a straightened photo. Places on it are approximate."
- Program-screenshot code paths (list, order, limit, recognition, export) only ever see `kind = 'program'`.
- Every API error is `{ message, code }` with a child-readable message. Demo fencing applies to every new endpoint (registered inside the shared `$protected` closure).
- Simulation stays deterministic; `frontend/src/core` stays framework-free. Units in core: mm.
- Phone variants use `usePhone()` + `v-if`; touch targets ≥ 44 px; no sideways scroll. Layouts at ≥ 640 px that are not part of this feature must not change.
- E2E needs ports 8010 and 5183 free. Backend tests run from PowerShell (`php` is a Herd `.bat`).

## Review Focus

1. A mat corner that lies outside the photo (cut off by the frame): the warp still works and the missing area is plain floor colour → Task 4 unit test `maps points outside the source image`, Task 5 e2e drags one handle outside.
2. A very large phone photo (12 MP+): downscaled before warping, output never exceeds the server's image limit → Task 4 unit test `matPictureSize caps the long side`.
3. Old data: projects saved before this change (no `kind`, no `is_table`, `mat: 'classroom'`) still load, list and recognise → Task 1 schema test, Task 2 backend test `existing screenshots stay program screenshots`.
4. `use-table` races and misuse: the table was deleted, the target already has a picture, the source is not a table, or it is across the lab/demo fence → Task 3 backend tests.
5. Changing mat kind while a picture exists: buttons are locked, the picture is never stretched → Task 5 e2e `the mat kind is locked while a picture is on it`.

---

### Task 1: Competition mat in core, editor and renderer

**Files:**
- Modify: `frontend/src/core/scene.ts`, `frontend/src/core/simulate.ts` (lines ~251-257, 356, 370, 1169-1172), `frontend/src/core/project.ts` (SceneSchema `mat`), `frontend/src/render/SceneRenderer.ts` (~637-661), `frontend/src/components/MissionEditor.vue` (~51-54, 134, 692-698), any other `matBounds()` caller (`grep -rn matBounds frontend/src`)
- Test: `frontend/src/core/simulate.test.ts`, new `frontend/src/core/scene.test.ts`, new `frontend/src/core/project.test.ts`

**Interfaces:**
- Produces: `type MatKind = 'open' | 'classroom' | 'competition'` (`Scene.mat: MatKind`); `COMPETITION_MAT = { widthMm: 2362, lengthMm: 1143 }`; `isWalled(mat: MatKind): boolean`; `matSize(mat: MatKind): { widthMm: number; lengthMm: number } | null`; `matBounds(mat: MatKind): { x0, x1, y0, y1 } | null` moved to `scene.ts` (x centred, `y0 = -250`, `y1 = lengthMm - 250`; `null` for `'open'`) and re-exported from `simulate.ts`; `setMat(d: ProjectData, mat: MatKind): void` in `project.ts` (sets `d.scene.mat`; when `mat === 'competition'` and `d.settings.maxSeconds === 60`, sets it to 150).

- [ ] **Step 1: Failing unit tests**

```ts
// scene.test.ts
it('gives the competition mat its size and bounds', () => {
  expect(matSize('competition')).toEqual({ widthMm: 2362, lengthMm: 1143 })
  expect(matBounds('competition')).toEqual({ x0: -1181, x1: 1181, y0: -250, y1: 893 })
  expect(matBounds('classroom')).toEqual({ x0: -1000, x1: 1000, y0: -250, y1: 850 })
  expect(matBounds('open')).toBeNull()
  expect(isWalled('competition')).toBe(true)
  expect(isWalled('open')).toBe(false)
})
// project.test.ts
it('accepts the competition mat and still reads older projects', () => {
  const d = newProjectData()
  d.scene.mat = 'competition'
  expect(parseProjectData(JSON.parse(JSON.stringify(d))).scene.mat).toBe('competition')
  const old = JSON.parse(JSON.stringify(newProjectData())); old.scene.mat = 'classroom'
  expect(parseProjectData(old).scene.mat).toBe('classroom')
})
it('gives a competition table the length of a match', () => {
  const d = newProjectData(); setMat(d, 'competition')
  expect(d.settings.maxSeconds).toBe(150)
  const e = newProjectData({ settings: { ...DEFAULT_SETTINGS, maxSeconds: 90 } }); setMat(e, 'competition')
  expect(e.settings.maxSeconds).toBe(90)
})
// simulate.test.ts (use the file's existing helpers for building a setup)
it('stops the robot at the wall of a competition table', () => { /* start (0,0) heading 0, move forward 300 cm on mat 'competition'; final y < 893 and the result reports blocked/stuck */ })
```

- [ ] **Step 2:** `cd frontend && npx vitest run src/core` → the new tests FAIL (missing exports).
- [ ] **Step 3:** Implement the Interfaces. Replace every `=== 'classroom'` wall/bounds check with `isWalled(...)` / `matBounds(scene.mat)`. In `MissionEditor.vue` add a third button "Competition table" (`data-testid="mat-competition"`, existing two get `mat-open`, `mat-classroom`), all three calling `setMat`, and the note "Competition table: about 236 × 114 cm with a border wall."
- [ ] **Step 4:** `npx vitest run && npm run typecheck` → all PASS.
- [ ] **Step 5:** Commit "Competition-size mat with a border wall".

---

### Task 2: Mat picture storage (backend)

**Files:**
- Create: `backend/database/migrations/2026_11_23_000000_add_mat_pictures_and_tables.php` (both columns of Tasks 2 and 3), `backend/app/Http/Controllers/Api/MatImageController.php`, `backend/tests/Feature/MatImageTest.php`
- Modify: `backend/app/Models/Project.php`, `backend/app/Models/Screenshot.php`, `backend/app/Http/Controllers/Api/ProjectController.php` (duplicate, destroy), `backend/routes/web.php`

**Interfaces:**
- Produces: column `screenshots.kind` (`string(10)`, default `'program'`, indexed with `project_id`); column `projects.is_table` (boolean, default false, indexed). `Project::screenshots()` adds `->where('kind', 'program')`; `Project::matImage(): HasOne` (`kind = 'mat'`). `Project::toApi()` adds `'matImage' => ['id','url','width','height'] | null` and `'table' => bool`. Routes inside `$protected`: `POST projects/{id}/mat-image` → `MatImageController@store` (201, body = the `matImage` object), `DELETE projects/{id}/mat-image` → `destroy` (`{deleted:true}`). `MatImageController::copy(Project $from, Project $to): void` (static; replaces `$to`'s picture with a copy of `$from`'s file, or removes it when `$from` has none) for Task 3 and `duplicate`.

- [ ] **Step 1: Failing tests** in `MatImageTest.php` (same `setUp`/helpers style as `ProjectTest`):
  - `test_upload_shows_on_the_project_and_not_among_screenshots` – POST → 201; GET project: `matImage.url` matches `#/api/projects/{id}/screenshots/[0-9a-f]{24}/image#`, `screenshots` is `[]`; GET that url → 200 `image/*`.
  - `test_a_new_picture_replaces_the_old_one` – two uploads → different `matImage.id`; one `kind = 'mat'` row; the first file is gone from the fake disk.
  - `test_delete_removes_row_and_file`.
  - `test_it_does_not_count_against_the_screenshot_limit_or_reach_recognition` – `config(['lab.limits.screenshots_per_project' => 1])`; upload mat picture + one screenshot → both 201; `POST recognise` → `screenshotIds` has exactly the program screenshot.
  - `test_existing_screenshots_stay_program_screenshots` – a `Screenshot::create([...])` without `kind` has `kind === 'program'` after `refresh()` and is listed.
  - `test_duplicate_copies_the_mat_picture`; `test_uploads_use_the_upload_quota_and_size_limit` (`lab.limits.upload_mb`, `uploads_per_hour`); `test_it_needs_the_lab_session` (401 without `signIn`); `test_demo_visitor_cannot_touch_a_lab_project_picture` (404 under `/demo/api` for a lab project id, with `lab.demo.enabled`).
- [ ] **Step 2:** `php artisan test --filter=MatImageTest` → FAIL (404 routes).
- [ ] **Step 3:** Implement. Reuse `ImageProcessor::process` and the validation/size checks of `ScreenshotController::store` (extract the shared "read and validate the uploaded image" part into a small private-static or trait helper rather than copying it). `ScreenshotController::persist` gains a `string $kind = 'program'` parameter. Deleting a project keeps removing everything (rows cascade; the directory is deleted by the model hook).
- [ ] **Step 4:** `php artisan test` → all PASS (78 + new).
- [ ] **Step 5:** Commit "Mat pictures: one straightened table photo per project".

---

### Task 3: Tables (backend)

**Files:**
- Modify: `backend/app/Http/Controllers/Api/ProjectController.php` (index, store), `backend/app/Models/Project.php` (toListItem, cast), `backend/routes/console.php` (prune), `backend/routes/web.php`, `backend/app/Http/Controllers/Api/MatImageController.php`
- Test: `backend/tests/Feature/TableTest.php`

**Interfaces:**
- Consumes: `is_table`, `MatImageController::copy` (Task 2).
- Produces: `POST /projects { table: true }` sets `is_table` (only at creation; `PUT` ignores it). `GET /projects?tables=1` → all tables, newest first, no 50 limit; plain `GET /projects` unchanged (still includes tables). List items add `table: bool` and `matImageUrl: string|null`. `POST /projects/{id}/use-table { tableId }` → copies the table's picture into `{id}`, returns the target project (`toApi()` plus `tableData`: the table's decoded `data`, so the frontend can copy the scene in one round trip). Errors: unknown/invisible table or target → 404 `not_found`; source is not a table → 422 `not_a_table` "That is not a saved table."; `tableId === id` → 422 `validation`. `lab:prune` skips rows with `is_table` and `demo_owner IS NULL`.

- [ ] **Step 1: Failing tests** in `TableTest.php`: `test_a_table_is_created_listed_and_flagged`; `test_tables_list_is_not_cut_off_at_fifty` (51 ordinary newer projects + 1 old table → `?tables=1` returns it); `test_update_cannot_turn_a_project_into_a_table`; `test_use_table_copies_the_picture_and_returns_the_table_data`; `test_use_table_replaces_an_existing_picture`; `test_use_table_with_a_table_without_picture_removes_the_picture`; `test_use_table_refuses_a_deleted_table_a_non_table_and_itself`; `test_demo_visitor_cannot_use_a_lab_table_or_another_visitors_table`; `test_prune_keeps_old_lab_tables_and_removes_old_demo_tables` (travel past `lab.retention_days` / `lab.demo.retention_hours`, run `lab:prune`).
- [ ] **Step 2:** `php artisan test --filter=TableTest` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `php artisan test` → all PASS.
- [ ] **Step 5:** Commit "Tables: saved, listed, kept by the cleanup, and copied onto a project".

---

### Task 4: Straightening maths (core)

**Files:**
- Create: `frontend/src/core/homography.ts`, `frontend/src/core/homography.test.ts`

**Interfaces:**
- Produces: `type Pt = { x: number; y: number }`; `type Quad = [Pt, Pt, Pt, Pt]` (top-left, top-right, bottom-right, bottom-left); `isProperQuad(q: Quad): boolean` (convex, not self-crossing, area > 0); `solveHomography(from: Quad, to: Quad): number[] | null` (9 numbers, row-major, `null` when the system is singular); `mapPoint(h: number[], p: Pt): Pt`; `matPictureSize(mat: { widthMm: number; lengthMm: number }, maxDimension: number): { width: number; height: number }` (1 px per mm, both sides scaled down together so the longer side ≤ `maxDimension`, rounded).

- [ ] **Step 1: Failing tests:** `identity mapping`; `maps the four corners exactly` (a skewed quad → rectangle 2362×1143, each corner within 1e-6); `maps points outside the source image` (a `from` corner at `x = -200` still solves and maps); `mapPoint of the quad's diagonal crossing lands on the rectangle's centre`; `refuses a crossed quad and a collapsed quad` (`isProperQuad` false); `matPictureSize caps the long side` (`{2362,1143}`, 4096 → `{2362,1143}`; 1000 → `{1000, 484}`).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement (8×8 linear solve by Gaussian elimination with partial pivoting; no dependency). **Step 4:** PASS + typecheck. **Step 5:** Commit "Straightening maths for table photos".

---

### Task 5: Table picture in the Mat step and the simulator

**Files:**
- Create: `frontend/src/lib/straighten.ts`, `frontend/src/components/MatPicturePanel.vue`, `tests/make-table-fixture.mjs`, `fixtures/sample-table.png` (generated), `tests/e2e/table.spec.ts`
- Modify: `frontend/src/lib/api.ts`, `frontend/src/stores/lab.ts`, `frontend/src/components/MissionEditor.vue`, `frontend/src/render/SceneRenderer.ts`, `frontend/src/components/SimViewport.vue`, `frontend/src/core/simulate.ts` (assumption), `tests/package.json` (script `table-fixture`)

**Interfaces:**
- Consumes: Task 1 (`matBounds`, `matSize`, `isWalled`), Task 2 API, Task 4 maths.
- Produces: `api.uploadMatImage(id, blob): Promise<MatImageInfo>`, `api.deleteMatImage(id)`; `MatImageInfo = { id, url, width, height }`; `ProjectRecord.matImage`, `ProjectRecord.table`. Lab store: `matImage: Ref<MatImageInfo | null>`, `isTable: Ref<boolean>`, `setMatPicture(blob: Blob): Promise<void>`, `removeMatPicture(): Promise<void>`. `straightenPhoto(img: HTMLImageElement | ImageBitmap, corners: Quad, size: { width; height }, fill: string): Promise<Blob>` (JPEG; inverse-maps every output pixel with bilinear sampling; outside the source → `fill`); `openPhoto(file: File, maxDimension: number): Promise<HTMLImageElement>` (rejects with the Global Constraints message when the browser cannot decode). `RendererSetup.matImageUrl: string | null`. `SimOptions.floorPicture: boolean` → adds the assumption line. Test ids: `mat-picture-panel`, `mat-picture-choose` (file input), `corner-0`…`corner-3`, `mat-picture-preview`, `mat-picture-use`, `mat-picture-back`, `mat-picture-remove`, `mat-picture` (the `<image>` in the editor SVG), `mat-picture-chip`.
- Fixture: `make-table-fixture.mjs` draws a made-up mat (pale background, a 10 cm grid, a red 200 mm square centred on the mat centre, a blue 200 mm square centred 400 mm left and 250 mm up from centre, a black bar) and projects it into a 1600×1200 photo of a grey floor with the mat corners at exactly (15%, 20%), (85%, 12%), (95%, 85%), (5%, 90%) of the photo. It prints those fractions.

- [ ] **Step 1: Generate the fixture** (`npm run table-fixture` in `tests/`), look at it once.
- [ ] **Step 2: Failing e2e tests** in `table.spec.ts` (desktop project):
  - `a table photo becomes the floor` – open sample `drive-30`, go to the Mat step, `mat-competition`, set `fixtures/sample-table.png` on `mat-picture-choose`, drag each `corner-N` to its fraction of the photo's bounding box, `mat-picture-use`; expect `mat-picture` visible and `mat-picture-chip` to contain "≈"; fetch the `href` of `mat-picture` in the page, draw it on a canvas and expect the pixel at the centre to be red-ish (`r > 180, g < 90, b < 90`) and the pixel at (centre − 400 mm, centre − 250 mm) blue-ish; go to the simulator and expect `assumptions` (opened) to contain "straightened photo".
  - `a corner can sit outside the photo` – drag `corner-3` 60 px left of the photo's left edge; `mat-picture-use` still succeeds.
  - `the mat kind is locked while a picture is on it` – `mat-open` and `mat-classroom` are disabled and the hint "Remove the picture to change the mat" shows; after `mat-picture-remove` they are enabled and `mat-picture` is gone.
  - `a photo the browser cannot open is refused` – a text file renamed `photo.heic` → an alert containing "cannot be opened here"; no request to `/mat-image` is made.
- [ ] **Step 3:** run `npx playwright test e2e/table.spec.ts --project=desktop` → FAIL.
- [ ] **Step 4:** Implement. Panel states: empty → choose; corners (photo scaled to fit, four 44 px handles that can leave the photo by up to 25% of its size, a magnifier following the active handle, the outline drawn between handles, "Looks right" disabled with a message while `isProperQuad` is false); preview (straightened picture with grid) with `mat-picture-use` / `mat-picture-back`; has-picture → thumbnail + `mat-picture-remove`. The panel only shows on walled mats. Editor: `<image data-testid="mat-picture">` covering `matBounds`, under the grid lines. Renderer: a textured plane on the mat (texture loaded with `THREE.TextureLoader`, `colorSpace = SRGBColorSpace`), grid lines drawn lighter over a picture; `matImageUrl` is part of the grid cache key. `SimViewport` passes `lab.matImage?.url`; `resimulate` passes `floorPicture: !!matImage`.
- [ ] **Step 5:** run the spec → PASS; `npm run typecheck && npx vitest run` → PASS; `npx playwright test --project=desktop --project=ipad-landscape --project=ipad-portrait --project=iphone-portrait` → all PASS.
- [ ] **Step 6:** Commit "Table picture: straighten a photo in the browser and show it as the floor".

---

### Task 6: Tables on Home and "Use a table"

**Files:**
- Create: `frontend/src/components/TablePicker.vue`, `tests/e2e/ipad-table.spec.ts`
- Modify: `frontend/src/lib/api.ts`, `frontend/src/lib/start.ts`, `frontend/src/views/HomeView.vue`, `frontend/src/views/LabView.vue`, `frontend/src/components/MissionEditor.vue`, `frontend/src/stores/lab.ts`, `tests/e2e/table.spec.ts`

**Interfaces:**
- Consumes: Task 3 API, Task 5 store.
- Produces: `api.tables(): Promise<ProjectSummary[]>`, `api.createProject(name, data, table?)`, `api.useTable(id, tableId): Promise<ProjectRecord & { tableData: unknown }>`; `ProjectSummary.table`, `.matImageUrl`; `startTable(): Promise<string>` (creates `{ table: true }` project named "My table", `scene.mat = 'competition'` via `setMat`, `step: 'mission'`); lab store `useTable(tableId: string): Promise<void>` (calls the API, then copies `scene` from the parsed `tableData` with `setMat` rules, sets `matImage`, remembers the id in `localStorage['spike-lab-last-table']`). Test ids: `tables-section`, `new-table`, `table-card`, `use-table`, `table-option`, `use-table-confirm`.

- [ ] **Step 1: Failing e2e tests** (append to `table.spec.ts`):
  - `a table is made once and a program is put on it` – Home `new-table` → lands on the Mat step with `mat-picture-panel` open, no `step-check` button; add the fixture picture as in Task 5; `add-obstacle`; rename to "Practice table"; go Home → `table-card` shows "Practice table"; open sample `drive-30` → Mat step → `use-table` → `table-option` "Practice table" → picture and one `obj-obstacle` present, mat is competition; simulator run finishes and its assumptions mention the picture; reopen the table from Home → it still has exactly one obstacle after the program's mat is cleared ("Clear everything") – the table is unchanged.
  - `using a table asks before replacing a mat that is not empty` – program with one object → `use-table` → `use-table-confirm` appears.
  - `the table used last is offered first`.
  And `ipad-table.spec.ts` (runs on both iPads and the iPhone): corner step and picker fit – no sideways scroll, 44 px targets (reuse the two helpers from `ipad.spec.ts` by moving them into `helpers.ts`), all four `corner-N` handles and `mat-picture-use` reachable.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement (Home "Tables" section between samples and recent projects; table cards open the table; a table shows three steps: Robot, Mat, Go). **Step 4:** all four Playwright projects PASS; typecheck + Vitest PASS.
- [ ] **Step 5:** Commit "Tables on the home screen, and Use a table in the Mat step".

---

### Task 7: Docs, screenshots and full check

**Files:**
- Modify: `README.md`, `docs/tour.md`, `docs/architecture.md`, `docs/setup.md`, `backend/README.md`, `CLAUDE.md` (not committed), `tests/e2e/shots.spec.ts` (two extra shots: table corners, table in 3D)
- Create: `docs/screenshots/table-corners.png`, `docs/screenshots/table-3d.png` (from the made-up fixture mat)

- [ ] **Step 1:** Run everything: `frontend` typecheck + `npm test`; `backend` `php artisan test`; `tests` `npm test`. Note the three counts.
- [ ] **Step 2:** Update the docs: README (what it can do; honest-about list: the picture is only as exact as the photo), tour (a "Your own table" section with the two screenshots), architecture (mat picture storage, `kind`, `is_table`, straightening in the browser, why the original photo is never uploaded), setup (retention note: lab tables are kept), backend README (API table), test counts everywhere they are quoted.
- [ ] **Step 3:** Commit "Docs: your own table".
