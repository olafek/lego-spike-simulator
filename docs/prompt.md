# SPIKE Lab: Screenshot-First LEGO SPIKE Prime Simulator

## Role and mission

You are a senior full-stack engineer, simulation engineer, 3D graphics developer, and children's educational UX designer. Build **SPIKE Lab**, a functional web application for children aged 10–11 who use LEGO Education SPIKE Prime in a school robotics lab but cannot take the physical robots home.

**The primary workflow is screenshot-first.** A child creates a program in the LEGO SPIKE app on their iPad, takes one or more screenshots, visits this website, uploads the screenshots, and sees the robot execute that exact program as an interactive animation. The child can then **tinker with the reconstructed instructions inside the website**, rerun the simulation, and understand the result without going back to the SPIKE app. Do not design the site primarily as a robot editor, a general coding IDE, or a text-to-video generator. The screenshot upload must be the central starting action.

The result must be **working application code**, not an architecture-only proposal, mock-up, promotional design, or LLM-generated animation. If a feature cannot yet be simulated accurately, label it as approximate/unsupported and never fabricate success.

## Product UX: child-friendly, simple, cool

Target age: 10–11. The visual tone should feel like a polished, playful robotics game rather than a corporate dashboard, with bright but controlled colours, friendly rounded shapes, concise readable labels, oversized touch targets, fun microinteractions, subtle sound effects (muted by default), tasteful celebration on verified mission completion, and clear progress indicators. Avoid clutter, walls of text, infantilising visuals, and excessive settings. Make it responsive with **iPad landscape and portrait as first-class layouts**, alongside desktop.

### Primary home screen

Once authenticated, the central hero action should be **"Upload your SPIKE screenshot"**. Show a drag/drop zone and large iPad-friendly picker button. Below it: "Try a sample", "Continue a project", and optional small "Build a program manually" action. Never require a child to select all robot/attachment settings before uploading.

### Screenshot-first guided flow

1. **Upload**: Accept one or multiple SPIKE program screenshots from an iPad (PNG/JPEG/WebP; HEIC with conversion if supported). Support photo library, Files, desktop drag-and-drop, and clipboard where available. Allow cropping/rotation and reordering screenshots. Retain source image references.
2. **Recognise**: Send screenshots to a vision-capable LLM through the existing AI Brain bridge. Extract connected program block order, all values, units, port assignments, loops, conditions, event hats, and disconnected blocks. Show a child-friendly progress state and explain when recognition fails.
3. **Check**: Display the original screenshot **side by side with a visual reconstructed block list**, with confidence flags for ambiguous instructions. Let the child edit values, reorder, add, remove and duplicate blocks. NEVER silently guess unreadable numbers or motor ports. Let them rerun screenshot recognition if needed. Preserve the screenshot and editable program separately.
4. **Choose robot**: Suggest a robot configuration based on the screenshot or remembered project preference, but ask the child to confirm. Include Driving Bases 1, 2, 3 and Advanced Driving Base where documented. Default to Driving Base 1 only as a clearly visible, changeable assumption. Offer a simple attachment picker, with preview images or recognizable models, and advanced port mapping behind an expandable setting.
5. **Set mission** (optional): Enter a short description, e.g. "Push the big seed pod into the circle". Offer presets and a simple object palette. AI may propose a scene, but users must approve assumptions about dimensions/positions. Mission description must not be required for basic motion simulation.
6. **Simulate**: Render a 3D robot on a clearly marked **metric measurement grid**, animate the actual interpreted instruction sequence with deterministic physics/kinematics, and highlight the current block. Provide play/pause/reset, **next instruction**, **previous instruction**, timeline, and adjustable playback speed. Show how far the robot moves and where it ends.
7. **Tinker and retry**: Allow editing the interpreted program and immediate re-simulation **inside the website**, without re-uploading or modifying the original iPad program. Offer optional child-friendly explanations and hints, but never auto-correct the child’s original program without permission.

## Front-site access protection and abuse prevention

The entire app, including the upload page and all APIs, must be protected behind **one shared/generic site password**, configured from an environment variable. There is no need for child accounts or public registration in v1.

- Implement a friendly "Enter lab password" gate with a single password input, show/hide toggle, and accessible error messages.
- Validate password **server-side in Laravel**, never ship the plaintext password or hash into frontend JavaScript, and never rely on a frontend-only route guard.
- On success, create an authenticated server-side session with HttpOnly, SameSite cookies, Secure in production, CSRF protection, and session regeneration. Provide a logout function and configurable session lifetime.
- Gate every page and API route (including uploads, AI, projects, and assets that contain private user content). Prevent unauthenticated access via direct API calls.
- Rate-limit password attempts and implement a short cooldown after repeated failures. Use constant-time verification where applicable. Do not log passwords.
- Rate-limit and cap screenshot uploads, file dimensions, file sizes, AI requests, concurrent analyses, and overall per-session consumption to avoid abuse and unexpected AI cost. Keep server-side usage counters/quotas, clear child-friendly error states, and basic admin-configurable thresholds.
- Sanitize inputs; validate file types by actual content, not only extension; do not expose private images through publicly guessable URLs; apply sensible retention/deletion of uploads; do not reveal internal API keys.
- Environment example: `LAB_ACCESS_PASSWORD=`, `LAB_SESSION_HOURS=`, `LAB_MAX_AI_REQUESTS_PER_HOUR=`, `LAB_MAX_UPLOAD_MB=`, `LAB_MAX_SCREENSHOTS_PER_PROJECT=`. Document production deployment and HTTPS requirements.
- A single shared password is a practical access barrier, **not** individual user identity or strong per-child isolation. Do not present it as stronger security than it provides.

## Measurement grid: must feel like the physical lab

The simulation MUST have a visible floor grid that makes movement distances obvious and educational.

- **Default units: centimetres (cm), metric/South African convention.** Internal simulation uses millimetres and seconds; convert for display.
- Default major grid spacing: **10 cm**, with smaller **1 cm subdivisions** when zoom level permits. Provide a clear scale bar, axis/origin marker, and configurable visible labels (10, 20, 30 cm etc.). Do not allow visual grid scale to drift when zooming.
- Offer an optional inches toggle (including sensible subdivision and unit conversion), but **cm is the persistent default**.
- Let child select grid sizes, e.g. 5 cm, 10 cm, 20 cm, and show a basic classroom-mat preset. Provide optional snap-to-grid for placing objects (NOT for robot movement).
- Display an accurate robot footprint, start marker, heading arrow, path trail, end marker, and optionally distance markers along travelled path.
- During a move show **commanded travel distance**, **simulated actual distance**, **distance remaining**, and turning degrees where applicable. Distinguish the measurement of robot-centre movement from the wheel travel distance.
- Above/near the viewport, show simple readouts, e.g. "Moved: 24 cm", "Turned: 90°", "Position: x 30 cm, y 10 cm". Make advanced telemetry collapsible.
- The **top-down orthographic view** is essential for comparing movement against the grid; also support orbit 3D, behind, side, and follow cameras, with seamless switching during a run.
- Grid and measurements must scale coherently with the 3D scene and physics world. Test that a 30 cm instruction covers exactly three 10 cm grid cells in a no-slip idealised setup.
- Clearly distinguish **estimated** measurements from hardware-calibrated measurements when wheel slip or gearing is unknown.

## Technical stack

- Frontend: Vue 3, TypeScript, Vite, Tailwind CSS, Pinia; optional TresJS wrapping Three.js if it does not complicate precise scene management.
- 3D graphics: Three.js with orbit/orthographic/follow cameras, procedural LEGO-style models or correctly licensed assets, and performant iPad rendering.
- Engine: framework-independent, deterministic TypeScript simulation core; fixed-time-step movement and versioned state snapshots for stepping/rewind.
- 3D collision/attachments: use Rapier or another well-supported physics library **only where necessary**, especially for contact and moving objects. Keep one authoritative world state, not conflicting physics and animation positions.
- Backend: Laravel 12, PHP 8.3+, REST endpoints, SQLite locally, MySQL compatible, validation, auth middleware, rate limiting.
- Screenshot recognition: AI Brain configurable provider adapter (model must support image/vision inputs). Do not assume the bridge’s exact request/response shape; isolate it behind one adapter and document the contract to fill in. Provide an offline mock fixture to test the flow without AI Brain.
- Tests: Vitest, Playwright, PHPUnit.
- Monorepo structure: `/frontend`, `/backend`, `/docs`, `/fixtures`, `/tests`, with optional `/shared`.
- Use currently compatible stable versions; document environment configuration and scripts. Local development must not require Docker.

## Robots and accessories

Use **official LEGO Education SPIKE Prime building instructions and actual models** as the reference rather than inventing exact dimensions, ports, or configurations:
- https://education.lego.com/en-us/product-resources/spike-prime/downloads/building-instructions/
- https://spike.legoeducation.com/prime/models

Implement selectable distinct configurations for:
- Driving Base 1
- Driving Base 2
- Driving Base 3
- Advanced Driving Base (when supported by official documentation)

For each robot, define data-driven, editable: wheel size, track width, differential-drive motors and polarity, hub/motor port mapping, motor position, gearing, sensor mounts, attachment mounts, chassis envelope, collision geometry, physical units, and model/accuracy notes. Start with verified references where possible. Where undocumented, expose clearly labeled approximations and calibration settings. Do not use one identical physical setup for every base.

Modular attachment system:
- Passive front fork and wide fork
- Pusher / dozer blade
- Lift arm
- Grabber/claw
- Bumper
- Color/distance/force sensor attachments
- Official tools and mission modules when reference geometry is available
- User-configurable custom attachments

Each accessory defines geometry, mounting transform, whether passive or motorised, motor port, hinge/pivot, angular range, gear ratio, collision shapes and contact surfaces. A passive fork must only move with the robot and interact through collision, not magically lift objects; an active lift follows its associated motor command. If a child uploads a command that runs motor C, the correctly mapped joint should move accordingly.

Scene objects/presets: small and **large seed pod**, box/crate, cube, ball, cylinder, obstacles, walls, colour zones, start and finish markers, line-following strips, and target zones. Place/rotate/resize objects with touch controls and grid snapping. Provide realistic-enough collision and movement for pushing/lifting/grabbing, but clearly mark approximate or unsupported mechanics.

## Program parser and editable instruction model

Define a strictly typed JSON intermediate representation (IR) with stable instruction IDs, typed command names/values/units, source screenshot correspondence, confidence, nested control-flow trees and unsupported-command markers. Validate all AI responses with Zod or equivalent.

Support progressively:
- Start/event blocks
- Set movement motor pair / speed
- Drive forward/backward for distance, time, wheel rotations or motor degrees
- Turn left/right by heading angle
- Independent motor movement and stopping
- Steering/curved paths
- Wait and start/stop commands
- Repeat count / forever with safety cutoff
- If/else and wait-until
- Sensor conditions (colour, distance, force, hub orientation)
- Variables, comparisons and simple arithmetic
- Basic lights/sounds as non-movement state changes
- Parallel motor actions and commands that start without waiting

Preserve nested blocks, connected execution order and disconnected blocks. Do not confuse motor-degrees with heading degrees, or wheel rotations with chassis turns. If an instruction is unreadable or unsupported, surface it for correction instead of pretending to simulate it.

Program editor should feel like recognizable, simple visual coding blocks, not a raw JSON editor. Allow editing numbers, dropdowns and motors; add/remove/reorder/duplicate blocks; preserve original screenshot alongside reconstructed blocks. Clearly indicate which command is currently running. Include beginner mode and optional advanced mode.

## Deterministic motion and timeline

Implement differential drive using configurable wheel diameter, wheel separation, rotations and motor polarity. Internally use mm, radians and seconds. Correctly compute left/right wheel displacement, forward motion, pivots, point turns, arcs, reverse, robot heading, wheel spin and independent motor movement. Base computations on an explicit fixed timestep independent of render FPS. Include configurable acceleration, speed limits and slip estimation where appropriate, with defaults marked as approximations if not verified.

- Play/pause/stop/reset; step one full instruction forward and backward.
- Speed control: 0.25×, 0.5×, 1×, 2×, 4×.
- Timeline scrub, current block highlight, progress indicator and event log.
- Full deterministic snapshots or replay checkpoints for robot pose, wheel angles, motors, attachments, scene objects, variables, sensors, active concurrent commands and loops. Stepping backwards MUST restore the complete simulation state.
- Appropriate execution cutoffs for forever loops, stuck sensor waits and runaway motor commands.
- Parallel commands execute in parallel when SPIKE semantics require it, not serially for implementation convenience.
- Camera changes do not reset or mutate the simulation.

## AI Brain integration

Laravel adapter with configurable values:
`AIBRAIN_BASE_URL=`
`AIBRAIN_API_KEY=`
`AIBRAIN_MODEL=`
`AIBRAIN_TIMEOUT=`

Investigate the actual API schema locally if available; otherwise implement a documented adapter boundary, mocked vision fixture and admin-configurable request/response mapping without claiming a made-up integration works.

Screenshot-extraction prompt must request strict JSON representing the block tree, numeric values, units, dropdown selections, connected/disconnected blocks, and uncertainty. Extract both program text and logical order from image placement. Never invent unreadable values. Return confidence/unknown flags. Permit manual override, with input validation and schema errors surfaced clearly.

Optional AI assistant may explain a command or propose a mission scene based on the child's written description. **AI does not execute motion, decide physical collisions or replace deterministic simulation.** Do not automatically change the child's program to make it succeed. Any proposed correction must be accepted explicitly.

## Interface pages and components

1. Password gate: fun but simple and safe.
2. Home: dominant screenshot upload CTA, recent projects, examples.
3. Recognition/review: screenshot viewer + reconstructed editable blocks, confidence flags.
4. Simulator: large responsive viewport, visible metric grid, measurements, block list, big playback controls, camera switcher and robot/attachment selector.
5. Mission editor: beginner-friendly palette for objects, targets and start position; optional natural-language mission field.
6. Saved projects: persist screenshots and edited programs, robots, attachments, scene configuration and playback settings.
7. Minimal advanced/settings screen: calibrations, ports, units and diagnostics.

Include sample exercises: drive 30 cm, turn 90°, square route, drive backward, push a box with passive forks, move a motorised arm, and an exercise with a **large seed pod**. At least one sample should demonstrate the full screenshot-to-review-to-simulate-to-tinker path with a stored image fixture and mocked extraction output.

Respect reduced-motion settings, keyboard controls and accessible colour contrast. Do not depend on hover for core controls. On iPad prioritize touch gestures and avoid demanding precision interactions.

## Persistence, export and privacy

- Save/duplicate/load a project.
- Export/import a complete project as JSON with versioning.
- Persist original screenshot references and edited block IR separately.
- Give each project an unguessable identifier, authenticate all retrieval, and support deleting project screenshots.
- A shared site password does not identify individual children. In v1 do not pretend projects are private per user. Consider browser-local recent projects or optional nicknames without claiming account-level isolation.
- Do not retain screenshot content longer than necessary; establish a configurable retention policy.

## Testing and acceptance criteria

Write meaningful automated tests, not mock-passing illusions, for:
- 300 mm moves exactly 30 cm, including correct grid visualisation.
- 30 cm movement covers three 10 cm cells in ideal geometry.
- 90° heading turns and reverse movements.
- Wheel rotations versus motor degrees versus heading turns.
- Distinct robot configurations and correct port mapping.
- Concurrent motor execution.
- Loops, waits, sensor condition timeouts and safety guards.
- Complete state rewind, including attachments and objects.
- Passive fork pushing and active lift motion (within documented approximations).
- JSON schema validation and ambiguous AI recognition.
- Upload → screenshot review → user edit → simulate → tinker → rerun.
- Password protection of both frontend routes and backend API, bad-password throttling, AI quota enforcement and rejected invalid uploads.
- iPad viewport layouts and touch-friendly controls.

## Delivery milestones: execute in working increments

**Milestone 1:** Scaffold Laravel/Vue app, implement shared-password login and protected APIs, create polished child-friendly screenshot-first landing page, working upload/review flow with mocked screenshot extraction fixture, and save a project. Prove upload → review → edit without a robot yet.

**Milestone 2:** 3D Driving Base 1, correctly scaled metric grid and ruler, top-down/3D cameras, deterministic manual program execution, block highlighting, playback/step/rewind, and motion trail. Implement and test a 30 cm move and 90° turn.

**Milestone 3:** Connect real AI Brain vision adapter once actual request format is known, add strict validation/confidence review, support multi-screenshot input and an end-to-end screenshot → simulation demonstration.

**Milestone 4:** Driving Bases 2/3/Advanced, hardware configuration, modular attachments, and port mapping.

**Milestone 5:** Scene editor, objects including large seed pod, collision physics, pushing, lifting, mission goals and child-friendly feedback.

**Milestone 6:** Sensors, control flow, parallel actions, calibration, advanced editor, robust project export/import, browser test coverage, iPad polish and documentation.

At the end of each milestone, run tests, fix failures, list what really works and clearly label what is incomplete. Do not stop at a plan, but do not falsely claim unfinished milestones are complete.

### Initial demonstrable end-to-end scenario

A child visits the password-protected website on an iPad, uploads a screenshot of a SPIKE program, sees interpreted visual blocks, confirms **Driving Base 1**, selects an optional passive fork, places a large seed pod on the **10 cm metric grid**, presses Play, then steps through commands in overhead view. The robot's movement and contact are animated. They change the forward distance from 20 cm to 30 cm inside the website and replay without uploading another screenshot. On-screen readouts show centimetres and degrees.

### Implementation requirements

1. Inspect local environment and available project files first.
2. Write concise architecture and interfaces, then implement code immediately.
3. Create `.env.example`, README, scripts, example fixtures and tests.
4. Keep the core simulator independent from renderer and AI provider.
5. Use verified references and state any physical assumptions.
6. Do not require Docker, user registration or an external AI service for local smoke tests.
7. Never ship real credentials or a default public password in source code.
8. Test the first user journey end to end before expanding scope.
9. Work as far through the milestones as the environment permits, leaving a clear, executable continuation plan when necessary.

**Start building the application now. The screenshot-to-simulation-to-tinkering flow is the product's central feature.**
