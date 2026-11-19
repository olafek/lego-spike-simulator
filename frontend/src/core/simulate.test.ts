import { describe, expect, it } from 'vitest'
import { makeBlock, normaliseRecognition, RecognitionError, type Block, type Condition, type Program } from './ir'
import { ATTACHMENTS, ROBOTS, resolveRobot, wheelCircumferenceMm, type AttachmentInstance } from './robots'
import { emptyScene, makeObject, type Scene } from './scene'
import { simulate, type SimResult, type SimSetup } from './simulate'
import { boundaries, cellsCovered, nextBoundary, prevBoundary, readout } from './timeline'
import { DEG } from './units'

function blk(op: string, params: Record<string, unknown> = {}, extra: Partial<Block> = {}): Block {
  const b = makeBlock(op)
  Object.assign(b.params, params)
  return Object.assign(b, extra)
}

function prog(...stacks: Block[][]): Program {
  return { irVersion: 1, notes: [], stacks: stacks.map((blocks, i) => ({ id: `s${i}`, hat: { op: 'when_program_starts' as const }, blocks })) }
}

function run(program: Program, over: Partial<SimSetup> = {}): SimResult {
  return simulate({ program, robot: resolveRobot('db1'), attachments: [], scene: emptyScene(), ...over })
}

const last = (r: SimResult) => r.frames[r.frames.length - 1]

describe('straight moves on the metric grid', () => {
  it('moves exactly 300 mm for "move forward 30 cm" in the ideal setup', () => {
    const r = run(prog([blk('move_for', { direction: 'forward', amount: 30, unit: 'cm' })]))
    expect(r.status).toBe('finished')
    expect(r.exact).toBe(true)
    expect(last(r).y).toBeCloseTo(300, 6)
    expect(last(r).x).toBeCloseTo(0, 6)
    expect(last(r).path).toBeCloseTo(300, 6)
  })

  it('covers exactly three 10 cm grid cells', () => {
    const r = run(prog([blk('move_for', { direction: 'forward', amount: 30, unit: 'cm' })]))
    expect(cellsCovered(last(r).path, 100)).toBeCloseTo(3, 6)
    // the readout the child sees
    const ro = readout(r, r.frames.length - 1)
    expect(ro.move?.commandedMm).toBe(300)
    expect(ro.move?.actualMm).toBeCloseTo(300, 6)
    expect(ro.move?.remainingMm).toBeCloseTo(0, 6)
  })

  it('reports distance remaining part-way through', () => {
    const r = run(prog([blk('move_for', { direction: 'forward', amount: 30, unit: 'cm' })]))
    const mid = Math.floor(r.frames.length / 2)
    const ro = readout(r, mid)
    expect(ro.move!.running).toBe(true)
    expect(ro.move!.actualMm).toBeGreaterThan(50)
    expect(ro.move!.actualMm + ro.move!.remainingMm!).toBeCloseTo(300, 6)
  })

  it('drives backward', () => {
    const r = run(prog([blk('move_for', { direction: 'backward', amount: 12, unit: 'cm' })]))
    expect(last(r).y).toBeCloseTo(-120, 6)
    expect(last(r).h).toBeCloseTo(0, 9)
  })

  it('supports inches', () => {
    const r = run(prog([blk('move_for', { direction: 'forward', amount: 10, unit: 'in' })]))
    expect(last(r).y).toBeCloseTo(254, 6)
  })

  it('is deterministic: two runs give identical timelines', () => {
    const p = prog([blk('move_steering_for', { steering: 35, amount: 40, unit: 'cm' }), blk('turn_for', { direction: 'left', degrees: 77 })])
    expect(JSON.stringify(run(p).frames)).toBe(JSON.stringify(run(p).frames))
  })

  it('hardware calibration: SPIKE default 17.5 cm with 56 mm wheels is flagged as not exact', () => {
    const r = run(prog([blk('move_for', { direction: 'forward', amount: 30, unit: 'cm' })]), { options: { calibration: 'hardware' } })
    const expected = (300 / 175) * wheelCircumferenceMm(resolveRobot('db1'))
    expect(last(r).y).toBeCloseTo(expected, 6)
    expect(r.exact).toBe(false)
    expect(r.assumptions.join(' ')).toMatch(/17\.50 cm/)
  })

  it('slip makes the result an estimate and shortens the move', () => {
    const r = run(prog([blk('move_for', { direction: 'forward', amount: 30, unit: 'cm' })]), { options: { slip: 0.1 } })
    expect(last(r).y).toBeCloseTo(270, 6)
    expect(r.exact).toBe(false)
  })
})

describe('turning: heading degrees vs motor degrees vs wheel rotations', () => {
  it('turns 90° right and 90° left by heading', () => {
    const right = run(prog([blk('turn_for', { direction: 'right', degrees: 90 })]))
    expect(last(right).h / DEG).toBeCloseTo(90, 6)
    expect(last(right).path).toBeCloseTo(0, 6)
    const left = run(prog([blk('turn_for', { direction: 'left', degrees: 90 })]))
    expect(last(left).h / DEG).toBeCloseTo(-90, 6)
  })

  it('"move forward 90 degrees" turns the WHEELS 90°, it does not turn the robot', () => {
    const r = run(prog([blk('move_for', { direction: 'forward', amount: 90, unit: 'degrees' })]))
    const circ = wheelCircumferenceMm(resolveRobot('db1'))
    expect(last(r).h).toBeCloseTo(0, 9)
    expect(last(r).y).toBeCloseTo(circ / 4, 6)
  })

  it('"move forward 2 rotations" rolls two wheel circumferences', () => {
    const r = run(prog([blk('move_for', { direction: 'forward', amount: 2, unit: 'rotations' })]))
    expect(last(r).y).toBeCloseTo(2 * wheelCircumferenceMm(resolveRobot('db1')), 6)
  })

  it('"move right for 90 degrees" spins using 90 MOTOR degrees (much less than a 90° robot turn)', () => {
    const robot = resolveRobot('db1')
    const r = run(prog([blk('move_for', { direction: 'right', amount: 90, unit: 'degrees' })]))
    const wheelMm = wheelCircumferenceMm(robot) / 4
    const expectedHeading = wheelMm / (robot.trackWidthMm / 2) / DEG
    expect(last(r).h / DEG).toBeCloseTo(expectedHeading, 6)
    expect(expectedHeading).toBeLessThan(50)
  })

  it('official LEGO program: 182 motor degrees at steering 100 is about a 90° turn on the Driving Base', () => {
    const r = run(prog([blk('move_steering_for', { steering: 100, amount: 182, unit: 'degrees' })]))
    expect(Math.abs(last(r).h / DEG - 90)).toBeLessThan(2)
  })

  it('steering 50 pivots around the stopped right wheel', () => {
    const robot = resolveRobot('db1')
    const r = run(prog([blk('move_steering_for', { steering: 50, amount: 1, unit: 'rotations' })]))
    expect(last(r).wheelR).toBeCloseTo(0, 9)
    expect(last(r).wheelL).toBeCloseTo(wheelCircumferenceMm(robot), 6)
    expect(last(r).h).toBeCloseTo(wheelCircumferenceMm(robot) / robot.trackWidthMm, 6)
  })

  it('drives a square and comes home', () => {
    const side = [blk('move_for', { direction: 'forward', amount: 20, unit: 'cm' }), blk('turn_for', { direction: 'right', degrees: 90 })]
    const r = run(prog([blk('repeat', { times: 4 }, { children: side })]))
    expect(last(r).x).toBeCloseTo(0, 5)
    expect(last(r).y).toBeCloseTo(0, 5)
    expect(last(r).h / DEG).toBeCloseTo(360, 5)
    expect(last(r).path).toBeCloseTo(800, 5)
  })
})

describe('robot configurations and port mapping', () => {
  it('has four distinct robots with documented drive ports', () => {
    const ids = ROBOTS.map((r) => r.id)
    expect(ids).toEqual(['db1', 'db2', 'db3', 'adb'])
    expect(ROBOTS[0].drive.left.port + ROBOTS[0].drive.right.port).toBe('CD')
    expect(ROBOTS[3].drive.left.port + ROBOTS[3].drive.right.port).toBe('AE')
    expect(ROBOTS[3].wheelDiameterMm).not.toBe(ROBOTS[0].wheelDiameterMm)
    expect(ROBOTS[3].trackWidthMm).not.toBe(ROBOTS[0].trackWidthMm)
  })

  it('the same motor-rotation program travels further on the Advanced Driving Base', () => {
    const p = prog([blk('move_for', { direction: 'forward', amount: 1, unit: 'rotations' })])
    const a = run(p)
    const b = run(p, { robot: resolveRobot('adb') })
    expect(last(a).y).toBeCloseTo(175.93, 1)
    expect(last(b).y).toBeCloseTo(276.3, 4)
  })

  it('driving the wrong motor pair does not move the wheels, and says so', () => {
    const r = run(prog([blk('set_movement_motors', { ports: 'A+B' }), blk('move_for', { direction: 'forward', amount: 10, unit: 'cm' })]))
    expect(last(r).path).toBe(0)
    expect(r.warnings.join(' ')).toMatch(/wheels are on C\+D/)
  })

  it('a swapped pair (D+C) drives backwards, like the real robot', () => {
    const r = run(prog([blk('set_movement_motors', { ports: 'D+C' }), blk('move_for', { direction: 'forward', amount: 10, unit: 'cm' })]))
    expect(last(r).y).toBeCloseTo(-100, 6)
  })

  it('states the assumption when the program never sets the movement motors', () => {
    const r = run(prog([blk('move_for', { direction: 'forward', amount: 10, unit: 'cm' })]))
    expect(r.assumptions.join(' ')).toMatch(/does not set the movement motors/)
  })

  it('a single drive motor turns only its wheel', () => {
    const r = run(prog([blk('motor_run_for', { ports: 'D', direction: 'clockwise', amount: 1, unit: 'rotations' })]))
    expect(last(r).wheelL).toBe(0)
    expect(last(r).wheelR).toBeCloseTo(wheelCircumferenceMm(resolveRobot('db1')), 6)
    expect(last(r).h).toBeLessThan(0) // right wheel forward => robot turns left
  })

  it('calibration overrides change the physics', () => {
    const r = run(prog([blk('turn_for', { direction: 'right', degrees: 90 })]), { robot: resolveRobot('db1', { trackWidthMm: 150 }) })
    expect(last(r).h / DEG).toBeCloseTo(90, 6)
    expect(Math.abs(last(r).wheelL)).toBeCloseTo((Math.PI / 2) * 75, 6)
  })
})

describe('concurrency', () => {
  it('two stacks run at the same time, not one after the other', () => {
    const lift: AttachmentInstance = { uid: 'arm', kind: 'lift_arm', port: 'E' }
    const p = prog(
      [blk('move_for', { direction: 'forward', amount: 30, unit: 'cm' })],
      [blk('motor_run_for', { ports: 'E', direction: 'clockwise', amount: 60, unit: 'degrees' })],
    )
    const r = run(p, { attachments: [lift] })
    const solo = run(prog([blk('move_for', { direction: 'forward', amount: 30, unit: 'cm' })]))
    expect(r.frames.length).toBe(solo.frames.length) // no extra time for the arm
    const mid = r.frames[20]
    expect(mid.y).toBeGreaterThan(0)
    expect(mid.joints.arm).toBeGreaterThan(0)
    expect(mid.active.length).toBe(2)
    expect(last(r).joints.arm).toBeCloseTo(60, 6)
  })

  it('"start moving" does not wait: the next block runs while the robot drives', () => {
    const r = run(prog([blk('start_moving', { direction: 'forward' }), blk('wait_seconds', { seconds: 1 }), blk('stop_moving')]))
    expect(last(r).t).toBeCloseTo(1, 6)
    expect(last(r).y).toBeGreaterThan(200)
  })

  it('"motor start" keeps running during the following move', () => {
    const lift: AttachmentInstance = { uid: 'arm', kind: 'lift_arm', port: 'E' }
    const r = run(prog([blk('motor_set_speed', { ports: 'E', speed: 10 }), blk('motor_start', { ports: 'E', direction: 'clockwise' }), blk('move_for', { direction: 'forward', amount: 10, unit: 'cm' })]), { attachments: [lift] })
    expect(last(r).joints.arm).toBeGreaterThan(10)
    expect(last(r).y).toBeCloseTo(100, 6)
  })
})

describe('loops, waits and safety guards', () => {
  it('repeat runs its body the right number of times', () => {
    const r = run(prog([blk('repeat', { times: 3 }, { children: [blk('move_for', { direction: 'forward', amount: 5, unit: 'cm' })] })]))
    expect(last(r).y).toBeCloseTo(150, 6)
    expect(r.spans.length).toBe(3)
  })

  it('wait takes simulated time, independent of rendering', () => {
    const r = run(prog([blk('wait_seconds', { seconds: 2.5 })]))
    expect(last(r).t).toBeCloseTo(2.5, 6)
    expect(r.frames.length).toBe(251)
  })

  it('forever is cut off at the safety limit and explains why', () => {
    const r = run(prog([blk('forever', {}, { children: [blk('move_for', { direction: 'forward', amount: 5, unit: 'cm' })] })]), { options: { maxSeconds: 5 } })
    expect(r.status).toBe('cutoff')
    expect(r.reason).toMatch(/safety limit/)
    expect(last(r).t).toBeCloseTo(5, 6)
  })

  it('an empty forever loop cannot hang the simulator', () => {
    const r = run(prog([blk('forever', {}, { children: [] })]), { options: { maxSeconds: 2 } })
    expect(r.status).toBe('cutoff')
  })

  it('a sensor wait that never comes true times out with an explanation', () => {
    const cond: Condition = { type: 'color', port: 'B', color: 'black' }
    const sensor: AttachmentInstance = { uid: 'c', kind: 'color_sensor', port: 'B' }
    const r = run(prog([blk('wait_until', {}, { condition: cond })]), { attachments: [sensor], options: { waitTimeoutSeconds: 3 } })
    expect(r.status).toBe('cutoff')
    expect(r.reason).toMatch(/never came true/)
    expect(last(r).t).toBeCloseTo(3, 1)
  })

  it('a runaway motor command is stopped by the time limit', () => {
    const r = run(prog([blk('motor_start', { ports: 'C', direction: 'clockwise' }), blk('wait_seconds', { seconds: 600 })]), { options: { maxSeconds: 4 } })
    expect(r.status).toBe('cutoff')
  })

  it('refuses to run when a value could not be read', () => {
    const r = run(prog([blk('move_for', { direction: 'forward', amount: null, unit: 'cm' })]))
    expect(r.status).toBe('invalid')
    expect(r.frames.length).toBe(1)
  })

  it('unsupported blocks are skipped and reported, never faked', () => {
    const r = run(prog([blk('unsupported', {}, { text: 'play video' }), blk('move_for', { direction: 'forward', amount: 10, unit: 'cm' })]))
    expect(r.warnings.join(' ')).toMatch(/cannot run yet/)
    expect(last(r).y).toBeCloseTo(100, 6)
  })

  it('variables and arithmetic work', () => {
    const p = prog([
      blk('set_variable', { name: 'd', value: 5 }),
      blk('change_variable', { name: 'd', by: { type: 'op', op: '*', a: { type: 'var', name: 'd' }, b: 2 } }),
      blk('move_for', { direction: 'forward', amount: { type: 'var', name: 'd' }, unit: 'cm' }),
    ])
    const r = run(p)
    expect(last(r).vars.d).toBe(15)
    expect(last(r).y).toBeCloseTo(150, 6)
  })
})

describe('sensors', () => {
  it('drives until the colour sensor sees the black line', () => {
    const scene: Scene = { ...emptyScene(), objects: [{ ...makeObject('line', 0, 400), rot: 90 }] }
    const sensor: AttachmentInstance = { uid: 'c', kind: 'color_sensor', port: 'B' }
    const p = prog([blk('start_moving', { direction: 'forward' }), blk('wait_until', {}, { condition: { type: 'color', port: 'B', color: 'black' } }), blk('stop_moving')])
    const r = run(p, { scene, attachments: [sensor], robot: resolveRobot('db3') })
    expect(r.status).toBe('finished')
    const sensorY = last(r).y + resolveRobot('db3').mounts.colorSensor.y
    expect(sensorY).toBeGreaterThan(389)
    expect(sensorY).toBeLessThan(411)
  })

  it('stops when the distance sensor is closer than 10 cm to a wall', () => {
    const scene: Scene = { ...emptyScene(), objects: [makeObject('wall', 0, 600)] }
    const sensor: AttachmentInstance = { uid: 'd', kind: 'distance_sensor', port: 'F' }
    const cond: Condition = { type: 'distance', port: 'F', comparator: 'closer_than', value: 10, unit: 'cm' }
    const r = run(prog([blk('start_moving', { direction: 'forward' }), blk('wait_until', {}, { condition: cond }), blk('stop_moving')]), { scene, attachments: [sensor] })
    expect(r.status).toBe('finished')
    const gap = 600 - 12 - (last(r).y + resolveRobot('db1').mounts.frontMm)
    expect(gap).toBeLessThan(100)
    expect(gap).toBeGreaterThan(85)
  })

  it('if/else picks a branch from a sensor', () => {
    const sensor: AttachmentInstance = { uid: 'c', kind: 'color_sensor', port: 'B' }
    const p = prog([
      blk('if_else', {}, {
        condition: { type: 'color', port: 'B', color: 'black' },
        children: [blk('move_for', { direction: 'forward', amount: 10, unit: 'cm' })],
        elseChildren: [blk('move_for', { direction: 'backward', amount: 10, unit: 'cm' })],
      }),
    ])
    expect(last(run(p, { attachments: [sensor] })).y).toBeCloseTo(-100, 6)
  })

  it('warns when the program reads a sensor the robot does not have', () => {
    const r = run(prog([blk('if', {}, { condition: { type: 'force', port: 'A', state: 'pressed' }, children: [] })]))
    expect(r.warnings.join(' ')).toMatch(/no force sensor on port A/)
  })
})

describe('objects, pushing and lifting (documented approximations)', () => {
  const fork: AttachmentInstance = { uid: 'fork', kind: 'fork', port: null }
  const robot = resolveRobot('db1')
  const reach = robot.mounts.frontMm + ATTACHMENTS.fork.lengthMm
  // the round pod (r = 48) sits between the tine tips, whose inner edges are 28 mm from the centre line
  const nest = Math.sqrt(48 ** 2 - 28 ** 2)

  it('a passive fork pushes a large seed pod exactly as far as the robot keeps moving', () => {
    const pod = makeObject('seed_pod_large', 0, 300)
    const r = run(prog([blk('move_for', { direction: 'forward', amount: 30, unit: 'cm' })]), { attachments: [fork], scene: { ...emptyScene(), objects: [pod] } })
    const end = last(r).objects[0]
    expect(end.y).toBeCloseTo(300 + reach + nest, 1) // tine tips touching the pod
    expect(end.z).toBe(0) // a passive fork never lifts
    expect(end.carried).toBe(false)
  })

  it('a passive fork does not drag an object backwards', () => {
    const pod = makeObject('seed_pod_large', 0, 250)
    const p = prog([blk('move_for', { direction: 'forward', amount: 20, unit: 'cm' }), blk('move_for', { direction: 'backward', amount: 20, unit: 'cm' })])
    const r = run(p, { attachments: [fork], scene: { ...emptyScene(), objects: [pod] } })
    expect(last(r).y).toBeCloseTo(0, 6)
    expect(last(r).objects[0].y).toBeCloseTo(200 + reach + nest, 1)
  })

  it('running a motor does nothing to a passive fork', () => {
    const r = run(prog([blk('motor_run_for', { ports: 'E', direction: 'clockwise', amount: 90, unit: 'degrees' })]), { attachments: [fork] })
    expect(last(r).joints.fork).toBeUndefined()
    expect(r.warnings.join(' ')).toMatch(/Nothing is connected to port E/)
  })

  it('an active lift arm follows its motor and lifts a crate, then carries it', () => {
    const arm: AttachmentInstance = { uid: 'arm', kind: 'lift_arm', port: 'E' }
    const crate = makeObject('cube', 0, 64 + 96 + 30)
    const p = prog([
      blk('move_for', { direction: 'forward', amount: 2, unit: 'cm' }),
      blk('motor_run_for', { ports: 'E', direction: 'clockwise', amount: 45, unit: 'degrees' }),
      blk('move_for', { direction: 'forward', amount: 10, unit: 'cm' }),
    ])
    const r = run(p, { attachments: [arm], scene: { ...emptyScene(), objects: [crate] } })
    const end = last(r)
    expect(end.joints.arm).toBeCloseTo(45, 6)
    expect(end.objects[0].carried).toBe(true)
    expect(end.objects[0].z).toBeGreaterThan(40)
    expect(end.objects[0].y - end.y).toBeCloseTo(crate.y - 20, 3) // rides along at the spot where it was picked up
  })

  it('motor C drives the tool mapped to port C and nothing else', () => {
    const arm: AttachmentInstance = { uid: 'arm', kind: 'lift_arm', port: 'D' }
    const blade: AttachmentInstance = { uid: 'blade', kind: 'dozer', port: 'C' }
    const r = run(prog([blk('motor_run_for', { ports: 'C', direction: 'clockwise', amount: 30, unit: 'degrees' })]), { robot: resolveRobot('adb'), attachments: [arm, blade] })
    expect(last(r).joints.blade).toBeCloseTo(30, 6)
    expect(last(r).joints.arm).toBe(0)
  })

  it('a lift arm stalls at its mechanical limit instead of spinning forever', () => {
    const arm: AttachmentInstance = { uid: 'arm', kind: 'lift_arm', port: 'E' }
    const r = run(prog([blk('motor_run_for', { ports: 'E', direction: 'clockwise', amount: 2, unit: 'rotations' })]), { attachments: [arm] })
    expect(r.status).toBe('finished')
    expect(last(r).joints.arm).toBe(80)
    expect(r.events.some((e) => /reached its limit/.test(e.text))).toBe(true)
  })

  it('a grabber closes on an object, carries it and lets go', () => {
    const claw: AttachmentInstance = { uid: 'claw', kind: 'grabber', port: 'E' }
    const pod = makeObject('seed_pod_small', 0, 64 + 40)
    const p = prog([
      blk('motor_run_for', { ports: 'E', direction: 'clockwise', amount: 90, unit: 'degrees' }),
      blk('move_for', { direction: 'backward', amount: 10, unit: 'cm' }),
    ])
    const r = run(p, { attachments: [claw], scene: { ...emptyScene(), objects: [pod] } })
    expect(last(r).objects[0].carried).toBe(true)
    expect(last(r).objects[0].y).toBeCloseTo(pod.y - 100, 3)
    const r2 = run({ ...p, stacks: [{ ...p.stacks[0], blocks: [...p.stacks[0].blocks, blk('motor_run_for', { ports: 'E', direction: 'counterclockwise', amount: 90, unit: 'degrees' })] }] }, { attachments: [claw], scene: { ...emptyScene(), objects: [pod] } })
    expect(last(r2).objects[0].carried).toBe(false)
  })

  it('the robot is blocked by a wall and reports it', () => {
    const r = run(prog([blk('move_for', { direction: 'forward', amount: 50, unit: 'cm' })]), { scene: { ...emptyScene(), objects: [makeObject('wall', 0, 300)] } })
    expect(last(r).y).toBeLessThan(300 - 12 - robot.chassis.frontMm + 1)
    expect(last(r).y).toBeGreaterThan(200)
    expect(last(r).wheelL).toBeCloseTo(500, 6) // wheels kept turning
    expect(r.warnings.join(' ')).toMatch(/stuck/)
  })

  it('checks the mission goal from the simulated end state only', () => {
    const pod = makeObject('seed_pod_large', 0, 250)
    const zone = makeObject('target_zone', 0, 500)
    const scene: Scene = { ...emptyScene(), objects: [zone, pod], goal: { type: 'object_in_zone', objectId: pod.id, zoneId: zone.id } }
    const short = run(prog([blk('move_for', { direction: 'forward', amount: 10, unit: 'cm' })]), { attachments: [fork], scene })
    expect(short.goal?.met).toBe(false)
    const far = run(prog([blk('move_for', { direction: 'forward', amount: 30, unit: 'cm' })]), { attachments: [fork], scene })
    expect(far.goal?.met).toBe(true)
  })
})

describe('timeline: stepping and complete rewind', () => {
  const arm: AttachmentInstance = { uid: 'arm', kind: 'lift_arm', port: 'E' }
  const fork: AttachmentInstance = { uid: 'fork', kind: 'fork', port: null }
  const p = prog([
    blk('set_variable', { name: 'n', value: 1 }),
    blk('move_for', { direction: 'forward', amount: 30, unit: 'cm' }),
    blk('motor_run_for', { ports: 'E', direction: 'clockwise', amount: 40, unit: 'degrees' }),
    blk('change_variable', { name: 'n', by: 1 }),
    blk('turn_for', { direction: 'right', degrees: 90 }),
  ])
  const scene: Scene = { ...emptyScene(), objects: [makeObject('seed_pod_large', 0, 300)] }
  const r = run(p, { attachments: [arm, fork], scene })

  it('steps one full instruction forward and backward', () => {
    const bs = boundaries(r)
    expect(bs[0]).toBe(0)
    expect(bs.length).toBe(4) // start, arm start, turn start, end (zero-time blocks share a boundary)
    const afterMove = nextBoundary(r, 0)
    expect(r.frames[afterMove].y).toBeCloseTo(300, 6)
    const afterArm = nextBoundary(r, afterMove)
    expect(r.frames[afterArm].joints.arm).toBeCloseTo(40, 6)
    expect(prevBoundary(r, afterArm)).toBe(afterMove)
    expect(prevBoundary(r, afterMove + 5)).toBe(afterMove)
    expect(nextBoundary(r, r.frames.length - 1)).toBe(r.frames.length - 1)
  })

  it('stepping back restores pose, wheels, motors, attachments, objects and variables', () => {
    const afterMove = nextBoundary(r, 0)
    const snapshot = JSON.stringify(r.frames[afterMove])
    // go to the end and come back: the snapshot is the same object, untouched by later steps
    const end = r.frames[r.frames.length - 1]
    expect(end.vars.n).toBe(2)
    expect(end.joints.arm).toBeCloseTo(40, 6)
    expect(JSON.stringify(r.frames[prevBoundary(r, nextBoundary(r, afterMove))])).toBe(snapshot)
    const back = r.frames[afterMove]
    expect(back.vars.n).toBe(1)
    expect(back.joints.arm).toBe(0)
    expect(back.h).toBe(0)
    expect(back.motors.E ?? 0).toBe(0)
    expect(back.objects[0].y).toBeGreaterThan(300) // the pod stays where it had been pushed to at that moment
    expect(r.frames[0].objects[0].y).toBe(300)
    expect(r.frames[0].vars.n).toBeUndefined()
  })

  it('highlights the block that is running in every frame', () => {
    const moveId = p.stacks[0].blocks[1].id
    const turnId = p.stacks[0].blocks[4].id
    expect(r.frames[10].active).toEqual([moveId])
    expect(r.frames[r.frames.length - 5].active).toEqual([turnId])
    expect(r.frames[r.frames.length - 1].active).toEqual([])
  })
})

describe('recognition schema validation', () => {
  it('rejects a response with the wrong shape', () => {
    expect(() => normaliseRecognition({ blocks: [] })).toThrow(RecognitionError)
    expect(() => normaliseRecognition('nope')).toThrow(RecognitionError)
  })

  it('keeps unreadable values as null and flags them instead of guessing', () => {
    const { program } = normaliseRecognition({
      stacks: [
        {
          hat: { op: 'when_program_starts' },
          blocks: [
            { op: 'move_for', params: { direction: 'forward', amount: null, unit: 'cm' }, confidence: 0.9, uncertain: ['amount'] },
            { op: 'motor_run_for', params: { ports: 'Z', direction: 'clockwise', amount: 90, unit: 'degrees' }, confidence: 0.95 },
            { op: 'fly_to_the_moon', text: 'fly' },
            { op: 'move_for', params: { direction: 'sideways', amount: '20', unit: 'cm' } },
          ],
        },
        { hat: null, blocks: [{ op: 'wait_seconds', params: { seconds: 1 }, confidence: 1 }] },
      ],
    })
    const [a, b, c, d] = program.stacks[0].blocks
    expect(a.params.amount).toBeNull()
    expect(a.uncertain).toContain('amount')
    expect(a.confidence).toBeLessThanOrEqual(0.5)
    expect(b.params.ports).toBeNull()
    expect(b.uncertain).toContain('ports')
    expect(c.op).toBe('unsupported')
    expect(d.params.direction).toBeNull()
    expect(d.params.amount).toBe(20)
    expect(program.stacks[1].hat).toBeNull()
    // and the simulator will not pretend
    expect(simulate({ program, robot: resolveRobot('db1'), attachments: [], scene: emptyScene() }).status).toBe('invalid')
  })

  it('does not confuse motor degrees with heading degrees', () => {
    const { program } = normaliseRecognition({
      stacks: [{ hat: { op: 'when_program_starts' }, blocks: [{ op: 'motor_run_for', params: { ports: 'c', direction: 'Clockwise', amount: 90, unit: 'degrees' }, confidence: 1 }] }],
    })
    const b = program.stacks[0].blocks[0]
    expect(b.op).toBe('motor_run_for')
    expect(b.params.ports).toBe('C')
    const r = simulate({ program, robot: resolveRobot('db1'), attachments: [], scene: emptyScene() })
    // motor C is the left wheel: 90 MOTOR degrees is a small pivot, nowhere near a 90° heading turn
    expect(Math.abs(last(r).h / DEG)).toBeLessThan(30)
    expect(Math.abs(last(r).wheelL)).toBeCloseTo(wheelCircumferenceMm(resolveRobot('db1')) / 4, 6)
  })

  it('disconnected stacks are kept but never run', () => {
    const { program } = normaliseRecognition({ stacks: [{ hat: null, blocks: [{ op: 'move_for', params: { direction: 'forward', amount: 10, unit: 'cm' }, confidence: 1 }] }] })
    const r = simulate({ program, robot: resolveRobot('db1'), attachments: [], scene: emptyScene() })
    expect(r.status).toBe('empty')
  })
})
