# Practice Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand-ins that react to the robot (push bar, press plate, pull ring, "do not touch" blocks with a rough height), a hook tool, and a checklist that ticks what a run achieved.

**Architecture:** Everything lives in the frontend. `core/scene.ts` and `core/robots.ts` describe the new pieces and the hook; `core/simulate.ts` gives them behaviour inside the existing fixed-step collision loop and logs task changes *beside* the frames; `core/timeline.ts` answers "which tasks are met at frame N". The editor, robot step, renderer and simulator panel read those definitions. No backend change.

**Tech Stack:** TypeScript, Vue 3, Pinia, Three.js, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-practice-kit-design.md`

## Global Constraints

- Work on `master`; do not push without asking; do not commit `CLAUDE.md`. Commit messages end with `Claude-Session: https://claude.ai/code/session_01NPpemUC5yvsRfeTDm3pDrK`.
- A project without kit pieces runs exactly as today: `frames` are unchanged, `tasks` is `[]`, the goal banner shows as before.
- Deterministic and frame-rate independent. Task state is stored beside the frames (`taskChanges`), never inside them.
- Ticks: push / press / pull latch once earned; the goal row follows current positions; "do not touch" starts met and flips at the first touch. Only distance travelled on the hook counts for a ring.
- Celebration: every task met and at least one task of kind `do` or `goal`.
- Every new piece and the hook has a note starting with "≈". Nothing is named after or shaped like a real competition model.
- New project fields are optional with defaults; old documents parse unchanged.
- Units in core: mm, radians. Touch targets ≥ 44 px; phone variants via `usePhone()` + `v-if`.

## Review Focus

1. Rewind: stepping back restores bar travel, the hooked ring and the ticks exactly → Task 2 test `stepping back un-ticks and restores`.
2. A bar pushed from the wrong side, or past its limit, never moves and never ticks → Task 2 tests.
3. A hooked ring dragged into a wall or block stops the robot instead of passing through → Task 2 test.
4. Old projects and goal-only projects are untouched (frames, banner, celebration) → Task 2 test `a project without kit pieces is unchanged`, Task 4 e2e.
5. Pieces turned to any angle (rot ≠ 0): rail direction, plate front and hook catch follow the rotation → Task 2 tests use a turned bar and plate.

---

### Task 1: Pieces and the hook as data

**Files:** Modify `frontend/src/core/scene.ts`, `core/project.ts`, `core/robots.ts`, `core/attachmentGeometry.ts`; tests `core/scene.test.ts`, `core/project.test.ts`, new `core/attachmentGeometry.test.ts`.

**Interfaces (produces):**
- `ObjectType` adds `'push_bar' | 'press_plate' | 'pull_ring'`. `ObjectDef` adds optional `kit?: 'push' | 'press' | 'pull'`. Defaults: push bar box 120 × 24 mm (h 40), press plate box 80 × 40 mm (h 60), pull ring circle r 18 (h 10). A piece's front is its local −y side; a push bar travels towards local +y.
- `SceneObject` adds optional `task?: boolean`, `targetMm?: number`, `h?: number`. `objectSize` returns `h: o.h ?? def.h`.
- `KIT = { push: { travelMm: 80, targetMm: 50, min: 20, max: 80, step: 10 }, pull: { targetMm: 100, min: 50, max: 300, step: 50 } }`, `BLOCK_HEIGHTS = { low: 40, medium: 80, tall: 160 }`, `hasTask(o: SceneObject): boolean` (kit pieces: `o.task !== false`; obstacle: `o.task === true`; others false), `targetOf(o: SceneObject): number`.
- `AttachmentKind` adds `'hook'` (passive tool, default 16 × 110 mm, sizes adjustable like `custom`). `toolSize` honours custom sizes for `hook`. `toolRects` for hook: the arm plus a small barb at the tip. `hookZone(robot, inst): LocalRect` – the area at the tip that catches a ring.
- Project schema accepts the new optional fields (`task` boolean, `targetMm` 10–500, `h` 10–400).

- [ ] Failing tests: defaults and `hasTask`/`targetOf`; `objectSize` honours `h`; schema round-trips a scene with all three pieces and an obstacle `{ task: true, h: 160 }`, and still parses a document without them; `toolRects`/`hookZone` for a hook lie in front of the mount and the zone covers the tip.
- [ ] Run → FAIL. Implement. Run `npx vitest run && npm run typecheck` → PASS. Commit "Practice kit: pieces and the hook as data".

### Task 2: Behaviour in the simulator

**Files:** Modify `frontend/src/core/simulate.ts`, `core/timeline.ts`; tests new `core/kit.test.ts`.

**Interfaces (produces):**
- `SimResult.tasks: { id: string; text: string; kind: 'do' | 'avoid' | 'goal'; met: boolean }[]` (final state; `[]` when no piece on the mat has a task) and `SimResult.taskChanges: { frame: number; task: number; met: boolean }[]`.
- `tasksAt(result: SimResult, frame: number): { id; text; kind; met }[]` in `timeline.ts`; `missionComplete(tasks): boolean` (all met and one `do`/`goal`).
- Task texts: "Push the bar in", "Press the plate", "Pull the ring out", "Do not touch the block", and the existing goal text. With more than one of a kind they are numbered ("Push bar 2 in" is not needed: use "Push the bar in (2)").
- Assumption when any kit piece is on the mat: "Practice pieces are simple stand-ins. Real mission models move differently."

- [ ] Failing tests in `kit.test.ts` (robot `db1`, tools from `ATTACHMENTS`): bar pushed along its rail moves and ticks at 50 mm, stops at 80 mm with the robot stuck; pushed from the side and from behind it does not move and the robot is stuck; a bar turned 90° works along its turned rail; plate ticks on contact with the body and with a `custom` tool, not when driving past; a turned plate ticks only from its front; hook catches a ring driving forward and reversing 15 cm ticks "pull"; without a hook the ring is pushed and never ticks; a hooked ring reversed into a wall stops the robot; "do not touch" is met until the first touch and stays not met; tick latches after the ring is dragged back; `tasksAt` before/after the tick (rewind); goal row follows positions and equals `result.goal.met` at the end; `missionComplete` rules; a project without kit pieces has `tasks: []`, `taskChanges: []` and frames deep-equal to a run of the same setup built without the new code paths (compare against `simulate` of the same scene – the assertion is on `tasks`/`taskChanges` and frame keys).
- [ ] Run → FAIL. Implement inside `stepWorld`/`robotShapes`/`record`: rail constraint in the robot-vs-movable resolution (project the push onto the rail, clamp to `[travel, maxTravel]`, restore travel on a jam), rails are immovable for other movables and statics; hook catch before collision resolution using the next pose; the hooked ring is part of the robot's shapes for the static-jam check; pulled distance accumulates while hooked; press and touch probes after the pose update; task changes logged per step.
- [ ] Run all unit tests + typecheck → PASS (the existing 87 must stay green). Commit "Practice kit: push bars, press plates, pull rings and the hook in the simulator".

### Task 3: Editor, robot step and 3D

**Files:** Modify `frontend/src/components/MissionEditor.vue`, `components/RobotStep.vue`, `render/SceneRenderer.ts`, `components/RobotPreview.vue` if needed; tests `tests/e2e/kit.spec.ts`.

**Interfaces (produces):** test ids `add-push_bar`, `add-press_plate`, `add-pull_ring` (from the existing palette loop), `piece-target-less`, `piece-target-more`, `piece-target`, `piece-task-toggle`, `block-height-low|medium|tall`, `block-avoid-toggle`, `tool-hook`, `tool-length`, `tool-width` (reuse the custom tool's controls for the hook).

- [ ] Failing e2e (desktop): the three pieces can be added and show a front arrow; a selected push bar's target changes 50 → 60 → 50 mm; a block can be set tall and "do not touch"; the hook can be chosen in the Robot step and its length changed; all survive a reload.
- [ ] Implement: palette notes, selection-bar controls, front arrows in the SVG, 3D meshes (bar on a rail line, plate with a coloured front face, ring as a torus, block height), hook in the tool list with size controls, "My own tool" text mentions the ram.
- [ ] Run kit spec + all four Playwright projects → PASS. Commit "Practice kit: pieces in the mat editor, the hook in the robot step, and their 3D shapes".

### Task 4: Checklist and celebration

**Files:** Create `frontend/src/components/TaskChecklist.vue`; modify `components/SimulateStep.vue`, `stores/lab.ts` (a `tasks` getter using `tasksAt`); tests `tests/e2e/kit.spec.ts`, `tests/e2e/ipad-table.spec.ts` (layout).

**Interfaces (produces):** test ids `task-checklist`, `task-row` (with `data-met="true|false"`), `task-count`.

- [ ] Failing e2e: a competition table with a ring 30 cm ahead and a push bar; a robot with the hook and the program "forward 30 cm, backward 20 cm" → the ring row ticks during the run, "1 of 2 done", no celebration; switching the tool to "My own tool" with a program that pushes the bar ticks that row; a mat with ring only + hook program → "Mission complete!"; stepping back un-ticks; a goal-only sample (`seed-pod`) still shows `goal-banner` and no `task-checklist`; checklist fits on iPad and iPhone.
- [ ] Implement. Run everything → PASS. Commit "Practice kit: the checklist in the simulator".

### Task 5: Docs, screenshots, full check

- [ ] Run all suites; update README, docs/tour.md (screenshots from the made-up mat via `shots.spec.ts`), docs/robots.md ("Practice kit" section), docs/architecture.md, test counts, `CLAUDE.md` (not committed). Commit "Docs: the practice kit".
