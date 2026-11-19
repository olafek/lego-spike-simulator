# SPIKE Lab

[![tests](https://github.com/olafek/lego-spike-simulator/actions/workflows/tests.yml/badge.svg)](https://github.com/olafek/lego-spike-simulator/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Upload a screenshot of your LEGO® SPIKE™ Prime program and watch a robot drive it – no robot needed.**

![A robot drives 20 cm and stops short of the target; the number is changed to 30 and the mission succeeds](docs/screenshots/demo.gif)

*20 cm is not enough. Change one number, press play again, mission complete.*

## Why this exists

Without a robot it is hard to test a series of commands.

Children build and program SPIKE Prime robots in the school robotics lab, but the robots stay at school.
At home they can still open the SPIKE app and write a program – and then nothing happens. They cannot see
whether "move forward 20 cm" was enough, whether the turn went the right way, or why the mission failed.
The only way to find out is to wait for the next lab session.

SPIKE Lab closes that gap. A child takes a screenshot of their program on the iPad, uploads it, and a
simulated robot runs **that exact program** on a measured grid. Then they can change a number and try
again, right in the browser, as often as they like.

It is built for 10–11 year olds: big buttons, few words, iPad first.

## How it works

| 1. Upload a screenshot | 2. Check the blocks |
|---|---|
| ![Home screen with a large upload button and sample exercises](docs/screenshots/home.png) | ![The screenshot side by side with the reconstructed, editable blocks](docs/screenshots/check.png) |
| One big button. Samples below for a first try. | The picture sits next to the blocks that were read from it. Anything unreadable gets a 🚩 and is **never guessed** – here a smudged motor port. |

| 3. Pick the robot | 4. Set up the mat (optional) |
|---|---|
| ![Choosing between Driving Base 1, 2, 3 and the Advanced Driving Base](docs/screenshots/robot.png) | ![A top-down mat editor with a seed pod and a target circle on a 10 cm grid](docs/screenshots/mat.png) |
| The program hints at the robot; the child confirms. Add a fork, lift arm, grabber or sensors. | Drop seed pods, crates, walls, lines and targets onto a 10 cm grid, or pick a ready-made mission. |

| 5. Run it | 6. Change a number, run again |
|---|---|
| ![The robot stopped short of the target: mission not complete yet](docs/screenshots/sim-not-yet.png) | ![After changing 20 cm to 30 cm the seed pod is on the target](docs/screenshots/sim-success.png) |
| 20 cm was not far enough. The readouts say exactly how far the robot went and where it ended. | Edit the block, the robot reruns at once. The original screenshot is kept untouched. |

More screens, including the 3D views and the iPad layout: **[the visual tour](docs/tour.md)**.

## What it can do

- **Reads real programs.** Movement, single motors, waits, loops, if/else, sensor conditions, variables,
  and several stacks running at the same time.
- **Measures like the lab floor.** A true-to-scale grid in centimetres (inches optional), a scale bar, and
  live readouts: *Moved 30 cm · Turned 90° · Position x 0 cm, y 30 cm*.
- **Step by step.** Play, pause, next instruction, previous instruction, a timeline, and speeds from ¼× to 4×.
  Stepping back restores everything – robot, tools, objects and variables.
- **Four robots.** Driving Base 1, 2 and 3 and the Advanced Driving Base, each with its own wheels and ports.
- **Tools and sensors.** Forks that only push, a lift arm and a grabber that follow their motor, colour,
  distance and force sensors.
- **Five cameras.** From above, free 3D, follow, behind and side.
- **Missions.** A goal such as "get the big seed pod onto the circle" is checked from the simulated result.

![A square route seen from above: four 20 cm sides and four 90 degree turns](docs/screenshots/square.png)

## What it is honest about

- **The movement is maths, not AI.** AI only reads the screenshot (and can explain a block in simple words).
  The robot's path is calculated with a fixed-step simulation, so the same program always gives the same result.
- **Nothing is invented.** A value the reader could not make out stays empty and blocks the run until the
  child fills it in. Blocks SPIKE Lab cannot run yet are shown, flagged and skipped.
- **Approximations are labelled.** Ports, wheel size and motor speeds come from official LEGO documents where
  they exist; everything else (track width, tool sizes, how objects slide) is an estimate, marked "≈" in the app
  and listed in [docs/robots.md](docs/robots.md). Pushing and lifting are simplified: things slide but do not tip.
- **One shared password is not privacy.** It keeps strangers out; it does not separate one child's projects
  from another's. The app says so.

## Under the hood

Vue 3 + TypeScript + Three.js in the browser, Laravel on the server, SQLite or MySQL.
The simulator itself is plain TypeScript with no framework, covered by 72 unit tests; 68 server tests and
25 browser tests (desktop, iPad landscape, iPad portrait) cover the rest.

| Read this | For |
|---|---|
| [docs/tour.md](docs/tour.md) | Every screen, with pictures |
| [docs/setup.md](docs/setup.md) | Running it locally, settings, tests, putting it on a server |
| [docs/architecture.md](docs/architecture.md) | How the simulator, the program format and the AI adapters fit together |
| [docs/robots.md](docs/robots.md) | Robot data: what is verified, what is estimated, and the sources |
| [docs/prompt.md](docs/prompt.md) | The original brief this was built from |

## Status

A working first version. The picture reader has been checked against a generated sample and needs more
practice on real iPad screenshots; only "when program starts" stacks run; the physics is deliberately simple.
The full list is at the end of [docs/setup.md](docs/setup.md).

## Licence

[MIT](LICENSE) – use it, change it, share it.

---

LEGO®, SPIKE™ and the Minifigure are trademarks of the LEGO Group, which does not sponsor, authorise or
endorse this project. SPIKE Lab is an independent learning tool.
