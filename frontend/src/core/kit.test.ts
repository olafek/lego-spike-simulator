import { describe, expect, it } from 'vitest'
import { makeBlock, type Block, type Program } from './ir'
import { resolveRobot, type AttachmentInstance } from './robots'
import { emptyScene, makeObject, type Scene, type SceneObject } from './scene'
import { simulate, type SimResult, type SimSetup } from './simulate'
import { missionComplete, tasksAt } from './timeline'

// The practice kit: stand-ins that react to the robot, and the checklist of what a run achieved.
// The robot is Driving Base 1: its front is 64 mm ahead of the point between its wheels.

function blk(op: string, params: Record<string, unknown> = {}): Block {
  const b = makeBlock(op)
  Object.assign(b.params, params)
  return b
}
const prog = (...blocks: Block[]): Program => ({ irVersion: 1, notes: [], stacks: [{ id: 's0', hat: { op: 'when_program_starts' as const }, blocks }] })
const forward = (cm: number) => blk('move_for', { direction: 'forward', amount: cm, unit: 'cm' })
const backward = (cm: number) => blk('move_for', { direction: 'backward', amount: cm, unit: 'cm' })

const hook: AttachmentInstance = { uid: 'tool', kind: 'hook', port: null }
const ram: AttachmentInstance = { uid: 'tool', kind: 'custom', port: null, widthMm: 100, lengthMm: 60 }

function run(blocks: Block[], objects: SceneObject[], over: Omit<Partial<SimSetup>, 'scene'> & { scene?: Partial<Scene> } = {}): SimResult {
  const { scene, ...rest } = over
  return simulate({ program: prog(...blocks), robot: resolveRobot('db1'), attachments: [], ...rest, scene: { ...emptyScene(), objects, ...scene } })
}
const last = (r: SimResult) => r.frames[r.frames.length - 1]
const objAt = (r: SimResult, id: string) => last(r).objects.find((o) => o.id === id)!
const task = (r: SimResult, id: string) => r.tasks.find((t) => t.id === id)!
const stuck = (r: SimResult) => /stuck/.test(r.warnings.join(' '))

describe('push bar', () => {
  it('slides along its rail when pushed from the front and ticks at its target', () => {
    const bar = makeObject('push_bar', 0, 200) // 24 mm thick: its front is at y = 188
    const r = run([forward(18)], [bar]) // robot front ends at y = 244
    expect(objAt(r, bar.id).y).toBeCloseTo(256, 0)
    expect(objAt(r, bar.id).x).toBeCloseTo(0, 6)
    expect(task(r, bar.id)).toMatchObject({ kind: 'do', met: true, text: 'Push the bar in' })
    expect(stuck(r)).toBe(false)
  })

  it('does not tick before its target', () => {
    const bar = makeObject('push_bar', 0, 200)
    const r = run([forward(15)], [bar]) // pushed 26 mm, target 50 mm
    expect(objAt(r, bar.id).y).toBeCloseTo(226, 0)
    expect(task(r, bar.id).met).toBe(false)
  })

  it('stops at the end of its rail and then blocks the robot', () => {
    const bar = makeObject('push_bar', 0, 200)
    const r = run([forward(40)], [bar])
    expect(objAt(r, bar.id).y).toBeCloseTo(280, 0) // 80 mm of travel, no more
    expect(last(r).y).toBeLessThan(210)
    expect(stuck(r)).toBe(true)
    expect(task(r, bar.id).met).toBe(true)
  })

  it('does not move when pushed from the side', () => {
    const bar = makeObject('push_bar', 0, 200)
    const r = run([forward(30)], [bar], { scene: { start: { x: -300, y: 200, headingDeg: 90 } } })
    expect(objAt(r, bar.id).x).toBeCloseTo(0, 6)
    expect(objAt(r, bar.id).y).toBeCloseTo(200, 6)
    expect(stuck(r)).toBe(true)
    expect(task(r, bar.id).met).toBe(false)
  })

  it('does not move when pushed from behind', () => {
    const bar = makeObject('push_bar', 0, 200)
    const r = run([forward(30)], [bar], { scene: { start: { x: 0, y: 500, headingDeg: 180 } } })
    expect(objAt(r, bar.id).y).toBeCloseTo(200, 6)
    expect(stuck(r)).toBe(true)
    expect(task(r, bar.id).met).toBe(false)
  })

  it('follows its rail when the bar is turned', () => {
    const bar = { ...makeObject('push_bar', 200, 0), rot: 90 } // its rail now runs towards +x
    const r = run([forward(18)], [bar], { scene: { start: { x: 0, y: 0, headingDeg: 90 } } })
    expect(objAt(r, bar.id).x).toBeCloseTo(256, 0)
    expect(objAt(r, bar.id).y).toBeCloseTo(0, 6)
    expect(task(r, bar.id).met).toBe(true)
  })

  it('is only an obstacle when its task is switched off', () => {
    const bar = { ...makeObject('push_bar', 0, 200), task: false }
    const r = run([forward(18)], [bar])
    expect(r.tasks).toEqual([])
    expect(objAt(r, bar.id).y).toBeCloseTo(256, 0) // it still slides
  })
})

describe('press plate', () => {
  it('ticks when the robot body touches its front face', () => {
    const plate = makeObject('press_plate', 0, 200) // 40 mm deep: its front is at y = 180
    const r = run([forward(30)], [plate])
    expect(task(r, plate.id)).toMatchObject({ kind: 'do', met: true, text: 'Press the plate' })
    expect(objAt(r, plate.id).y).toBeCloseTo(200, 6) // it never moves
    expect(stuck(r)).toBe(true)
  })

  it('ticks when a tool touches it', () => {
    const plate = makeObject('press_plate', 0, 300)
    const r = run([forward(18)], [plate], { attachments: [ram] }) // tool tip at 64 + 60 + 180 = 304
    expect(task(r, plate.id).met).toBe(true)
  })

  it('does not tick when the robot stops short or drives past', () => {
    const short = makeObject('press_plate', 0, 300)
    expect(task(run([forward(10)], [short]), short.id).met).toBe(false)
    const beside = makeObject('press_plate', 160, 200)
    const r = run([forward(30)], [beside])
    expect(task(r, beside.id).met).toBe(false)
    expect(stuck(r)).toBe(false)
  })

  it('only counts its front: a plate facing away is not pressed from behind', () => {
    const away = { ...makeObject('press_plate', 0, 200), rot: 180 }
    expect(task(run([forward(30)], [away]), away.id).met).toBe(false)
    const fromFront = run([forward(30)], [away], { scene: { start: { x: 0, y: 500, headingDeg: 180 } } })
    expect(task(fromFront, away.id).met).toBe(true)
  })
})

describe('pull ring and the hook', () => {
  it('catches the ring driving forward and ticks after pulling it far enough', () => {
    const ring = makeObject('pull_ring', 0, 300)
    const r = run([forward(12), backward(15)], [ring], { attachments: [hook] }) // hook tip reaches y = 294
    expect(task(r, ring.id)).toMatchObject({ kind: 'do', met: true, text: 'Pull the ring out' })
    expect(objAt(r, ring.id).y).toBeLessThan(160) // it came back with the robot
    expect(objAt(r, ring.id).carried).toBe(true)
  })

  it('does not tick when the ring was pulled less than its target', () => {
    const ring = makeObject('pull_ring', 0, 300)
    const r = run([forward(12), backward(6)], [ring], { attachments: [hook] })
    expect(task(r, ring.id).met).toBe(false)
  })

  it('is only pushed, never ticked, without a hook', () => {
    const ring = makeObject('pull_ring', 0, 300)
    const r = run([forward(30), backward(15)], [ring], { attachments: [ram] })
    expect(objAt(r, ring.id).y).toBeGreaterThan(400) // shoved forward and left there
    expect(objAt(r, ring.id).carried).toBe(false)
    expect(task(r, ring.id).met).toBe(false)
  })

  it('keeps its tick after the ring is dragged back', () => {
    const ring = makeObject('pull_ring', 0, 300)
    const r = run([forward(12), backward(15), forward(15)], [ring], { attachments: [hook] })
    expect(objAt(r, ring.id).y).toBeGreaterThan(250) // back near where it started
    expect(task(r, ring.id).met).toBe(true)
  })

  it('stops the robot when the hooked ring would be dragged into something fixed', () => {
    // A small fixed block just to the left of where the caught ring sits. Spinning left swings the ring into it.
    const post = { ...makeObject('obstacle', -51, 146), w: 20, l: 20 }
    const spin = blk('turn_for', { direction: 'left', degrees: 30 })
    const ring = makeObject('pull_ring', -15, 152) // already under the hook's tip
    const withRing = run([spin], [ring, post], { attachments: [hook] })
    expect(objAt(withRing, ring.id).carried).toBe(true)
    expect(stuck(withRing)).toBe(true)
    const farRing = makeObject('pull_ring', 400, 400)
    const without = run([spin], [farRing, post], { attachments: [hook] })
    // the ring reaches the post before the bare hook would
    expect(Math.abs(last(withRing).h)).toBeLessThan(Math.abs(last(without).h) - 0.03)
  })
})

describe('"do not touch" blocks', () => {
  it('stays ticked while the robot keeps away', () => {
    const block = { ...makeObject('obstacle', 0, 300), task: true }
    const r = run([forward(10)], [block])
    expect(task(r, block.id)).toMatchObject({ kind: 'avoid', met: true, text: 'Do not touch the block' })
  })

  it('loses its tick at the first touch and never gets it back', () => {
    const block = { ...makeObject('obstacle', 0, 300), task: true }
    const r = run([forward(30), backward(20)], [block])
    expect(task(r, block.id).met).toBe(false)
    expect(tasksAt(r, 0).find((t) => t.id === block.id)!.met).toBe(true)
  })

  it('is not a task unless it is marked', () => {
    expect(run([forward(10)], [makeObject('obstacle', 0, 300)]).tasks).toEqual([])
  })
})

describe('the checklist', () => {
  it('ticks at the moment a task is achieved, so stepping back un-ticks it', () => {
    const bar = makeObject('push_bar', 0, 200)
    const r = run([forward(18)], [bar])
    const change = r.taskChanges.find((c) => r.tasks[c.task].id === bar.id && c.met)!
    expect(change.frame).toBeGreaterThan(0)
    expect(change.frame).toBeLessThan(r.frames.length - 1)
    expect(tasksAt(r, change.frame - 1)[0].met).toBe(false)
    expect(tasksAt(r, change.frame)[0].met).toBe(true)
    expect(tasksAt(r, r.frames.length - 1)[0].met).toBe(true)
    // the frame itself restores how far the bar had travelled
    expect(r.frames[change.frame - 1].objects[0].y).toBeLessThan(r.frames[change.frame].objects[0].y)
  })

  it('numbers pieces of the same kind', () => {
    const r = run([forward(5)], [makeObject('push_bar', 0, 300), makeObject('push_bar', 300, 300)])
    expect(r.tasks.map((t) => t.text)).toEqual(['Push the bar in (1)', 'Push the bar in (2)'])
  })

  it('adds the goal as the last row, following where things are', () => {
    const finish = makeObject('finish', 0, 150)
    const ring = makeObject('pull_ring', 300, 600)
    const r = run([forward(15)], [finish, ring], { scene: { goal: { type: 'robot_in_zone', zoneId: finish.id } } })
    const row = r.tasks[r.tasks.length - 1]
    expect(row.kind).toBe('goal')
    expect(row.met).toBe(true)
    expect(row.met).toBe(r.goal!.met)
    expect(tasksAt(r, 0)[r.tasks.length - 1].met).toBe(false) // not parked yet at the start
  })

  it('says the mission is complete only when everything is done and something was done', () => {
    expect(missionComplete([])).toBe(false)
    expect(missionComplete([{ id: 'a', text: '', kind: 'avoid', met: true }])).toBe(false)
    expect(missionComplete([{ id: 'a', text: '', kind: 'do', met: true }, { id: 'b', text: '', kind: 'avoid', met: true }])).toBe(true)
    expect(missionComplete([{ id: 'a', text: '', kind: 'do', met: true }, { id: 'b', text: '', kind: 'do', met: false }])).toBe(false)
    expect(missionComplete([{ id: 'g', text: '', kind: 'goal', met: true }])).toBe(true)
  })

  it('says that practice pieces are stand-ins', () => {
    const r = run([forward(5)], [makeObject('press_plate', 0, 400)])
    expect(r.assumptions.join(' ')).toContain('Practice pieces are simple stand-ins')
  })

  it('leaves a project without kit pieces exactly as it was', () => {
    const finish = makeObject('finish', 0, 300)
    const cube = makeObject('cube', 0, 150)
    const r = run([forward(30)], [finish, cube], { scene: { goal: { type: 'robot_in_zone', zoneId: finish.id } } })
    expect(r.tasks).toEqual([])
    expect(r.taskChanges).toEqual([])
    expect(r.goal).toEqual({ met: true, text: 'The robot is parked on the target!' })
    expect(r.assumptions.join(' ')).not.toContain('Practice pieces')
    expect(Object.keys(last(r)).sort()).toEqual(['active', 'blocked', 'h', 'joints', 'light', 'motors', 'objects', 'path', 'sensors', 't', 'vars', 'wheelL', 'wheelR', 'x', 'y', 'yaw'])
    expect(Object.keys(last(r).objects[0]).sort()).toEqual(['carried', 'id', 'rot', 'x', 'y', 'z'])
  })
})
