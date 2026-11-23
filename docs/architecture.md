# Architecture

```
iPad / browser ── Vue SPA ──────────────────────────────────────────────┐
  views (Gate, Home, Lab: Check → Robot → Mat → Go, Projects, Settings)  │  session cookie + XSRF
  stores/lab.ts  (project document, SimResult, playback cursor)          ▼
  core/  ← framework-free TypeScript: IR, catalogue, simulator       Laravel  /api/*
  render/ ← Three.js, displays a Frame, never computes motion          ├─ LabAuth middleware (shared password session)
                                                                       ├─ projects + private screenshots (SQLite/MySQL)
                                                                       ├─ UsageLimiter (quotas, concurrency)
                                                                       └─ AiProvider → mock | OpenAI | Gemini
                                                                          (reads screenshots, explains blocks, suggests mats)
```

## The simulator (`frontend/src/core`)

| File | Role |
|---|---|
| `ir.ts` | Program IR v1 (stacks → blocks → nested children, typed params, conditions, expressions), strict Zod schema, and `normaliseRecognition()` which turns raw AI JSON into a valid program. |
| `catalog.ts` | Every supported block: sentence template, parameters, category, and how faithfully it is simulated. Drives the editor, the validator and the interpreter. |
| `robots.ts`, `attachmentGeometry.ts` | Data-driven robots and tools. The same rectangles feed collision and the 3D model. |
| `scene.ts`, `missionPresets.ts`, `sceneProposal.ts` | Mat objects, goals, presets, validation of AI mat suggestions. |
| `simulate.ts` | The engine + interpreter. `simulate(setup) → SimResult`. |
| `timeline.ts` | Step boundaries and the child-facing measurements. |
| `project.ts` | The saved project document and its schema. |

### Determinism and rewind

`simulate()` runs the whole program up front with a fixed step (`dt = 0.01 s`, independent of the frame rate)
and stores a complete snapshot (`Frame`) per step: pose, wheel travel, every motor angle, every tool joint,
every object (position, rotation, height, carried), variables, sensor readings, light matrix and the ids of
the blocks running in each parallel stack. Playback, the timeline slider, "next/previous instruction" and
camera changes only pick a frame, so **stepping backwards restores the full state exactly** and nothing in the
UI can mutate the simulation. Editing the program simply runs `simulate()` again (a few milliseconds).

- Units: millimetres, radians, seconds. Heading is clockwise from "up the mat", matching the hub's yaw sign.
- Motors follow a ramped speed profile and **land exactly on their target angle**, so a 300 mm command ends at
  300.000000 mm. Paired wheels use proportional speed and ramp, so arcs are exact; pose integration uses the
  closed-form arc.
- Each "when program starts" stack is a generator; all stacks advance in the same step (true parallelism).
  `start …` blocks return immediately, `… for` blocks wait.
- Safety: whole-run limit (default 60 s), per-`wait until` limit (20 s), zero-time loop guard, mechanical
  stall detection for tools. A cutoff is reported in words, never hidden.
- A program with an unreadable value or condition is **not run** (`status: 'invalid'`). Unsupported blocks are
  skipped and listed.

### Movement semantics (documented assumptions)

- `move ↑ for N cm`: wheel motor degrees = `N / (cm per motor rotation) × 360`. "cm per rotation" comes from a
  `set 1 motor rotation` block if present; otherwise *ideal* calibration uses the robot's real wheel
  circumference (distances exact) and *hardware* calibration uses the SPIKE default 17.5 cm (distances then
  differ slightly, and the UI marks them **≈ estimated**).
- Movement pair convention: left motor counter-clockwise = forward. Physics always uses the robot's real
  wheel ports, so a program that sets the wrong pair visibly does not drive (and says why).
- Steering −100…100: 0 straight, ±50 pivots on one wheel, ±100 spins on the spot; the amount applies to the
  faster wheel.
- `turn … by N° heading` is a SPIKE Lab helper block (an ideal spin computed from track width).
  `move … for N degrees` and `motor … for N degrees` are **motor** degrees and are never treated as heading.
- 100 % speed = the motor's no-load speed (medium 1110 °/s, large 1050 °/s); acceleration 2500 °/s² is an estimate.
  Timing is therefore approximate; distances and angles are not affected.

### Objects and tools (approximations, also shown in the UI)

A small 2D solver (separating-axis test) keeps one authoritative world: the robot is driven by its wheels,
movable objects are pushed out of the robot's shapes, static objects block. If the robot would end inside
something immovable the step is undone – the wheels keep turning and the run reports "stuck".
Objects slide without rotating or tipping; balls roll on with an estimated deceleration.
A passive fork only pushes. A lift arm picks up liftable things touching its fork when it rises above 12°
and carries them; a grabber holds what is between its jaws when they close on it. Colour sensor = colour under
one point; distance sensor = one forward ray (5–200 cm); force sensor = pressed / not pressed.

## Screen sizes

The same views serve desktop, iPad and iPhone. Below 640 px wide (a phone held upright) a few components
render a phone variant: one top row with a ☰ menu (`LabMenu.vue`) instead of the app header, the readouts as
one line under the picture, one camera button and one playback row. `usePhone()` in `src/lib/phone.ts`
mirrors Tailwind's `sm` breakpoint, and components switch with `v-if` rather than hiding with CSS, so every
test id exists once on the page. The simulator viewport is never re-created when the layout switches, so
turning the phone keeps the run and the playback position.

## Tables and the mat picture

A competition table is a walled mat of about 236 × 114 cm (`Scene.mat = 'competition'`; sizes and bounds for
every mat kind come from `matSize()` / `matBounds()` in `core/scene.ts`). Runs on it may last 150 s.

Its floor can be a photo of the real table:

1. The browser opens the photo and the user marks the mat's four corners (`MatPicturePanel.vue`).
2. `core/homography.ts` solves the mapping between those corners and the mat rectangle; `lib/straighten.ts`
   looks every pixel of the mat up in the photo on a canvas. Nothing is sent to the server until this is done,
   so the original photo (which may show people) never leaves the device.
3. The straightened picture is uploaded to `POST /api/projects/{id}/mat-image` and stored as a `screenshots`
   row with `kind = 'mat'`. `Project::screenshots()` only returns `kind = 'program'`, so listing, limits,
   recognition and export never see it; `Project::matImage()` is the one mat picture.
4. The picture is display only: an `<image>` under the grid in the mat editor and a texture on the floor in
   the 3D view. The simulator ignores it, apart from adding one line to the run's assumptions.

A **table** is a project with the column `is_table` set at creation. `GET /api/projects?tables=1` lists them
all, and `lab:prune` never deletes a lab table (demo tables still expire). `POST /api/projects/{id}/use-table`
copies a table's picture onto a program and returns the table's document; the frontend then copies its scene.
The copy is independent, so a program can never change a saved table. A picture belongs to the mat kind it
was straightened for: the mat kind is locked while a picture is on it.

## The public demo

`/demo` (pages) and `/demo/api/*` (data) are the same app behind a different door, enabled by `LAB_DEMO_ENABLED`.
The `lab.demo` middleware gives each visitor a random owner id in their session, forces the offline AI
provider and applies the demo limits for that request only. A global scope on `Project` then does the fencing:
lab requests only see rows without an owner, a demo request only sees rows with its own. Screenshots are
always reached through their project, so the same rule covers the pictures. `App\Support\Demo` holds this
in one place; the frontend only switches its address prefix (`src/lib/demo.ts`).

## Screenshot recognition

1. Screenshots are stored privately (`storage/app/private`, re-encoded, EXIF stripped) and served only through
   the authenticated `/api/projects/{id}/screenshots/{sid}/image` route.
2. `POST /api/projects/{id}/recognise` sends them, in order, with `backend/resources/lab/vision-prompt.txt`
   to the configured `AiProvider` and returns the decoded JSON as `raw`.
3. The frontend validates `raw` with `normaliseRecognition()`: wrong overall shape → error, nothing changes;
   unknown block → "not supported" block; unreadable or out-of-range value → `null`/flag listed in `uncertain`.
   Nothing is guessed. The validated result is saved twice: `original` (never edited) and `program` (the child's copy).

### The AI provider

One interface, `App\Services\Ai\AiProvider`, is the only place the app talks to an AI service:

- `recognise(array $images, string $prompt): array` – read screenshots, return the decoded JSON.
- `text(string $system, string $user): string` – explain a block or suggest a mat.

`AI_PROVIDER` chooses the implementation, and that one provider does all three jobs:

| Provider | How it is called | Checked |
|---|---|---|
| `mock` | Returns `resources/lab/mock-extraction.json`; text helpers are switched off. | Automated tests |
| `openai` | `POST {OPENAI_BASE_URL}/chat/completions`; each image as a `data:` URL; JSON response format for screenshots. No temperature is sent. | Automated tests and a live call |
| `gemini` | `POST {GEMINI_BASE_URL}/models/{model}:generateContent`; images as `inline_data`; key in the `x-goog-api-key` header. | Automated tests with faked responses only – not yet tried against the real service |

`OPENAI_BASE_URL` can point at any service that speaks the OpenAI chat-completions format, which covers
many other hosted and local models. To add a different kind of provider, implement `AiProvider` and add one
line to the `match` in `AppServiceProvider`.

## API summary

`GET /api/session`, `POST /api/login`, `POST /api/logout` are open; everything else needs the session.
Projects: `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/{id}`, `POST …/duplicate`, `GET …/export`,
`POST /api/projects/import`. Screenshots: `POST …/screenshots` (`image`, optional `replaces`),
`PUT …/screenshots/order`, `DELETE …/screenshots/{sid}`, `GET …/screenshots/{sid}/image`.
Tables: `POST …/mat-image` (`image`), `DELETE …/mat-image`, `POST …/use-table` (`tableId`), `GET /api/projects?tables=1`.
AI: `POST …/recognise`, `POST /api/ai/explain`, `POST /api/ai/scene`. Diagnostics: `GET /api/usage`.
Errors are always `{ message, code }` with a child-friendly message. See `backend/README.md` for details.
