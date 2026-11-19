// Deterministic SPIKE program simulator.
//
// `simulate()` runs the whole program with a fixed timestep and records a complete world
// snapshot for every step (the Timeline). Playback, scrubbing and stepping backwards simply
// select a snapshot, so rewinding restores the entire state exactly: pose, wheels, motors,
// attachments, objects, variables, sensors and the blocks that were running.
// Nothing here knows about Vue, Three.js or the network.

import { BLOCK_BY_OP, COLOR_REFLECTION, type ColorName } from './catalog'
import { captureZone, clawAngleForGap, clawGap, isRaised, liftHeight, toolRects } from './attachmentGeometry'
import { boxShape, circleShape, mtv, overlaps, pointInShape, raycast, rectShape, toLocal, toWorld, type Pose, type Shape } from './geometry'
import { blockText, programProblems, type Block, type Condition, type Expr, type Program } from './ir'
import { ATTACHMENTS, wheelCircumferenceMm, type AttachmentInstance, type RobotConfig } from './robots'
import { CLASSROOM_MAT, OBJECT_DEFS, objectSize, type ObjectDef, type Scene } from './scene'
import { DEG, MM_PER_CM, MM_PER_INCH, wrapDeg180 } from './units'

export interface SimOptions {
  /** fixed timestep in seconds (independent of render FPS) */
  dt: number
  /** safety cutoff for the whole run */
  maxSeconds: number
  /** safety cutoff for one "wait until" */
  waitTimeoutSeconds: number
  /**
   * 'ideal': unless the program sets it, the hub is assumed to be calibrated to this robot's wheels.
   * 'hardware': use the SPIKE app default (1 rotation = 17.5 cm) like an untouched hub.
   */
  calibration: 'ideal' | 'hardware'
  /** fraction of wheel travel lost to slip (0 = ideal). Any value > 0 makes distances "estimated". */
  slip: number
}

export const DEFAULT_OPTIONS: SimOptions = { dt: 0.01, maxSeconds: 60, waitTimeoutSeconds: 20, calibration: 'ideal', slip: 0 }

export interface SimSetup {
  program: Program
  robot: RobotConfig
  attachments: AttachmentInstance[]
  scene: Scene
  options?: Partial<SimOptions>
}

export interface ObjState {
  id: string
  x: number
  y: number
  /** radians clockwise */
  rot: number
  /** height above the floor (carried by a lift arm) */
  z: number
  carried: boolean
}

export interface Frame {
  t: number
  x: number
  y: number
  /** heading, radians clockwise from +y, NOT wrapped (so total turning can be measured) */
  h: number
  /** motor angle in degrees per port */
  motors: Record<string, number>
  /** joint angle in degrees per attachment uid */
  joints: Record<string, number>
  objects: ObjState[]
  vars: Record<string, number>
  /** ids of the blocks running in this step (one per parallel stack) */
  active: string[]
  /** distance travelled by the robot centre so far (mm, always positive) */
  path: number
  /** signed wheel travel so far (mm) */
  wheelL: number
  wheelR: number
  blocked: boolean
  light: string | null
  /** sensor readings per attachment uid */
  sensors: Record<string, string | number | boolean>
  yaw: number
}

export interface Span {
  blockId: string
  stackId: string
  /** frame index when the block started / finished */
  start: number
  end: number
  kind: 'move' | 'turn' | 'motor' | 'wait' | 'other'
  /** what the child asked for, in mm of robot travel (when the block has a distance) */
  commandedMm?: number
  /** what the child asked for, in degrees of robot heading */
  commandedDeg?: number
  text: string
}

export interface SimEvent {
  t: number
  frame: number
  level: 'info' | 'warn'
  text: string
  blockId?: string
}

export interface SimResult {
  frames: Frame[]
  dt: number
  spans: Span[]
  events: SimEvent[]
  status: 'finished' | 'cutoff' | 'invalid' | 'empty'
  /** child-friendly explanation of how the run ended */
  reason: string
  warnings: string[]
  /** assumptions the simulator had to make (always shown) */
  assumptions: string[]
  /** true when the distances are exact for the ideal geometry (no slip, calibrated wheels) */
  exact: boolean
  goal: { met: boolean; text: string } | null
  movementPorts: { left: string; right: string }
}

type Cmd = { kind: 'target'; target: number; max: number; accel: number } | { kind: 'run'; vel: number; accel: number; until: number | null }

interface Motor {
  port: string
  angle: number
  speed: number
  cmd: Cmd | null
  token: number
  stall: number
}

interface Obj {
  id: string
  def: ObjectDef
  x: number
  y: number
  rot: number
  r: number
  w: number
  l: number
  vx: number
  vy: number
  z: number
  carriedBy: string | null
  lx: number
  ly: number
  lrot: number
  surface: ColorName | undefined
  grabSize: number
}

interface Thread {
  stackId: string
  gen: Generator<void, void, void>
  done: boolean
  active: string | null
  killed: boolean
}

const MAX_OPS_PER_TICK = 5000
const STALL_SECONDS = 0.25
const BALL_DECEL = 250 // mm/s², estimated rolling resistance

class Simulator {
  readonly o: SimOptions
  readonly robot: RobotConfig
  readonly atts: AttachmentInstance[]
  readonly scene: Scene
  readonly circ: number

  t = 0
  pose: Pose
  motors = new Map<string, Motor>()
  joints: Record<string, number> = {}
  jointBase: Record<string, number> = {}
  objects: Obj[] = []
  statics: Shape[] = []
  vars: Record<string, number> = {}
  varsDirty = false
  objsDirty = true
  path = 0
  wheelL = 0
  wheelR = 0
  blocked = false
  light: string | null = null
  yawZero = 0
  timerZero = 0

  pair: { left: string; right: string }
  moveSpeedPct = 50
  motorSpeedPct: Record<string, number> = {}
  motorRotationMm: number
  rotationSetByProgram = false

  threads: Thread[] = []
  halt = false
  cutoffReason: string | null = null
  ops = 0

  frames: Frame[] = []
  spans: Span[] = []
  events: SimEvent[] = []
  warnings = new Set<string>()
  assumptions: string[] = []
  private lastObjs: ObjState[] = []
  private lastVars: Record<string, number> = {}

  constructor(
    readonly program: Program,
    setup: SimSetup,
  ) {
    this.o = { ...DEFAULT_OPTIONS, ...setup.options }
    this.robot = setup.robot
    this.atts = setup.attachments
    this.scene = setup.scene
    this.circ = wheelCircumferenceMm(this.robot)
    this.pose = { x: setup.scene.start.x, y: setup.scene.start.y, h: setup.scene.start.headingDeg * DEG }
    this.pair = { left: this.robot.drive.left.port, right: this.robot.drive.right.port }
    this.motorRotationMm = this.o.calibration === 'ideal' ? this.circ : this.robot.spikeDefaultMotorRotationMm

    for (const a of this.atts) {
      const def = ATTACHMENTS[a.kind]
      if (def.joint) {
        this.joints[a.uid] = def.joint.restDeg
        this.jointBase[a.uid] = def.joint.restDeg
      }
    }
    for (const so of setup.scene.objects) {
      const def = OBJECT_DEFS[so.type]
      if (!def) continue
      const s = objectSize(so)
      this.objects.push({
        id: so.id,
        def,
        x: so.x,
        y: so.y,
        rot: so.rot * DEG,
        r: s.r,
        w: s.w,
        l: s.l,
        vx: 0,
        vy: 0,
        z: 0,
        carriedBy: null,
        lx: 0,
        ly: 0,
        lrot: 0,
        surface: so.surface ?? def.surface,
        grabSize: def.shape === 'circle' ? s.r * 2 : Math.min(s.w, s.l),
      })
    }
    for (const ob of this.objects) if (ob.def.solid && !ob.def.movable) this.statics.push(this.objShape(ob))
    if (setup.scene.mat === 'classroom') {
      const { x0, x1, y0, y1 } = matBounds()
      const t = 20
      this.statics.push(boxShape((x0 + x1) / 2, y0 - t / 2, x1 - x0 + 2 * t, t, 0))
      this.statics.push(boxShape((x0 + x1) / 2, y1 + t / 2, x1 - x0 + 2 * t, t, 0))
      this.statics.push(boxShape(x0 - t / 2, (y0 + y1) / 2, t, y1 - y0, 0))
      this.statics.push(boxShape(x1 + t / 2, (y0 + y1) / 2, t, y1 - y0, 0))
    }
  }

  // ---- bookkeeping ------------------------------------------------------------------------

  motor(port: string): Motor {
    let m = this.motors.get(port)
    if (!m) {
      m = { port, angle: 0, speed: 0, cmd: null, token: 0, stall: 0 }
      this.motors.set(port, m)
      const isDrive = port === this.robot.drive.left.port || port === this.robot.drive.right.port
      const hasTool = this.atts.some((a) => a.port === port && !ATTACHMENTS[a.kind].sensor)
      const isSensor = this.atts.some((a) => a.port === port && ATTACHMENTS[a.kind].sensor)
      if (isSensor) this.warn(`Port ${port} has a sensor on this robot, not a motor. Nothing will turn.`)
      else if (!isDrive && !hasTool) this.warn(`Nothing is connected to port ${port} on this robot, so that motor block has nothing to move.`)
    }
    return m
  }

  warn(text: string, blockId?: string): void {
    if (this.warnings.has(text)) return
    this.warnings.add(text)
    this.events.push({ t: this.t, frame: Math.max(0, this.frames.length - 1), level: 'warn', text, blockId })
  }

  info(text: string, blockId?: string): void {
    this.events.push({ t: this.t, frame: Math.max(0, this.frames.length - 1), level: 'info', text, blockId })
  }

  command(port: string, cmd: Cmd | null): number {
    const m = this.motor(port)
    m.cmd = cmd
    m.token += 1
    m.stall = 0
    if (!cmd) m.speed = 0
    return m.token
  }

  busy(port: string, token: number): boolean {
    const m = this.motor(port)
    return m.token === token && m.cmd !== null
  }

  maxSpeed(): number {
    return this.robot.motorMaxDegPerSec
  }

  // ---- shapes -----------------------------------------------------------------------------

  objShape(ob: Obj): Shape {
    return ob.def.shape === 'circle' ? circleShape(ob.x, ob.y, ob.r) : boxShape(ob.x, ob.y, ob.w, ob.l, ob.rot)
  }

  robotShapes(p: Pose): Shape[] {
    const c = this.robot.chassis
    const half = Math.max(c.widthMm, this.robot.trackWidthMm + this.robot.wheelWidthMm) / 2
    const shapes: Shape[] = [rectShape(p, -half, half, -c.rearMm, c.frontMm)]
    for (const a of this.atts) {
      if (ATTACHMENTS[a.kind].group !== 'tool' && a.kind !== 'force_sensor') continue
      const j = this.joints[a.uid] ?? 0
      if (isRaised(a, j)) continue
      for (const r of toolRects(this.robot, a, j)) shapes.push(rectShape(p, r.x0, r.x1, r.y0, r.y1))
    }
    return shapes
  }

  // ---- sensors ----------------------------------------------------------------------------

  findSensor(type: 'color' | 'distance' | 'force', port: string | null | undefined): AttachmentInstance | null {
    const list = this.atts.filter((a) => ATTACHMENTS[a.kind].sensor === type)
    const hit = port ? list.find((a) => a.port === port) : list[0]
    if (!hit) {
      const name = type === 'color' ? 'colour' : type
      this.warn(port ? `There is no ${name} sensor on port ${port} of this robot, so that check can never come true.` : `This robot has no ${name} sensor.`)
    }
    return hit ?? null
  }

  readColor(a: AttachmentInstance): ColorName {
    const mount = a.slot === 1 && this.robot.mounts.colorSensor2 ? this.robot.mounts.colorSensor2 : this.robot.mounts.colorSensor
    const pt = toWorld(this.pose, mount.x, mount.y)
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const ob = this.objects[i]
      if (ob.def.solid || !ob.surface) continue
      if (pointInShape(pt, this.objShape(ob))) return ob.surface
    }
    return this.scene.floor
  }

  readDistanceMm(): number {
    const o = toWorld(this.pose, 0, this.robot.mounts.frontMm)
    const d = { x: Math.sin(this.pose.h), y: Math.cos(this.pose.h) }
    let best = 2000
    for (const ob of this.objects) {
      if (!ob.def.solid || ob.carriedBy) continue
      const hit = raycast(o, d, this.objShape(ob))
      if (hit !== null && hit < best) best = hit
    }
    if (this.scene.mat === 'classroom') {
      for (let i = this.statics.length - 4; i < this.statics.length; i++) {
        const hit = raycast(o, d, this.statics[i])
        if (hit !== null && hit < best) best = hit
      }
    }
    return best
  }

  readForce(): boolean {
    const front = this.robot.mounts.frontMm + ATTACHMENTS.force_sensor.lengthMm + 3
    const c = toWorld(this.pose, 0, front)
    const probe = circleShape(c.x, c.y, 4)
    for (const ob of this.objects) if (ob.def.solid && !ob.carriedBy && overlaps(probe, this.objShape(ob))) return true
    if (this.scene.mat === 'classroom') for (let i = this.statics.length - 4; i < this.statics.length; i++) if (overlaps(probe, this.statics[i])) return true
    return false
  }

  yaw(): number {
    return wrapDeg180((this.pose.h - this.yawZero) / DEG)
  }

  evalExpr(e: Expr | null | undefined): number {
    if (e === null || e === undefined) return 0
    if (typeof e === 'number') return e
    switch (e.type) {
      case 'var':
        return this.vars[e.name] ?? 0
      case 'sensor':
        switch (e.sensor) {
          case 'distance': {
            const s = this.findSensor('distance', e.port)
            return s ? this.readDistanceMm() / MM_PER_CM : 200
          }
          case 'reflection': {
            const s = this.findSensor('color', e.port)
            return s ? COLOR_REFLECTION[this.readColor(s)] : 0
          }
          case 'yaw':
            return this.yaw()
          case 'timer':
            return this.t - this.timerZero
          case 'motor_position':
            return e.port ? (((this.motor(e.port).angle % 360) + 360) % 360) : 0
          case 'motor_speed':
            return e.port ? (this.motor(e.port).speed / this.maxSpeed()) * 100 : 0
        }
        return 0
      case 'op': {
        const a = this.evalExpr(e.a)
        const b = this.evalExpr(e.b)
        if (e.op === '+') return a + b
        if (e.op === '-') return a - b
        if (e.op === '*') return a * b
        return b === 0 ? 0 : a / b
      }
    }
  }

  num(b: Block, name: string): number {
    const v = b.params[name]
    if (typeof v === 'number') return v
    if (v && typeof v === 'object') return this.evalExpr(v as Expr)
    return 0
  }

  evalCond(c: Condition | undefined): boolean {
    if (!c) return false
    switch (c.type) {
      case 'color': {
        const s = this.findSensor('color', c.port)
        return s ? this.readColor(s) === c.color : false
      }
      case 'distance': {
        const s = this.findSensor('distance', c.port)
        if (!s) return false
        const d = this.readDistanceMm()
        const v = this.evalExpr(c.value) * (c.unit === 'cm' ? MM_PER_CM : c.unit === 'in' ? MM_PER_INCH : 20)
        if (c.comparator === 'closer_than') return d < v
        if (c.comparator === 'farther_than') return d > v
        return Math.abs(d - v) <= 5
      }
      case 'force': {
        const s = this.findSensor('force', c.port)
        if (!s) return false
        const pressed = this.readForce()
        return c.state === 'released' ? !pressed : pressed
      }
      case 'reflection': {
        const s = this.findSensor('color', c.port)
        if (!s) return false
        return compare(COLOR_REFLECTION[this.readColor(s)], c.comparator, this.evalExpr(c.value))
      }
      case 'compare':
        return compare(this.evalExpr(c.left), c.comparator, this.evalExpr(c.right))
      case 'and':
        return this.evalCond(c.a) && this.evalCond(c.b)
      case 'or':
        return this.evalCond(c.a) || this.evalCond(c.b)
      case 'not':
        return !this.evalCond(c.a)
      case 'unknown':
        return false
    }
  }

  // ---- program execution (one generator per stack) ----------------------------------------

  /** Motor degrees the outer wheel must turn for a movement amount. null = timed (seconds). */
  amountToDeg(amount: number, unit: string): number | null {
    switch (unit) {
      case 'cm':
        return ((amount * MM_PER_CM) / this.motorRotationMm) * 360
      case 'in':
        return ((amount * MM_PER_INCH) / this.motorRotationMm) * 360
      case 'rotations':
        return amount * 360
      case 'degrees':
        return amount
      default:
        return null
    }
  }

  /**
   * Drive the movement pair. lf/rf are wheel factors (-1..1, forward positive); the larger one
   * travels `deg` motor degrees. Both wheels use proportional speed and ramp, so the path is an
   * exact arc and both finish in the same step.
   */
  *drive(lf: number, rf: number, deg: number | null, seconds: number | null, speedPct: number, wait: boolean): Generator<void, void, void> {
    if (speedPct < 0) {
      lf = -lf
      rf = -rf
      speedPct = -speedPct
    }
    const speed = (Math.min(100, speedPct) / 100) * this.maxSpeed()
    const accel = this.robot.accelDegPerSec2
    const big = Math.max(Math.abs(lf), Math.abs(rf))
    const { left, right } = this.pair
    if (big === 0 || speed === 0) {
      this.command(left, null)
      this.command(right, null)
      return
    }
    // SPIKE convention for a movement pair: the left motor turns counter-clockwise to go forward.
    const ls = -lf
    const rs = rf
    let tl: number
    let tr: number
    if (deg !== null) {
      const mk = (port: string, f: number): number => {
        const share = Math.abs(f) / big
        if (share === 0) return this.command(port, null)
        return this.command(port, { kind: 'target', target: this.motor(port).angle + Math.sign(f) * deg * share, max: speed * share, accel: accel * share })
      }
      tl = mk(left, ls)
      tr = mk(right, rs)
    } else {
      const until = seconds === null ? null : this.t + seconds
      tl = this.command(left, { kind: 'run', vel: speed * ls, accel: (accel * Math.abs(ls)) / big || accel, until })
      tr = this.command(right, { kind: 'run', vel: speed * rs, accel: (accel * Math.abs(rs)) / big || accel, until })
    }
    if (!wait) return
    while (this.busy(left, tl) || this.busy(right, tr)) yield
  }

  *runBlocks(blocks: Block[], th: Thread): Generator<void, void, void> {
    for (const b of blocks) {
      if (th.killed || this.halt) return
      yield* this.runBlock(b, th)
    }
  }

  *guard(): Generator<void, void, void> {
    this.ops += 1
    if (this.ops > MAX_OPS_PER_TICK) yield
  }

  *runBlock(b: Block, th: Thread): Generator<void, void, void> {
    const def = BLOCK_BY_OP[b.op]
    if (!def) return
    th.active = b.id
    yield* this.guard()

    // containers ---------------------------------------------------------------------------
    if (b.op === 'repeat') {
      const n = Math.max(0, Math.floor(this.num(b, 'times')))
      for (let i = 0; i < n; i++) {
        yield* this.runBlocks(b.children ?? [], th)
        if (th.killed || this.halt) return
        yield* this.guard()
      }
      return
    }
    if (b.op === 'forever' || b.op === 'repeat_until') {
      for (;;) {
        th.active = b.id
        if (b.op === 'repeat_until' && this.evalCond(b.condition)) return
        const before = this.frames.length
        yield* this.runBlocks(b.children ?? [], th)
        if (th.killed || this.halt) return
        if (this.frames.length === before) yield // a loop that takes no time still lets time pass
      }
    }
    if (b.op === 'if' || b.op === 'if_else') {
      if (this.evalCond(b.condition)) yield* this.runBlocks(b.children ?? [], th)
      else if (b.op === 'if_else') yield* this.runBlocks(b.elseChildren ?? [], th)
      return
    }

    // leaves -------------------------------------------------------------------------------
    const span: Span = { blockId: b.id, stackId: th.stackId, start: this.frames.length - 1, end: this.frames.length - 1, kind: 'other', text: blockText(b) }
    this.spans.push(span)
    const p = b.params
    const pct = this.moveSpeedPct

    switch (b.op) {
      case 'set_movement_motors': {
        const [l, r] = String(p.ports).split('+')
        this.pair = { left: l, right: r }
        const d = this.robot.drive
        if (l === d.right.port && r === d.left.port) this.warn(`The program sets the movement motors to ${l}+${r}, but on this robot the LEFT wheel is ${d.left.port} and the RIGHT wheel is ${d.right.port}. The robot will drive the wrong way round.`, b.id)
        else if (l !== d.left.port || r !== d.right.port) this.warn(`The program drives motors ${l}+${r}, but this robot's wheels are on ${d.left.port}+${d.right.port}. The wheels will not turn as you expect.`, b.id)
        break
      }
      case 'set_movement_speed':
        this.moveSpeedPct = this.num(b, 'speed')
        break
      case 'set_motor_rotation':
        this.motorRotationMm = this.num(b, 'amount') * (p.unit === 'in' ? MM_PER_INCH : MM_PER_CM)
        this.rotationSetByProgram = true
        break
      case 'move_for':
      case 'move_steering_for':
      case 'move_tank_for':
      case 'start_moving':
      case 'start_steering':
      case 'start_tank': {
        let lf = 1
        let rf = 1
        let speedPct = pct
        if (b.op === 'move_for' || b.op === 'start_moving') {
          const dir = p.direction
          if (dir === 'backward') [lf, rf] = [-1, -1]
          else if (dir === 'left') [lf, rf] = [-1, 1]
          else if (dir === 'right') [lf, rf] = [1, -1]
        } else if (b.op === 'move_steering_for' || b.op === 'start_steering') {
          const s = Math.max(-100, Math.min(100, this.num(b, 'steering')))
          if (s >= 0) rf = 1 - s / 50
          else lf = 1 + s / 50
        } else {
          lf = Math.max(-100, Math.min(100, this.num(b, 'left'))) / 100
          rf = Math.max(-100, Math.min(100, this.num(b, 'right'))) / 100
          speedPct = 100
        }
        const starts = b.op.startsWith('start_')
        span.kind = lf === rf ? 'move' : lf === -rf ? 'turn' : 'move'
        if (starts) {
          yield* this.drive(lf, rf, null, null, speedPct, false)
          break
        }
        const amount = Math.abs(this.num(b, 'amount'))
        const unit = String(p.unit)
        const deg = this.amountToDeg(amount, unit)
        if (deg !== null && lf === rf) {
          span.commandedMm = unit === 'cm' ? amount * MM_PER_CM : unit === 'in' ? amount * MM_PER_INCH : (deg / 360) * this.motorRotationMm
        }
        if (b.op === 'move_tank_for' && deg !== null) {
          // tank speeds are absolute wheel speeds; keep their ratio and let the faster wheel cover the amount
          const top = Math.max(Math.abs(lf), Math.abs(rf))
          yield* this.drive(lf, rf, deg, null, top * 100, true)
        } else if (b.op === 'move_tank_for') {
          yield* this.drive(lf, rf, null, amount, 100, true)
        } else {
          yield* this.drive(lf, rf, deg, deg === null ? amount : null, speedPct, true)
        }
        break
      }
      case 'turn_for': {
        span.kind = 'turn'
        const degrees = Math.abs(this.num(b, 'degrees'))
        span.commandedDeg = p.direction === 'left' ? -degrees : degrees
        // wheel travel for a spin on the spot = angle × half the track width
        const wheelMm = degrees * DEG * (this.robot.trackWidthMm / 2)
        const motorDeg = (wheelMm / this.circ) * 360
        const s = p.direction === 'left' ? -1 : 1
        yield* this.drive(s, -s, motorDeg, null, pct, true)
        break
      }
      case 'stop_moving':
        this.command(this.pair.left, null)
        this.command(this.pair.right, null)
        break
      case 'motor_run_for':
      case 'motor_go_to_position':
      case 'motor_start': {
        span.kind = 'motor'
        const ports = String(p.ports).split('+')
        const sign = p.direction === 'counterclockwise' ? -1 : 1
        const waits: Array<[string, number]> = []
        for (const port of ports) {
          const m = this.motor(port)
          let sp = this.motorSpeedPct[port] ?? 75
          let dir = sign
          if (sp < 0) {
            sp = -sp
            dir = -dir
          }
          const speed = (Math.min(100, sp) / 100) * this.maxSpeed()
          const accel = this.robot.accelDegPerSec2
          if (speed === 0) continue
          if (b.op === 'motor_start') {
            this.command(port, { kind: 'run', vel: dir * speed, accel, until: null })
          } else if (b.op === 'motor_go_to_position') {
            const cur = ((m.angle % 360) + 360) % 360
            const goal = ((this.num(b, 'position') % 360) + 360) % 360
            let delta = goal - cur
            if (p.direction === 'clockwise') delta = (delta + 360) % 360
            else if (p.direction === 'counterclockwise') delta = -((360 - delta) % 360)
            else delta = wrapDeg180(delta)
            if (delta !== 0) waits.push([port, this.command(port, { kind: 'target', target: m.angle + delta, max: speed, accel })])
          } else if (p.unit === 'seconds') {
            waits.push([port, this.command(port, { kind: 'run', vel: dir * speed, accel, until: this.t + Math.abs(this.num(b, 'amount')) })])
          } else {
            const deg = Math.abs(this.num(b, 'amount')) * (p.unit === 'rotations' ? 360 : 1)
            if (deg > 0) waits.push([port, this.command(port, { kind: 'target', target: m.angle + dir * deg, max: speed, accel })])
          }
        }
        while (waits.some(([port, tok]) => this.busy(port, tok))) yield
        break
      }
      case 'motor_stop':
        for (const port of String(p.ports).split('+')) this.command(port, null)
        break
      case 'motor_set_speed':
        for (const port of String(p.ports).split('+')) this.motorSpeedPct[port] = this.num(b, 'speed')
        break
      case 'wait_seconds': {
        span.kind = 'wait'
        const until = this.t + Math.max(0, this.num(b, 'seconds'))
        while (this.t < until - 1e-9) yield
        break
      }
      case 'wait_until': {
        span.kind = 'wait'
        const start = this.t
        while (!this.evalCond(b.condition)) {
          if (this.t - start >= this.o.waitTimeoutSeconds) {
            this.cutoffReason = `The program waited ${this.o.waitTimeoutSeconds} seconds at "${blockText(b)}" and it never came true, so SPIKE Lab stopped it.`
            this.halt = true
            break
          }
          yield
        }
        break
      }
      case 'stop':
        if (p.what === 'all') this.halt = true
        else if (p.what === 'this_stack') th.killed = true
        else for (const other of this.threads) if (other !== th) other.killed = true
        break
      case 'set_variable':
        this.vars = { ...this.vars, [String(p.name)]: this.num(b, 'value') }
        break
      case 'change_variable':
        this.vars = { ...this.vars, [String(p.name)]: (this.vars[String(p.name)] ?? 0) + this.num(b, 'by') }
        break
      case 'reset_yaw':
        this.yawZero = this.pose.h
        break
      case 'reset_timer':
        this.timerZero = this.t
        break
      case 'light_display':
        this.light = String(p.what)
        this.info(`Light matrix shows "${p.what}"`, b.id)
        break
      case 'light_off':
        this.light = null
        break
      case 'sound_play': {
        this.info(`Plays sound "${p.name}" (sounds are not simulated)`, b.id)
        if (p.wait === true) {
          span.kind = 'wait'
          const until = this.t + 1
          while (this.t < until - 1e-9) yield
        }
        break
      }
      case 'sound_beep': {
        span.kind = 'wait'
        this.info(`Beep (note ${this.num(b, 'note')})`, b.id)
        const until = this.t + Math.max(0, this.num(b, 'seconds'))
        while (this.t < until - 1e-9) yield
        break
      }
      case 'unsupported':
        this.warn(`Skipped a block SPIKE Lab cannot run yet: "${b.text ?? 'unknown block'}"`, b.id)
        break
    }
    span.end = this.frames.length - 1
  }

  // ---- physics ----------------------------------------------------------------------------

  stepMotor(m: Motor): void {
    const dt = this.o.dt
    const c = m.cmd
    if (!c) {
      m.speed = 0
      return
    }
    if (c.kind === 'target') {
      const rem = c.target - m.angle
      const dir = rem >= 0 ? 1 : -1
      const dist = Math.abs(rem)
      const floor = c.max * 0.08
      const desired = Math.min(c.max, Math.max(Math.sqrt(2 * c.accel * dist), floor))
      const current = Math.max(0, m.speed * dir)
      const sp = Math.min(current + c.accel * dt, desired)
      const step = sp * dt
      if (step >= dist - 1e-9) {
        m.angle = c.target // land exactly on the target: no accumulated error
        m.speed = 0
        m.cmd = null
      } else {
        m.angle += dir * step
        m.speed = dir * sp
      }
      return
    }
    const dv = c.vel - m.speed
    const maxDv = c.accel * dt
    m.speed += Math.abs(dv) <= maxDv ? dv : Math.sign(dv) * maxDv
    m.angle += m.speed * dt
    if (c.until !== null && this.t + dt >= c.until - 1e-9) {
      m.cmd = null
      m.speed = 0
    }
  }

  /** Move joints from their motors; clamp at the mechanical limits (the motor stalls). */
  stepTools(prevAngles: Map<string, number>): void {
    for (const a of this.atts) {
      const joint = ATTACHMENTS[a.kind].joint
      if (!joint || !a.port) continue
      const m = this.motors.get(a.port)
      if (!m) continue
      const prev = prevAngles.get(a.port) ?? m.angle
      const before = this.joints[a.uid]
      let next = before + (m.angle - prev) * joint.gearRatio
      let max = joint.maxDeg
      let zoneObj: Obj | null = null

      if (joint.type === 'claw') {
        const held = this.objects.find((ob) => ob.carriedBy === a.uid)
        if (held) max = Math.min(max, clawAngleForGap(held.grabSize))
        else if (next > before) {
          // closing: is something between the jaws?
          const z = captureZone(this.robot, a, before)!
          const zone = rectShape(this.pose, z.x0, z.x1, z.y0, z.y1)
          zoneObj = this.objects.find((ob) => ob.def.movable && ob.def.liftable && !ob.carriedBy && overlaps(zone, this.objShape(ob))) ?? null
          if (zoneObj) max = Math.min(max, clawAngleForGap(zoneObj.grabSize))
        }
      }

      let stalled = false
      if (next > max) {
        next = max
        stalled = true
      } else if (next < joint.minDeg) {
        next = joint.minDeg
        stalled = true
      }
      if (stalled) {
        // the motor cannot turn further: put it back where the mechanism stopped
        m.angle = prev + (next - before) / joint.gearRatio
        m.speed = 0
        m.stall += this.o.dt
        if (m.cmd && m.stall >= STALL_SECONDS) {
          m.cmd = null
          this.info(`Motor ${a.port} stopped: the ${ATTACHMENTS[a.kind].name.toLowerCase()} reached its limit.`)
        }
      } else m.stall = 0
      this.joints = { ...this.joints, [a.uid]: next }

      if (joint.type === 'claw') {
        if (zoneObj && clawGap(next) <= zoneObj.grabSize + 0.5) this.pickUp(zoneObj, a)
        for (const ob of this.objects) if (ob.carriedBy === a.uid && clawGap(next) > ob.grabSize + 6) this.release(ob)
      } else if (joint.type === 'lift' && a.kind === 'lift_arm') {
        const wasUp = isRaised(a, before)
        const isUp = isRaised(a, next)
        if (!wasUp && isUp) {
          const z = captureZone(this.robot, a, next)!
          const zone = rectShape(this.pose, z.x0, z.x1, z.y0, z.y1)
          for (const ob of this.objects) if (ob.def.movable && ob.def.liftable && !ob.carriedBy && overlaps(zone, this.objShape(ob))) this.pickUp(ob, a)
        } else if (wasUp && !isUp) {
          for (const ob of this.objects) if (ob.carriedBy === a.uid) this.release(ob)
        }
      }
    }
  }

  pickUp(ob: Obj, a: AttachmentInstance): void {
    const l = toLocal(this.pose, ob.x, ob.y)
    ob.carriedBy = a.uid
    ob.lx = l.x
    ob.ly = l.y
    ob.lrot = ob.rot - this.pose.h
    ob.vx = 0
    ob.vy = 0
    this.objsDirty = true
    this.info(`${ATTACHMENTS[a.kind].name} picked up the ${ob.def.label.toLowerCase()} (simplified).`)
  }

  release(ob: Obj): void {
    ob.carriedBy = null
    ob.z = 0
    this.objsDirty = true
    this.info(`The ${ob.def.label.toLowerCase()} was put down.`)
  }

  staticDepth(shapes: Shape[]): number {
    let depth = 0
    for (const rs of shapes) {
      for (const st of this.statics) {
        const m = mtv(st, rs)
        if (m) depth = Math.max(depth, Math.hypot(m.x, m.y))
      }
    }
    return depth
  }

  stepWorld(): void {
    const dt = this.o.dt
    const prevAngles = new Map<string, number>()
    for (const m of this.motors.values()) prevAngles.set(m.port, m.angle)
    for (const m of this.motors.values()) this.stepMotor(m)
    this.stepTools(prevAngles)

    // differential drive from the real wheel motors (whatever the program thinks the pair is)
    const d = this.robot.drive
    const lm = this.motors.get(d.left.port)
    const rm = this.motors.get(d.right.port)
    const grip = 1 - Math.min(0.9, Math.max(0, this.o.slip))
    const dL = lm ? (((lm.angle - (prevAngles.get(lm.port) ?? lm.angle)) * d.left.polarity) / 360) * this.circ * grip : 0
    const dR = rm ? (((rm.angle - (prevAngles.get(rm.port) ?? rm.angle)) * d.right.polarity) / 360) * this.circ * grip : 0

    const prev = this.pose
    let next = prev
    if (dL !== 0 || dR !== 0) {
      const dist = (dL + dR) / 2
      const dh = (dL - dR) / this.robot.trackWidthMm // clockwise positive
      if (Math.abs(dh) < 1e-12) {
        next = { x: prev.x + dist * Math.sin(prev.h), y: prev.y + dist * Math.cos(prev.h), h: prev.h }
      } else {
        // exact arc integration
        const R = dist / dh
        next = {
          x: prev.x + R * (Math.cos(prev.h) - Math.cos(prev.h + dh)),
          y: prev.y + R * (Math.sin(prev.h + dh) - Math.sin(prev.h)),
          h: prev.h + dh,
        }
      }
    }

    const moving = this.objects.some((ob) => ob.vx !== 0 || ob.vy !== 0)
    this.blocked = false
    if (next !== prev || moving) {
      const saved = this.objects.map((ob) => [ob.x, ob.y] as const)
      // rolling objects
      for (const ob of this.objects) {
        if (ob.carriedBy || (ob.vx === 0 && ob.vy === 0)) continue
        const v = Math.hypot(ob.vx, ob.vy)
        const nv = Math.max(0, v - BALL_DECEL * dt)
        ob.x += ob.vx * dt
        ob.y += ob.vy * dt
        ob.vx = nv === 0 ? 0 : (ob.vx / v) * nv
        ob.vy = nv === 0 ? 0 : (ob.vy / v) * nv
        this.objsDirty = true
      }
      const shapes = this.robotShapes(next)
      const movables = this.objects.filter((ob) => ob.def.solid && ob.def.movable && !ob.carriedBy)
      for (let iter = 0; iter < 4; iter++) {
        let any = false
        for (const ob of movables) {
          for (const rs of shapes) {
            const m = mtv(rs, this.objShape(ob))
            if (!m) continue
            ob.x += m.x
            ob.y += m.y
            if (ob.def.rolls) {
              ob.vx = Math.max(-600, Math.min(600, m.x / dt))
              ob.vy = Math.max(-600, Math.min(600, m.y / dt))
            }
            any = true
          }
        }
        for (let i = 0; i < movables.length; i++) {
          for (let j = i + 1; j < movables.length; j++) {
            const m = mtv(this.objShape(movables[i]), this.objShape(movables[j]))
            if (!m) continue
            movables[i].x -= m.x / 2
            movables[i].y -= m.y / 2
            movables[j].x += m.x / 2
            movables[j].y += m.y / 2
            any = true
          }
        }
        for (const ob of movables) {
          for (const st of this.statics) {
            const m = mtv(st, this.objShape(ob))
            if (!m) continue
            ob.x += m.x
            ob.y += m.y
            ob.vx = 0
            ob.vy = 0
            any = true
          }
        }
        if (!any) break
        this.objsDirty = true
      }
      // is the robot jammed? (against a wall, or against an object that is itself against a wall)
      let jam = this.staticDepth(shapes) > Math.max(0.5, this.staticDepth(this.robotShapes(prev)))
      if (!jam) {
        outer: for (const ob of movables) {
          for (const rs of shapes) {
            const m = mtv(rs, this.objShape(ob))
            if (m && Math.hypot(m.x, m.y) > 0.5) {
              jam = true
              break outer
            }
          }
        }
      }
      if (jam && next !== prev) {
        // the wheels keep turning (slipping) but the robot and everything it pushed stay put
        this.objects.forEach((ob, i) => {
          ob.x = saved[i][0]
          ob.y = saved[i][1]
          ob.vx = 0
          ob.vy = 0
        })
        next = prev
        this.blocked = true
        this.warn('The robot got stuck against something it cannot push. The wheels spin but it does not move.')
      }
    }

    if (next !== prev) {
      this.path += Math.hypot(next.x - prev.x, next.y - prev.y)
      this.pose = next
    }
    this.wheelL += dL
    this.wheelR += dR

    // carried objects follow their tool
    for (const ob of this.objects) {
      if (!ob.carriedBy) continue
      const a = this.atts.find((x) => x.uid === ob.carriedBy)!
      const w = toWorld(this.pose, ob.lx, ob.ly)
      ob.x = w.x
      ob.y = w.y
      ob.rot = this.pose.h + ob.lrot
      ob.z = a.kind === 'lift_arm' ? liftHeight(a, this.joints[a.uid]) : 0
      this.objsDirty = true
    }
    this.t += dt
  }

  record(): void {
    if (this.objsDirty) {
      this.lastObjs = this.objects.map((ob) => ({ id: ob.id, x: ob.x, y: ob.y, rot: ob.rot, z: ob.z, carried: ob.carriedBy !== null }))
      this.objsDirty = false
    }
    const motors: Record<string, number> = {}
    for (const m of this.motors.values()) motors[m.port] = m.angle
    const sensors: Record<string, string | number | boolean> = {}
    for (const a of this.atts) {
      const s = ATTACHMENTS[a.kind].sensor
      if (s === 'color') sensors[a.uid] = this.readColor(a)
      else if (s === 'distance') sensors[a.uid] = Math.round(this.readDistanceMm())
      else if (s === 'force') sensors[a.uid] = this.readForce()
    }
    this.frames.push({
      t: this.t,
      x: this.pose.x,
      y: this.pose.y,
      h: this.pose.h,
      motors,
      joints: this.joints,
      objects: this.lastObjs,
      vars: this.vars,
      active: this.threads.filter((th) => !th.done && th.active).map((th) => th.active!) ,
      path: this.path,
      wheelL: this.wheelL,
      wheelR: this.wheelR,
      blocked: this.blocked,
      light: this.light,
      sensors,
      yaw: this.yaw(),
    })
  }

  run(): SimResult {
    const stacks = this.program.stacks.filter((s) => s.hat?.op === 'when_program_starts')
    const hasMovementBlock = stacks.some((s) => JSON.stringify(s.blocks).includes('"set_movement_motors"'))
    if (!hasMovementBlock) {
      this.assumptions.push(
        `Your program does not set the movement motors. SPIKE Lab assumed the wheels of this robot (${this.pair.left}+${this.pair.right}). A real hub uses A+B unless you tell it.`,
      )
    }
    this.record()
    if (stacks.length === 0 || stacks.every((s) => s.blocks.length === 0)) {
      return this.result('empty', 'There are no connected blocks to run yet. Add a block under "when program starts".')
    }
    this.threads = stacks.map((s) => {
      const th: Thread = { stackId: s.id, gen: null as unknown as Generator<void, void, void>, done: false, active: null, killed: false }
      th.gen = this.runBlocks(s.blocks, th)
      return th
    })
    const maxSteps = Math.round(this.o.maxSeconds / this.o.dt)
    let status: SimResult['status'] = 'finished'
    let reason = 'The program finished.'
    for (let step = 0; ; step++) {
      for (const th of this.threads) {
        if (th.done) continue
        if (th.killed) {
          th.done = true
          continue
        }
        this.ops = 0
        if (th.gen.next().done) th.done = true
        if (this.halt) break
      }
      if (this.halt) {
        if (this.cutoffReason) {
          status = 'cutoff'
          reason = this.cutoffReason
        } else reason = 'The program stopped at a "stop all" block.'
        break
      }
      if (this.threads.every((th) => th.done)) break
      if (step >= maxSteps) {
        status = 'cutoff'
        reason = `SPIKE Lab stopped the program after ${this.o.maxSeconds} seconds (safety limit). A "forever" loop or a long wait keeps a real robot going until you press stop.`
        break
      }
      this.stepWorld()
      this.record()
    }
    for (const sp of this.spans) if (sp.end < sp.start) sp.end = this.frames.length - 1
    // spans that were still running when the program was cut off
    for (const th of this.threads) {
      if (!th.done) {
        const last = [...this.spans].reverse().find((s) => s.stackId === th.stackId)
        if (last) last.end = this.frames.length - 1
      }
    }
    // the final snapshot shows nothing running
    this.frames[this.frames.length - 1].active = []
    return this.result(status, reason)
  }

  result(status: SimResult['status'], reason: string): SimResult {
    const notes = [...this.assumptions]
    const calibrated = Math.abs(this.motorRotationMm - this.circ) / this.circ < 0.0005
    if (!calibrated) {
      notes.push(
        `The hub thinks one wheel turn moves ${(this.motorRotationMm / 10).toFixed(2)} cm${this.rotationSetByProgram ? ' (set in your program)' : ' (SPIKE default)'}, but this robot's wheels roll ${(this.circ / 10).toFixed(2)} cm per turn. Distances in cm will be a little off, just like on the real robot.`,
      )
    }
    if (this.o.slip > 0) notes.push(`Wheel slip is set to ${Math.round(this.o.slip * 100)} %, so distances are estimates.`)
    return {
      frames: this.frames,
      dt: this.o.dt,
      spans: this.spans,
      events: this.events,
      status,
      reason,
      warnings: [...this.warnings],
      assumptions: notes,
      exact: calibrated && this.o.slip === 0,
      goal: this.checkGoal(),
      movementPorts: { ...this.pair },
    }
  }

  checkGoal(): SimResult['goal'] {
    const g = this.scene.goal
    if (!g) return null
    const zone = this.objects.find((ob) => ob.id === g.zoneId)
    if (!zone) return null
    const zoneShape = this.objShape(zone)
    if (g.type === 'robot_in_zone') {
      const met = pointInShape({ x: this.pose.x, y: this.pose.y }, zoneShape)
      return { met, text: met ? 'The robot is parked on the target!' : 'The robot did not end on the target yet.' }
    }
    const ob = this.objects.find((x) => x.id === g.objectId)
    if (!ob) return null
    const met = !ob.carriedBy && pointInShape({ x: ob.x, y: ob.y }, zoneShape)
    const name = ob.def.label.toLowerCase()
    return { met, text: met ? `The ${name} is on the target!` : `The ${name} is not on the target yet.` }
  }
}

function compare(a: number, op: '<' | '>' | '=', b: number): boolean {
  if (op === '<') return a < b
  if (op === '>') return a > b
  return Math.abs(a - b) < 1e-9
}

/** Bounds of the classroom mat preset; the default start position (0,0) sits near the bottom middle. */
export function matBounds(): { x0: number; x1: number; y0: number; y1: number } {
  return { x0: -CLASSROOM_MAT.widthMm / 2, x1: CLASSROOM_MAT.widthMm / 2, y0: -250, y1: CLASSROOM_MAT.lengthMm - 250 }
}

/** Run a program to completion (or to a safety cutoff) and return the full timeline. */
export function simulate(setup: SimSetup): SimResult {
  const sim = new Simulator(setup.program, setup)
  const errors = programProblems(setup.program).filter((p) => p.level === 'error')
  if (errors.length > 0) {
    sim.record()
    return sim.result('invalid', `${errors.length === 1 ? 'One block needs' : `${errors.length} blocks need`} your help before the robot can run. Look for the orange flags.`)
  }
  return sim.run()
}
