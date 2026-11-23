# Practice kit: stand-ins, a hook, and a checklist – design

Status: approved · 2026-11-23 · Size: project · Piece 2 of 3

## Why
Piece 1 put a photographed competition table on the floor. A table with only blocks that stop the robot is
not training: at a real table the robot has to *do* things to the mission models – push something in, press
something, hook something and pull it out – with attachments the children build themselves (in this family's
case a hook and a ram). The models and their mechanisms change every season and cannot be simulated one by
one, so the kit is deliberately generic: a few simple stand-ins that each ask for one kind of action, sized
and placed roughly, and a checklist that says which actions the run achieved.

Everything here is an approximation and must say so. The value is practising the approach: reaching the right
spot, from the right side, with the right attachment, without hitting anything on the way, inside the time.

## Goals
- Stand-ins that react to what the robot does: a **push bar**, a **press plate**, a **pull ring**, and
  **blocks** with a rough height that may be marked "do not touch".
- A **hook** tool that catches a pull ring and drags it. The existing tools already cover a ram ("My own
  tool" with a chosen width and length, the bumper, the dozer blade); the tool list says so.
- A **checklist**: every stand-in that asks for an action is a task; the run ticks each one it achieved.
  The existing single goal (object or robot on a target) stays and counts as one more task.
- Works on a photographed table and on the other mats; on iPad, iPhone and desktop.

## Non-goals
- Copies of real mission models or their mechanisms (levers that swing, things that tip, flip, roll down
  ramps, or are thrown). Nothing here is named after or shaped like a real model.
- Scoring in points. A task is done or not done.
- A motorised hook (one that lifts or turns), two tools at once, tools on the back or the sides.
- Height as physics: a tall block and a low block stop the robot the same way. Height is for looks and for
  the child's own judgement.
- Asking the AI to place stand-ins.

## Anti-goals
- A tick the simulation did not earn (a task shown as done because a block "should" have moved).
- Hiding that these are approximations: each stand-in and the hook carries a "≈" note, and docs/robots.md
  lists them.
- Changing how existing projects run. A project without kit pieces must give exactly the same result as today.

## Constraints
- Deterministic, fixed-step, frame-rate independent; rewinding restores everything exactly, including how far
  a bar was pushed, what the hook holds and which tasks are ticked at that moment.
- `frontend/src/core` stays framework-free; the same shapes feed collision and the 3D model.
- The project document stays readable by older and newer versions: new fields are optional with defaults.
- Mat objects stay within today's limits (60 in the schema, 40 in the editor).
- Work on `master`, docs and screenshots updated, nothing from a real competition.

## Approaches
- **A. Stand-ins carry their own task (chosen, my call).** A push bar *is* the task "push me 5 cm". Placing
  the piece creates the task; there is no separate task editor to learn. The checklist is derived from the
  pieces on the mat plus the existing goal.
- **B. A free-form task list** ("add task → pick object → pick condition → pick amount"). More flexible, but
  a second editor for a child or parent to fill in, and easy to leave inconsistent. Rejected.
- **C. Real mechanisms** (hinges, levers, tipping). Rejected: a different physics engine, and still wrong for
  next season's models.

## Design

### 1. New things for the mat
All are placed, turned and resized like today's objects. Each has a front, shown by an arrow in the editor
and a coloured face in 3D.

| Piece | What it is | How it behaves | Its task |
|---|---|---|---|
| **Push bar** | a bar on a short rail | Slides only along its rail, only forwards from where it starts, up to its full travel (default 80 mm). Pushed from any other side it does not move and blocks the robot. | "Push the bar in" – done when it has travelled at least its target (default 50 mm). |
| **Press plate** | a fixed block with a front face | Never moves. | "Press the plate" – done when any part of the robot (body or tool) touches its front face. |
| **Pull ring** | a small ring lying on the mat | Can be pushed like a small object. A hook catches it (below) and it then follows the hook. | "Pull the ring out" – done when the hook has pulled it at least its target (default 100 mm). |
| **Block** (today's Obstacle) | a fixed block | Unchanged. Gains a rough height: low (4 cm), medium (8 cm, today's), tall (16 cm). Can be marked **"do not touch"**. | Only when marked: "Do not touch the block" – done when the robot never touched it. |

The target of a bar or a ring can be changed in steps (bar 20–80 mm, ring 50–300 mm). A piece's task can be
switched off ("just an obstacle"). Loose pieces to carry or push somewhere already exist (cube, crate, seed
pods) and use the existing goal.

### 2. The hook
A new passive front tool: a thin arm (default 16 mm wide, 110 mm long, both adjustable like "My own tool")
ending in a hook.
- It pushes like any tool with its arm.
- When the hook's tip area overlaps a pull ring that nothing holds, the ring is **caught**: from then on it
  follows the hook's tip, on the floor, and no longer collides with the robot. It still collides with fixed
  things: if the ring would be dragged into a wall or block, the robot is stopped ("stuck").
- A passive hook cannot let go; the ring stays on the hook until the run ends. The tool's "≈" note says so.
- Only one ring can be on the hook.

The tool picker's text for "My own tool" adds: "Use it as a ram: set how wide and long yours is."

### 3. The checklist
- `SimResult` gains `tasks: { id, text, met }[]`, in mat order, followed by the existing goal if there is
  one. Which tasks are met at each step is stored beside the frames (not inside them), so stepping back
  un-ticks them and a project without kit pieces keeps exactly today's frames.
- **A tick, once earned, stays (my call).** Push, press and pull are things the robot *did*: the tick appears
  at the moment the bar reaches its target, the plate is touched, or the ring has been pulled far enough, and
  it stays for the rest of the run even if the robot later drags the ring back. The existing goal is
  different – "the crate is on the target", "the robot is parked" are about where things are – so its row
  follows the current positions, and its final value is exactly today's verdict.
- **Only the hook pulls (my call).** The ring's task counts the distance the ring travels while it is on the
  hook. Shoving it with the body or a ram moves it but never ticks the task.
- **A project with only a goal looks exactly as today**: the goal banner, no checklist. The checklist appears
  when at least one kit piece has a task; the goal then becomes its last row and the banner is not shown.
- The checklist shows ✅ / ⬜ while the run plays and "3 of 5 done" at the end. On phones it sits where the
  goal banner sits today.
- "Do not touch" is met from the start and becomes not met at the first touch (and stays so).
- "Mission complete!" (the celebration) needs every task met **and** at least one of them to be something to
  do – a push, press, pull or the goal. A mat with only "do not touch" blocks never celebrates (my call).

### 4. Data
- `ObjectType` gains `push_bar`, `press_plate`, `pull_ring`. `SceneObject` gains optional `task: boolean`
  (default: on for the three new pieces, off for a block), `targetMm`, and `h` (height) for blocks.
- `AttachmentKind` gains `hook`.
- Old projects have none of these and behave as before. Unknown object types in a project still fail
  validation as today (an older app opening a newer project says it cannot read it).

### 5. Honest labels
Each new piece's note and the hook's note start with "≈". docs/robots.md gets a "Practice kit" section: what
each piece does, its default sizes, and what it does not model. The run's assumptions gain one line when any
kit piece is on the mat: "Practice pieces are simple stand-ins. Real mission models move differently."

## Left to the builder
- Exact shapes, colours and icons; 3D looks; the wording of notes and task texts (short and plain).
- How the rail constraint and the caught ring are resolved inside the existing collision step, as long as
  the constraints above hold and old projects give identical results.
- Where the height and "do not touch" controls sit in the editor's selection bar.

## Testing
- **Unit (Vitest), the core of this piece:** a bar pushed along its rail moves and its task ticks at the
  target; pushed from the side or from behind it does not move and the robot is stuck; it never travels past
  its limit or back past its start. A plate ticks on first contact with the body and with a tool, and not
  when the robot passes beside it. A hook catches a ring and reversing drags it; the task ticks at the
  target distance; without a hook the ring is only pushed; a caught ring dragged into a wall stops the robot.
  "Do not touch" flips at the first touch and stays. Stepping back restores bar travel, the caught ring and
  the ticks. A project with no kit pieces produces byte-identical frames to before (a recorded sample).
  Old project documents parse; new optional fields round-trip.
- **Browser (Playwright):** place each piece from the palette on a competition table, run a short program
  with the hook that pulls the ring and one with "My own tool" that pushes the bar, and see the checklist
  tick and "Mission complete!"; the editor and checklist fit on iPad and iPhone.
- Docs: README, tour (screenshots on the made-up mat), robots.md, architecture, test counts.
