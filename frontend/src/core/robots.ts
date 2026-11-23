// Robot and attachment definitions. All values are DATA: editable in Settings and saved per project.
//
// Sources (see docs/robots.md for links):
//  VERIFIED from official LEGO Education material:
//   - Driving Base drive motors: left C, right D; Training Camp 2 arm motor E + distance sensor F;
//     Training Camp 3 colour sensor B (SPIKE Prime Python Programs PDF, Feb 2024).
//   - Advanced Driving Base: drive A (left) / E (right), dozer blade motor C, lift arm motor D,
//     colour sensors on B and F, "wheel circumference is 27.63 cm".
//   - Motor no-load speed: medium 185 RPM, large 175 RPM. Hub 88 x 56 x 32 mm.
//   - Distance sensor range 50-2000 mm.
//  NOT officially published (approximations, clearly labelled in the UI):
//   - 56 mm wheel diameter of the basic base (secondary sources), track widths (derived from the
//     official turn programs: ~112 mm and ~142 mm), chassis envelopes, every attachment dimension.

import type { Port } from './catalog'

export interface DriveMotor {
  port: Port
  /** +1: positive (clockwise) motor degrees roll the wheel forward. -1: mirrored mounting. */
  polarity: 1 | -1
}

export interface RobotConfig {
  id: string
  name: string
  tagline: string
  wheelDiameterMm: number
  /** distance between the two wheel contact centres */
  trackWidthMm: number
  /** wheel turns per motor turn */
  gearRatio: number
  drive: { left: DriveMotor; right: DriveMotor }
  motorType: 'medium' | 'large'
  /** motor speed at 100 % (deg/s). No-load figure: real robots are a little slower. */
  motorMaxDegPerSec: number
  /** approximation of the hub's speed ramp */
  accelDegPerSec2: number
  /** chassis envelope in the robot frame (origin = midpoint between the drive wheels, y forward) */
  chassis: { widthMm: number; frontMm: number; rearMm: number; heightMm: number }
  wheelWidthMm: number
  mounts: {
    /** tools attach here (y forward of the axle) */
    frontMm: number
    /** downward-facing colour sensor position(s) */
    colorSensor: { x: number; y: number }
    colorSensor2?: { x: number; y: number }
  }
  defaultAttachments: AttachmentInstance[]
  /** what the hub assumes one motor rotation moves when the program does not say (SPIKE app default) */
  spikeDefaultMotorRotationMm: number
  accuracy: { verified: string[]; approximate: string[] }
}

export type AttachmentKind = 'fork' | 'wide_fork' | 'dozer' | 'lift_arm' | 'grabber' | 'bumper' | 'custom' | 'hook' | 'color_sensor' | 'distance_sensor' | 'force_sensor'

export interface AttachmentDef {
  kind: AttachmentKind
  name: string
  group: 'tool' | 'sensor'
  description: string
  /** needs a motor port to move */
  motorised: boolean
  /** can optionally be driven by a motor */
  optionalMotor?: boolean
  joint?: { type: 'lift' | 'claw'; minDeg: number; maxDeg: number; restDeg: number; /** joint degrees per motor degree */ gearRatio: number }
  sensor?: 'color' | 'distance' | 'force'
  /** reach in front of the mount (mm) */
  lengthMm: number
  widthMm: number
  approximations: string
}

export interface AttachmentInstance {
  uid: string
  kind: AttachmentKind
  /** hub port for motorised tools and sensors; null for passive tools */
  port: Port | null
  /** custom attachment size */
  widthMm?: number
  lengthMm?: number
  /** which colour sensor mount (0 = centre/left, 1 = right) */
  slot?: number
}

export const ATTACHMENTS: Record<AttachmentKind, AttachmentDef> = {
  fork: {
    kind: 'fork',
    name: 'Fork',
    group: 'tool',
    description: 'Two fixed prongs. It can only push things – it never lifts.',
    motorised: false,
    lengthMm: 88,
    widthMm: 72,
    approximations: 'Generic passive fork, size approximate.',
  },
  wide_fork: {
    kind: 'wide_fork',
    name: 'Wide fork',
    group: 'tool',
    description: 'A wider fixed fork for big objects. Pushes only.',
    motorised: false,
    lengthMm: 88,
    widthMm: 128,
    approximations: 'Generic passive fork, size approximate.',
  },
  dozer: {
    kind: 'dozer',
    name: 'Dozer blade',
    group: 'tool',
    description: 'A flat blade that pushes. Give it a motor port to raise it out of the way.',
    motorised: false,
    optionalMotor: true,
    joint: { type: 'lift', minDeg: 0, maxDeg: 70, restDeg: 0, gearRatio: 1 },
    lengthMm: 24,
    widthMm: 168,
    approximations: 'Blade size and gearing approximate; official Dozer Blade geometry is not published.',
  },
  lift_arm: {
    kind: 'lift_arm',
    name: 'Lift arm',
    group: 'tool',
    description: 'A fork on a motor. Run its motor to lift and lower things.',
    motorised: true,
    joint: { type: 'lift', minDeg: 0, maxDeg: 80, restDeg: 0, gearRatio: 1 },
    lengthMm: 96,
    widthMm: 72,
    approximations: 'Arm length, range (0-80°) and 1:1 gearing are approximations. Lifting is simplified.',
  },
  grabber: {
    kind: 'grabber',
    name: 'Grabber claw',
    group: 'tool',
    description: 'Two jaws on a motor. Close them to grab, open them to let go.',
    motorised: true,
    joint: { type: 'claw', minDeg: 0, maxDeg: 90, restDeg: 0, gearRatio: 1 },
    lengthMm: 80,
    widthMm: 128,
    approximations: 'Jaw size and gearing approximate. Grabbing is simplified.',
  },
  bumper: {
    kind: 'bumper',
    name: 'Bumper',
    group: 'tool',
    description: 'A flat bar across the front. Pushes only.',
    motorised: false,
    lengthMm: 12,
    widthMm: 128,
    approximations: 'Generic bumper, size approximate.',
  },
  custom: {
    kind: 'custom',
    name: 'My own tool',
    group: 'tool',
    description: 'A plain block-shaped tool. You choose how wide and long it is. Use it as a ram: set how wide and long yours is.',
    motorised: false,
    lengthMm: 60,
    widthMm: 100,
    approximations: 'Simple box shape that pushes only.',
  },
  hook: {
    kind: 'hook',
    name: 'Hook',
    group: 'tool',
    description: 'A thin arm with a hook at the end. Drive it into a pull ring to catch the ring, then reverse to pull.',
    motorised: false,
    lengthMm: 110,
    widthMm: 16,
    approximations: '≈ A simple fixed hook. It catches a ring as soon as its tip reaches it and cannot let go again.',
  },
  color_sensor: {
    kind: 'color_sensor',
    name: 'Colour sensor',
    group: 'sensor',
    description: 'Looks down at the floor to see colours and lines.',
    motorised: false,
    sensor: 'color',
    lengthMm: 0,
    widthMm: 0,
    approximations: 'Reads the colour directly under one point. Reflected light uses fixed values per colour.',
  },
  distance_sensor: {
    kind: 'distance_sensor',
    name: 'Distance sensor',
    group: 'sensor',
    description: 'Looks forward and measures how far away the next thing is.',
    motorised: false,
    sensor: 'distance',
    lengthMm: 0,
    widthMm: 0,
    approximations: 'A single straight ray, 5-200 cm (official range). The real sensor sees a cone.',
  },
  force_sensor: {
    kind: 'force_sensor',
    name: 'Force sensor',
    group: 'sensor',
    description: 'A button on the front that feels when the robot bumps into something.',
    motorised: false,
    sensor: 'force',
    lengthMm: 16,
    widthMm: 16,
    approximations: 'Pressed or not pressed only. Force in newtons is not simulated.',
  },
}

const WHEEL_56 = 56
// "The wheel circumference is 27.63 cm" (official Advanced Driving Base lesson) => 87.95 mm
const WHEEL_ADB = 276.3 / Math.PI

const baseVerified = ['Drive motors: left C, right D', 'Medium motor no-load speed 185 RPM', 'Hub size 88 × 56 × 32 mm']
const baseApprox = ['Wheel diameter 56 mm (not officially published)', 'Track width ≈ 112 mm (derived from the official 90° turn program)', 'Chassis outline', 'Acceleration ramp']

function drivingBase(id: string, name: string, tagline: string, extra: AttachmentInstance[], verified: string[]): RobotConfig {
  return {
    id,
    name,
    tagline,
    wheelDiameterMm: WHEEL_56,
    trackWidthMm: 112,
    gearRatio: 1,
    drive: { left: { port: 'C', polarity: -1 }, right: { port: 'D', polarity: 1 } },
    motorType: 'medium',
    motorMaxDegPerSec: 1110,
    accelDegPerSec2: 2500,
    chassis: { widthMm: 104, frontMm: 64, rearMm: 96, heightMm: 72 },
    wheelWidthMm: 14,
    mounts: { frontMm: 64, colorSensor: { x: 0, y: 72 } },
    defaultAttachments: extra,
    spikeDefaultMotorRotationMm: 175,
    accuracy: { verified: [...baseVerified, ...verified], approximate: baseApprox },
  }
}

export const ROBOTS: RobotConfig[] = [
  drivingBase('db1', 'Driving Base 1', 'The simple base. Two wheels, no sensors.', [], []),
  drivingBase(
    'db2',
    'Driving Base 2',
    'Base + motor arm + distance sensor.',
    [
      { uid: 'db2-arm', kind: 'lift_arm', port: 'E' },
      { uid: 'db2-dist', kind: 'distance_sensor', port: 'F' },
    ],
    ['Arm motor on E', 'Distance sensor on F'],
  ),
  drivingBase('db3', 'Driving Base 3', 'Base + colour sensor for lines.', [{ uid: 'db3-color', kind: 'color_sensor', port: 'B', slot: 0 }], ['Colour sensor on B']),
  {
    id: 'adb',
    name: 'Advanced Driving Base',
    tagline: 'Big wheels, big motors, two colour sensors.',
    wheelDiameterMm: WHEEL_ADB,
    trackWidthMm: 142,
    gearRatio: 1,
    drive: { left: { port: 'A', polarity: -1 }, right: { port: 'E', polarity: 1 } },
    motorType: 'large',
    motorMaxDegPerSec: 1050,
    accelDegPerSec2: 2500,
    chassis: { widthMm: 128, frontMm: 112, rearMm: 96, heightMm: 96 },
    wheelWidthMm: 22,
    mounts: { frontMm: 112, colorSensor: { x: -24, y: 104 }, colorSensor2: { x: 24, y: 104 } },
    defaultAttachments: [
      { uid: 'adb-color-l', kind: 'color_sensor', port: 'B', slot: 0 },
      { uid: 'adb-color-r', kind: 'color_sensor', port: 'F', slot: 1 },
    ],
    spikeDefaultMotorRotationMm: 175,
    accuracy: {
      verified: ['Drive motors: left A, right E', 'Wheel circumference 27.63 cm', 'Dozer blade motor C, lift arm motor D', 'Colour sensors on B and F', 'Large motor no-load speed 175 RPM'],
      approximate: ['Track width ≈ 142 mm (derived from the official turn program)', 'Which colour sensor (B/F) is left or right', 'Chassis outline', 'Acceleration ramp'],
    },
  },
]

export const ROBOT_BY_ID: Record<string, RobotConfig> = Object.fromEntries(ROBOTS.map((r) => [r.id, r]))

/** Per-project calibration overrides (Settings screen). */
export interface RobotOverrides {
  wheelDiameterMm?: number
  trackWidthMm?: number
  leftPort?: Port
  rightPort?: Port
  leftPolarity?: 1 | -1
  rightPolarity?: 1 | -1
  gearRatio?: number
}

export function resolveRobot(id: string, overrides: RobotOverrides = {}): RobotConfig {
  const base = ROBOT_BY_ID[id] ?? ROBOTS[0]
  return {
    ...base,
    wheelDiameterMm: overrides.wheelDiameterMm ?? base.wheelDiameterMm,
    trackWidthMm: overrides.trackWidthMm ?? base.trackWidthMm,
    gearRatio: overrides.gearRatio ?? base.gearRatio,
    drive: {
      left: { port: overrides.leftPort ?? base.drive.left.port, polarity: overrides.leftPolarity ?? base.drive.left.polarity },
      right: { port: overrides.rightPort ?? base.drive.right.port, polarity: overrides.rightPolarity ?? base.drive.right.polarity },
    },
  }
}

export function hasOverrides(o: RobotOverrides | undefined): boolean {
  return !!o && Object.values(o).some((v) => v !== undefined)
}

/** Default tool port when a child adds a motorised tool to this robot. */
export function defaultToolPort(robot: RobotConfig, kind: AttachmentKind): Port | null {
  const def = ATTACHMENTS[kind]
  if (def.sensor) {
    if (robot.id === 'adb') return kind === 'color_sensor' ? 'B' : kind === 'distance_sensor' ? 'D' : 'C'
    return kind === 'color_sensor' ? 'B' : kind === 'distance_sensor' ? 'F' : 'A'
  }
  if (!def.motorised) return null
  if (robot.id === 'adb') return kind === 'lift_arm' ? 'D' : 'C'
  return 'E'
}

export function wheelCircumferenceMm(robot: RobotConfig): number {
  return Math.PI * robot.wheelDiameterMm * robot.gearRatio
}
