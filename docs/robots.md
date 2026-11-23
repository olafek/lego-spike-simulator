# Robots, tools and what is (not) verified

All values live in `frontend/src/core/robots.ts` as data and can be overridden per project
(Robot → Ports and calibration). The UI shows the same verified / estimated split.

## Verified from official LEGO Education material

| Fact | Source |
|---|---|
| Driving Base: left motor **C**, right motor **D**; distance per rotation constant 17.5 cm; 90° turn = 182 motor degrees at steering 100 | [SPIKE Prime Python Programs (Feb 2024), pp. 21–23](https://assets.education.lego.com/v3/assets/blt293eea581807678a/blt02bcbffa2bf460b5/65df44a50f1d35dffdca4995/EN-US-SPIKE-Prime-Python-Programs_Feb-2024.pdf?locale=en-us) |
| Training Camp 2: arm motor **E**, distance sensor **F**. Training Camp 3: colour sensor **B** | same PDF |
| Advanced Driving Base: drive **A** (left) / **E** (right), dozer blade motor **C**, lift arm motor **D**, wheel circumference **27.63 cm**, 2 large + 2 medium motors, 2 colour sensors (ports B and F) | same PDF pp. 24–27, [lesson](https://education.lego.com/en-us/lessons/prime-competition-ready/assembling-an-advanced-driving-base/) |
| Medium motor 185 RPM, large motor 175 RPM (no load, 7.2 V) | [medium](https://assets.education.lego.com/v3/assets/blt293eea581807678a/blt692436dd1e8fa71c/5f8801d5c8a27c1d9614c27e/techspecs_technicmediumangularmotor.pdf?locale=en-us), [large](https://assets.education.lego.com/v3/assets/blt293eea581807678a/bltb9abb42596a7f1b3/5f8801b5f4c5ce0e93db1587/le_spike-prime_tech-fact-sheet_45602_1hy19.pdf?locale=en-us) |
| Distance sensor 50–2000 mm; colour sensor colours; force sensor 0–10 N | LEGO technical specs |
| Hub 88 × 56 × 32 mm | [hub spec](https://assets.education.lego.com/v3/assets/blt293eea581807678a/bltf512a371e82f6420/5f8801baf4f4cf0fa39d2feb/techspecs_techniclargehub.pdf?locale=en-us) |
| Model names: Driving Base + "Tools and Accessories" + "Color Sensor Module"; Advanced Driving Base; tools "Dozer Blade", "Lift Arm" | [building instructions](https://education.lego.com/en-us/product-resources/spike-prime/downloads/building-instructions/) |

## Estimated (not officially published) – treat as tunable

- **"Driving Base 1 / 2 / 3"** are mapped to the Training Camp 1 / 2 / 3 builds (base; + arm + distance sensor;
  + colour sensor). LEGO describes them this way but no page states the numbering outright.
- **Wheel diameter 56 mm** on the basic base (secondary sources; 17.6 cm per turn). Advanced base 87.95 mm follows
  from the official 27.63 cm.
- **Track width**: ≈ 112 mm (basic) and ≈ 142 mm (advanced), derived from the official turn programs assuming a
  spin on the spot. A unit test checks that 182 motor degrees at steering 100 gives 90° ± 2° with these values.
- Which Advanced Driving Base colour sensor (B or F) is left/right; every chassis outline; motor acceleration.
- **Every attachment dimension** (fork, wide fork, dozer blade, lift arm, grabber, bumper), joint ranges
  (lift 0–80°, claw 0–90°) and 1:1 gearing. The official Dozer Blade and Lift Arm geometry is not published,
  so those two are generic stand-ins on the official motor ports.
- **All mat object sizes** (seed pods 4.8 cm and 9.6 cm across, crate 9.6 cm, …).
- SPIKE word-block defaults taken from secondary sources: movement speed 50 %, motor speed 75 %, default pair A+B.

## Calibrating to a real robot

Measure the wheel diameter and the distance between the wheel centres, enter them under
Robot → Ports and calibration, and (Settings) choose "Like a new hub" if the program does not set
"1 motor rotation". Wheel slip can be dialled in; any slip above 0 marks all distances as estimates.

## Practice kit and tables (all approximate)

None of these is a LEGO part or a copy of a mission model. They are generic stand-ins.

| Thing | What SPIKE Lab does | What it does not model |
|---|---|---|
| Competition table | A walled mat of 236.2 × 114.3 cm, the common competition mat size. The wall sits at the mat's edge. | The gap between mat and wall, the wall's real height. |
| Table picture | A photo straightened from four marked corners, drawn at the mat's size. | Lens distortion; anything standing on the mat appears flat and leaning. Places are only as exact as the photo and the corners. |
| Push bar | A 12 × 2.4 cm bar that slides up to 8 cm along its rail, only when pushed from its front. Task: pushed at least 5 cm (2–8 cm). | Levers, hinges, anything that swings, tips or springs back. |
| Press plate | A fixed 8 × 4 cm block. Task: any part of the robot or its tool touches the front face. | How hard it is pressed; buttons that need a certain height. |
| Pull ring | A ring 3.6 cm across. A hook catches it as soon as the hook's tip reaches it; it then follows the hook. Task: pulled at least 10 cm (5–30 cm) while on the hook. | A hook missing or slipping; letting the ring go; the ring's height. |
| Block height | Low 4 cm, medium 8 cm, tall 16 cm. | Height is for looks only: every block stops the robot the same way. |
| "Do not touch" | Ticked until the robot's body or tool first comes within 2 mm of the block. | Wobble or knocking over. |
| Hook | A fixed arm 1.6 cm wide and 11 cm long (both adjustable) with a small barb at the tip. | A motorised hook, a hook on the side or the back, two tools at once. |
| Ram | "My own tool": a plain block of any width and length that pushes. | Its real shape and weight. |
