# iPhone portrait layout – design

Status: approved · 2026-11-23 · Size: small change

## Why
The app is used on iPhones too, not just iPads. On a phone held upright (390 × 844) the simulator's 3D/top view
is 370 × 190 px, about a fifth of the screen. Two header rows, four rows of readouts, the timeline, the play row
and the speed row crowd it out, and the five camera buttons cover a third of what is left. The child cannot
watch the robot.

## Goals
- On phones the simulator view gets roughly half the screen height, with play / back / next always reachable.
- "Change one number, run again" stays on one screen: view on top, blocks scrolling underneath (as today).
- The other lab steps lose their small phone glitches (project name cut to "Exan", overlapping
  "suggested" / "not confirmed" badges on the robot card).

## Non-goals
- Phone held sideways. It should not get worse, but it gets no special layout now.
- Any change at 640 px and wider: iPad landscape, iPad portrait and desktop stay exactly as they are.
- Any change to the simulator, the mat editor's behaviour or the API.

## Anti-goals (a failure even if it looks fine)
- Hiding the honesty markers on phones: "≈ estimated", "🧱 stuck", "⚠️ not saved" must stay visible without a tap.
- Touch targets under 44 px, or the page scrolling sideways.

## Approaches
- **A. Same layout, smaller controls (chosen).** Keep today's stacked order; compact the chrome on phones only.
- **B. "Watch" / "Blocks" tabs on phones.** Bigger view, but every retry means switching tabs and the running
  block is out of sight. Rejected because it breaks the edit-and-rerun loop the app is built around.

## Design (phones only: below Tailwind `sm`, 640 px)
1. **One top row in the lab.** The app header and the project row merge into one row: a ☰ button plus the four
   step buttons. ☰ opens a small panel with the home link, project name field, save state, Projects, sound,
   settings and leave. If saving fails, a warning shows on the row itself (not only inside ☰).
2. **Readouts on the view.** One line at the bottom of the view: `Moved 20 cm · 0° · x 0, y 20`, plus the
   "≈" and "🧱" markers when they apply. An ⓘ button opens the detail (Asked / Driven / To go, wheels rolled).
3. **One camera button.** Shows the current camera's icon; tapping it lists the five views. Zoom +/−/⤢ stay.
4. **One playback row.** Timeline slider, then `⏮ ◀ Play ▶ [1×]`, where the speed button cycles
   ¼× → ½× → 1× → 2× → 4×. Play stays the biggest button.
5. **Small fixes.** Robot card badges no longer overlap; the project name is readable (it lives in ☰).

## Left to the builder
- How tall the simulator area is on phones (today 62dvh below `lg`), as long as the view is at least ~45% of
  the screen height.
- Whether ☰ is a dropdown or a bottom sheet; the exact overlay styling.

## Testing
- Add an `iphone-portrait` Playwright project (390 × 844, touch) running the layout checks in `ipad.spec.ts`
  (no sideways scroll, 44 px targets), with a phone-specific check that the view is ≥ 45% of the screen height
  and play / next / the readout line are in view. The existing iPad and desktop tests must pass unchanged.
- Update the browser-test count in README.md and docs/setup.md.
