import { describe, expect, it } from 'vitest'
import { makeBlock, type Block, type Program } from './ir'
import { resolveRobot, type AttachmentInstance } from './robots'
import { emptyScene, makeObject, type Scene, type SceneObject } from './scene'
import { simulate, type SimResult, type SimSetup } from './simulate'

// A tick must be earned: these cover the ways the first version gave one away (or withheld one).

function blk(op: string, params: Record<string, unknown> = {}): Block {
  const b = makeBlock(op)
  Object.assign(b.params, params)
  return b
}
const prog = (...blocks: Block[]): Program => ({ irVersion: 1, notes: [], stacks: [{ id: 's0', hat: { op: 'when_program_starts' as const }, blocks }] })
const forward = (cm: number) => blk('move_for', { direction: 'forward', amount: cm, unit: 'cm' })
/** drive forward at a set speed until told to stop: unlike "move for", this hits things at full speed */
const ramInto = (speed: number) => [blk('set_movement_speed', { speed }), blk('start_moving', { direction: 'forward' }), blk('wait_seconds', { seconds: 2 }), blk('stop_moving')]

const hook: AttachmentInstance = { uid: 'tool', kind: 'hook', port: null }

function run(blocks: Block[], objects: SceneObject[], over: Omit<Partial<SimSetup>, 'scene'> & { scene?: Partial<Scene> } = {}): SimResult {
  const { scene, ...rest } = over
  return simulate({ program: prog(...blocks), robot: resolveRobot('db1'), attachments: [], ...rest, scene: { ...emptyScene(), objects, ...scene } })
}
const last = (r: SimResult) => r.frames[r.frames.length - 1]
const objAt = (r: SimResult, id: string) => last(r).objects.find((o) => o.id === id)!
const task = (r: SimResult, id: string) => r.tasks.find((t) => t.id === id)!
const stuck = (r: SimResult) => /stuck/.test(r.warnings.join(' '))
/** start positions a fraction of a millimetre apart, so every phase of the fixed step is covered */
const OFFSETS = Array.from({ length: 12 }, (_, i) => i * 0.47)

describe('a push bar cannot pass through things', () => {
  it('stops at the wall of the table', () => {
    // competition table: the wall's inner face is at y = 893. The bar's back is at y = 882: 11 mm of room.
    const bar = makeObject('push_bar', 0, 870)
    const r = run([forward(30)], [bar], { scene: { mat: 'competition', start: { x: 0, y: 600, headingDeg: 0 } } })
    expect(objAt(r, bar.id).y).toBeLessThanOrEqual(881.5)
    expect(objAt(r, bar.id).y).toBeGreaterThan(878)
    expect(task(r, bar.id).met).toBe(false)
    expect(stuck(r)).toBe(true)
  })

  it('stops at a fixed block behind it', () => {
    const bar = makeObject('push_bar', 0, 200) // its back is at y = 212
    const block = makeObject('obstacle', 0, 300) // its near face is at y = 252: 40 mm of room
    const r = run([forward(40)], [bar, block])
    expect(objAt(r, bar.id).y).toBeLessThanOrEqual(240.5)
    expect(objAt(r, bar.id).y).toBeGreaterThan(236)
    expect(task(r, bar.id).met).toBe(false)
    expect(stuck(r)).toBe(true)
  })

  it('does not pass through a loose thing that is pinned against a block', () => {
    const bar = makeObject('push_bar', 0, 200)
    const cube = makeObject('cube', 0, 240) // 48 mm cube right behind the bar
    const block = makeObject('obstacle', 0, 320) // near face at y = 272: the cube has 8 mm to move
    const r = run([forward(40)], [bar, cube, block])
    expect(objAt(r, cube.id).y).toBeLessThanOrEqual(248.5)
    expect(objAt(r, bar.id).y).toBeLessThanOrEqual(objAt(r, cube.id).y - 24 - 12 + 0.6) // the bar is still in front of the cube
    expect(task(r, bar.id).met).toBe(false)
  })
})

describe('pulling means pulling', () => {
  it('does not tick when the hook only pushes the ring forward', () => {
    const ring = makeObject('pull_ring', 0, 300)
    const r = run([forward(30)], [ring], { attachments: [hook] })
    expect(objAt(r, ring.id).carried).toBe(true)
    expect(objAt(r, ring.id).y).toBeGreaterThan(400)
    expect(task(r, ring.id).met).toBe(false)
  })

  it('does not tick when the robot spins on the spot with the ring', () => {
    const ring = makeObject('pull_ring', -15, 152) // already under the hook tip
    const r = run([blk('turn_for', { direction: 'right', degrees: 180 })], [ring], { attachments: [hook] })
    expect(objAt(r, ring.id).carried).toBe(true)
    expect(task(r, ring.id).met).toBe(false)
  })

  it('still ticks after driving in and reversing', () => {
    const ring = makeObject('pull_ring', 0, 300)
    const r = run([forward(12), blk('move_for', { direction: 'backward', amount: 12, unit: 'cm' })], [ring], { attachments: [hook] })
    expect(task(r, ring.id).met).toBe(true)
  })
})

describe('hitting something at full speed', () => {
  for (const speed of [50, 100]) {
    it(`loses "do not touch" every time the robot is stopped by the block (${speed}%)`, () => {
      for (const offset of OFFSETS) {
        const block = { ...makeObject('obstacle', 0, 400 + offset), task: true }
        const r = run(ramInto(speed), [block])
        expect(stuck(r), `offset ${offset}`).toBe(true)
        expect(task(r, block.id).met, `offset ${offset}`).toBe(false)
      }
    })

    it(`presses the plate every time the robot is stopped by its front (${speed}%)`, () => {
      for (const offset of OFFSETS) {
        const plate = makeObject('press_plate', 0, 400 + offset)
        const r = run(ramInto(speed), [plate])
        expect(stuck(r), `offset ${offset}`).toBe(true)
        expect(task(r, plate.id).met, `offset ${offset}`).toBe(true)
      }
    })

    it(`pushes a bar its full 8 cm (${speed}%)`, () => {
      for (const offset of OFFSETS) {
        const bar = { ...makeObject('push_bar', 0, 300 + offset), targetMm: 80 }
        const r = run(ramInto(speed), [bar])
        expect(objAt(r, bar.id).y, `offset ${offset}`).toBeCloseTo(380 + offset, 3)
        expect(task(r, bar.id).met, `offset ${offset}`).toBe(true)
      }
    })
  }
})
