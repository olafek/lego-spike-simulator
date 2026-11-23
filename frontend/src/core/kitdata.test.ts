import { describe, expect, it } from 'vitest'
import { hookZone, toolRects, toolSize } from './attachmentGeometry'
import { newProjectData, parseProjectData } from './project'
import { ATTACHMENTS, resolveRobot, type AttachmentInstance } from './robots'
import { BLOCK_HEIGHTS, hasTask, KIT, makeObject, OBJECT_DEFS, objectSize, targetOf } from './scene'

describe('practice kit pieces', () => {
  it('has a push bar, a press plate and a pull ring, each marked as an approximation', () => {
    expect(OBJECT_DEFS.push_bar.kit).toBe('push')
    expect(OBJECT_DEFS.press_plate.kit).toBe('press')
    expect(OBJECT_DEFS.pull_ring.kit).toBe('pull')
    for (const type of ['push_bar', 'press_plate', 'pull_ring'] as const) expect(OBJECT_DEFS[type].note.startsWith('≈')).toBe(true)
    expect(OBJECT_DEFS.push_bar.movable).toBe(true)
    expect(OBJECT_DEFS.press_plate.movable).toBe(false)
    expect(OBJECT_DEFS.pull_ring.shape).toBe('circle')
  })

  it('gives kit pieces a task by default and lets it be switched off', () => {
    const bar = makeObject('push_bar', 0, 0)
    expect(hasTask(bar)).toBe(true)
    expect(hasTask({ ...bar, task: false })).toBe(false)
    expect(targetOf(bar)).toBe(KIT.push.targetMm)
    expect(targetOf({ ...bar, targetMm: 70 })).toBe(70)
    expect(targetOf(makeObject('pull_ring', 0, 0))).toBe(KIT.pull.targetMm)
  })

  it('makes a block a task only when it is marked "do not touch"', () => {
    const block = makeObject('obstacle', 0, 0)
    expect(hasTask(block)).toBe(false)
    expect(hasTask({ ...block, task: true })).toBe(true)
    expect(hasTask(makeObject('cube', 0, 0))).toBe(false)
  })

  it('lets a block have a rough height', () => {
    const block = makeObject('obstacle', 0, 0)
    expect(objectSize(block).h).toBe(BLOCK_HEIGHTS.medium)
    expect(objectSize({ ...block, h: BLOCK_HEIGHTS.tall }).h).toBe(160)
    expect(BLOCK_HEIGHTS.low).toBe(40)
  })

  it('saves and reads the new fields, and still reads a project without them', () => {
    const d = newProjectData()
    d.scene.objects = [
      { ...makeObject('push_bar', 0, 300), rot: 90, targetMm: 60 },
      makeObject('press_plate', 200, 300),
      { ...makeObject('pull_ring', -200, 300), task: false },
      { ...makeObject('obstacle', 0, 600), task: true, h: 160 },
    ]
    const back = parseProjectData(JSON.parse(JSON.stringify(d)))
    expect(back.scene.objects.map((o) => o.type)).toEqual(['push_bar', 'press_plate', 'pull_ring', 'obstacle'])
    expect(back.scene.objects[0].targetMm).toBe(60)
    expect(back.scene.objects[2].task).toBe(false)
    expect(back.scene.objects[3].h).toBe(160)
    expect(parseProjectData(JSON.parse(JSON.stringify(newProjectData()))).scene.objects).toEqual([])
  })
})

describe('the hook', () => {
  const robot = resolveRobot('db1')
  const hook: AttachmentInstance = { uid: 'tool', kind: 'hook', port: null }

  it('is a passive tool with an adjustable size and an approximation note', () => {
    expect(ATTACHMENTS.hook.group).toBe('tool')
    expect(ATTACHMENTS.hook.motorised).toBe(false)
    expect(ATTACHMENTS.hook.approximations).toContain('cannot let go') // shown after a "≈" in the robot step
    expect(toolSize(hook)).toEqual({ w: 16, l: 110 })
    expect(toolSize({ ...hook, lengthMm: 150, widthMm: 20 })).toEqual({ w: 20, l: 150 })
  })

  it('reaches forward from the front mount and catches at its tip', () => {
    const rects = toolRects(robot, hook, 0)
    expect(rects.length).toBeGreaterThanOrEqual(2) // the arm and the barb
    const tip = Math.max(...rects.map((r) => r.y1))
    expect(tip).toBeCloseTo(robot.mounts.frontMm + 110, 6)
    expect(Math.min(...rects.map((r) => r.y0))).toBeCloseTo(robot.mounts.frontMm, 6)
    const zone = hookZone(robot, hook)
    expect(zone.y1).toBeGreaterThanOrEqual(tip)
    expect(zone.y0).toBeLessThan(tip)
    expect(zone.y0).toBeGreaterThan(robot.mounts.frontMm + 60) // only the tip catches, not the whole arm
  })
})
