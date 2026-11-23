# Competition table with a photo floor – design

Status: approved · 2026-11-23 · Size: project · Piece 1 of 3

## Why
Children who use SPIKE Prime in a robotics competition practise on a large table: a printed mat with LEGO
mission models on it, a walled edge, and corner areas the robot starts from. At home there is no table.
SPIKE Lab can already drive a program on an empty grid or a small made-up mat; it cannot show the table the
child will actually stand at. The mat and the models change every season, so a table built into the app would
be out of date within a year – and the mat artwork belongs to the competition organiser, so it must never ship
with this public app.

The answer is "bring your own table": an adult photographs the real table once, the app straightens the photo
into a top-down floor at true size, and every program can then be run on it.

This is piece 1 of 3. Piece 2 adds practice stand-ins (push bar, press plate, pull ring, blocks with rough
heights), hook and ram tools, and a task checklist. Piece 3 is setting up one family's own table as data in
their own install. Neither is part of this design.

## Goals
- A competition-size mat with a border wall, alongside "Open floor" and "Classroom mat".
- A photo of the real table becomes the floor: upload, mark the mat's four corners, the app straightens it.
- The picture shows under the grid in the mat editor and in every simulator camera, at true scale, so
  "drive 40 cm" on screen is 40 cm on the photographed mat (as accurate as the photo allows).
- A finished table is saved once and reused: any program can be put on it in two taps.
- Works on iPad, iPhone (portrait) and desktop.

## Non-goals
- New kinds of objects, tools, or goals (piece 2). Existing mat objects can be placed on the picture.
- The colour sensor reading colours from the picture (a later step).
- Finding models or lines in the photo automatically (no AI, no image recognition here).
- Correcting lens distortion, stitching several photos, or more than one picture per project.
- Any built-in table, mat artwork, season name or organiser name in the code, samples, docs or demo.

## Anti-goals (a failure even if it works)
- Pretending the picture is exact. Positions on it are only as good as the photo and the four corners; the
  app must say so ("≈"), in the editor and in the run's list of assumptions.
- The original photo (which can show children and bystanders) being stored. Only the straightened mat
  rectangle is uploaded and kept.
- A table picture becoming reachable without the lab session, or across the lab/demo fence.
- A child's program run changing the saved table.

## Constraints
- Simulation stays deterministic and frame-rate independent; the picture is display only in this piece.
- The backend keeps treating `projects.data` as an opaque blob owned by the frontend.
- Pictures are stored privately, re-encoded with metadata stripped, and served only through the session-gated
  route, exactly like program screenshots. Demo rules (own projects only, tight limits, short retention) apply.
- Every API error is `{ message, code }` with a message a child can read.
- Units in `core` are millimetres. Touch targets ≥ 44 px, no sideways page scroll.
- Work happens on `master` (owner's instruction), with docs, test counts and screenshots updated.

## Approaches
Product:
- **A. Bring your own table (chosen by the owner).** A general tool; survives every new season; nothing of
  the organiser's ships with the app.
- **B. A built-in drawing of one season's table.** Rejected: puts a third party's design in a public app and
  demo, and is stale in a year.
- **C. A table-size mat with blocks only, no picture.** Rejected: cheapest, but a child cannot relate grey
  blocks on a blank grid to the real table.

Straightening the photo:
- **In the browser (chosen, my call).** The existing crop/rotate already works on a canvas in the browser;
  the warp is a small pure function plus a canvas. The server never sees the original photo, which serves the
  privacy anti-goal.
- **On the server.** Rejected: PHP's GD cannot do a perspective warp, Imagick is not guaranteed on the host,
  and the original photo would have to be uploaded.

## Design

### 1. The competition mat
`Scene.mat` gains `'competition'`. Size 2362 × 1143 mm with a border wall, built like the classroom mat's wall.
The size is the common competition mat size and is shown as "about 236 × 114 cm"; it is one named constant.
`matBounds` takes the mat kind. The robot's start position can be placed anywhere inside, as today.
When a project is put on a competition mat, the run limit (`settings.maxSeconds`) becomes 150 s if it still has
the default 60 s.

### 2. The mat picture
- One optional picture per project, for the two walled mats (not for the open floor).
- A picture belongs to the mat kind it was straightened for. While a project has a picture, the mat-kind
  buttons are locked, with the hint "Remove the picture to change the mat" (my call: no stretching, nothing
  extra to store).
- Stored as a row in `screenshots` with a new column `kind`: `'program'` (default, today's rows) or `'mat'`.
  Program screenshot listing, ordering, limits and recognition only ever see `kind = 'program'`.
- API (inside the gated group, so it exists under `/api` and `/demo/api`):
  - `POST /projects/{id}/mat-image` – multipart `image`; replaces any existing mat picture; counts as one
    upload for the quotas; same validation, re-encoding and size limits as screenshots.
  - `DELETE /projects/{id}/mat-image`.
  - The bytes are served by the existing `GET /projects/{id}/screenshots/{sid}/image`.
  - `GET /projects/{id}` adds `matImage: { id, url, width, height } | null`. `screenshots` is unchanged.
- Duplicating a project copies its mat picture. Deleting a project or its mat picture deletes the file.
- Export/import of project files does not carry the picture in this piece (the export says so).

### 3. Straightening (browser)
A "Table picture" panel in the Mat step:
1. **Choose a photo.** JPEG, PNG, WebP or HEIC. iPhone photos are HEIC, which most browsers other than
   Safari cannot open, so the app converts them itself, in the browser, with a decoder that is only
   downloaded when needed (added after the first build, at the owner's request). A file that still cannot
   be opened is refused with: "This kind of photo
   cannot be opened here. Choose it on the iPad or iPhone, or save it as a JPEG first." It is never sent to
   the server for conversion (my call: keeps the original photo off the server).
2. **Mark the four corners of the mat.** The photo is shown with four large handles (top-left, top-right,
   bottom-right, bottom-left), starting at the photo's corners. Handles can be dragged, and may sit outside
   the photo (a corner that was cut off). A magnified view follows the handle being moved. Text: "Put each
   dot on a corner of the mat."
3. **Preview and use.** The straightened picture is shown at the mat's proportions with the grid over it;
   "Use this picture" uploads it; "Move the corners" goes back.
- The warp maps the four corners onto the mat rectangle (a homography). Output: one pixel per millimetre,
  capped at the server's image limit; areas outside the photo are filled with the plain floor colour.
- A pure, unit-tested function in `core` solves the mapping; it refuses corners that do not form a proper
  four-sided shape, with a friendly message.
- "Remove picture" returns to the plain floor.

### 4. Showing the picture
- **Mat editor:** drawn under the grid, exactly covering the mat. Objects, the robot and the grid stay on top.
- **Simulator:** a texture on the floor inside the wall, in all five cameras. Grid lines and labels stay
  readable on top (lighter lines over a picture). Scale bar, trail and distance markers are unchanged.
- A chip "≈ picture of the table" in the editor, and one line in the run's assumptions when a picture is in
  use: "The floor picture is a straightened photo. Places on it are approximate."

### 5. Tables
- A **table** is a project with a real boolean column `is_table` (my call: the server needs it for listing
  and retention, so it is not hidden in the opaque blob). It is set when the project is created
  (`POST /projects { table: true }`) and never changes. Project responses and list items expose
  `table: boolean`. `GET /projects?tables=1` lists all tables, outside the 50-newest limit of the normal list.
- **Home** gets a "Tables" section: the saved tables as cards (name + small picture) and "+ New table".
  "+ New table" creates a table project on the competition mat and opens it at the Mat step with the picture
  panel open. A table opens straight to the Mat step and has no Check step; it can still be run empty.
- **Putting a program on a table:** in any project's Mat step, "Use a table" lists the saved tables. Choosing
  one copies that table's scene (mat kind, objects, start position, goal) and its picture into the project,
  after a confirmation if the project's mat is not empty. The table last used is offered first.
  Server: `POST /projects/{id}/use-table { tableId }` copies the picture file; the frontend copies the scene.
  Both projects must be visible to the request (lab ↔ lab, or one demo visitor's own).
- The copy is independent: editing a table later does not change programs already put on it, and a run can
  never change the table.
- Tables are listed for everyone who has the lab password, like projects.
- **Retention (my call):** lab tables are not deleted by `lab:prune`; a table lasts until someone deletes it,
  because it is made once and used for a season. Demo tables still expire with the demo's short retention.
  Programs put on a table are ordinary projects and expire as today.

### 6. Demo
Demo visitors can make a table from their own photo under the demo's existing upload limits; it is theirs
only and is deleted with their other demo projects.

## Left to the builder
- Layout of the picture panel and the corner step on phone, tablet and desktop (within the rules above).
- How the texture and grid are layered in Three.js, and picture resolution trade-offs.
- Exact wording, as long as it is short and plain.
- Whether `use-table` and `mat-image` live in `ScreenshotController` or a new controller.

## Testing
- **Unit (Vitest):** the corner mapping (identity, a known skew, corners outside the image, refusal of a
  crossed or collapsed shape); mat bounds for the competition mat; project schema accepts the new mat kind
  and `table`; a run on a competition mat stops at its wall; assumptions mention the picture when present.
- **Backend (PHPUnit):** mat picture upload/replace/delete; it never appears in `screenshots`, never goes to
  recognition and does not count against the screenshot limit; duplicate copies it; `use-table` copies only
  between projects the request may see (lab vs. demo, demo visitor A vs. B); quotas and size limits; the
  list exposes `table`; `?tables=1` lists tables beyond the 50-newest limit; `lab:prune` keeps old lab tables
  and still removes old demo tables.
- **Browser (Playwright):** make a table from a generated angled test photo, mark corners, see the picture in
  the editor and in the simulator; put a sample program on that table and run it; the same flow at iPad and
  iPhone sizes for layout (no sideways scroll, 44 px targets).
- Docs: README, tour (with screenshots made from a generated, non-copyrighted test mat), architecture, setup
  (new limits if any), test counts.
