// Sample exercises. Each builds a complete project document; nothing here needs the network.

import { makeBlock, type Block, type Program } from './ir'
import { newProjectData, type ProjectData } from './project'
import { ROBOT_BY_ID, type AttachmentInstance } from './robots'
import { emptyScene, type Scene, type SceneObject } from './scene'

export interface Sample {
  id: string
  title: string
  emoji: string
  blurb: string
  build(): { name: string; data: ProjectData }
}

function blk(op: string, params: Record<string, unknown> = {}, children?: Block[]): Block {
  const b = makeBlock(op)
  Object.assign(b.params, params)
  if (children) b.children = children
  return b
}

function program(blocks: Block[], ports = 'C+D'): Program {
  return { irVersion: 1, notes: [], stacks: [{ id: 's_main', hat: { op: 'when_program_starts' }, blocks: [blk('set_movement_motors', { ports }), ...blocks] }] }
}

function project(name: string, summary: string, prog: Program, extra: Partial<ProjectData> = {}): { name: string; data: ProjectData } {
  const robotId = extra.robotId ?? 'db1'
  const base = ROBOT_BY_ID[robotId].defaultAttachments.map((a) => ({ ...a }))
  return {
    name,
    data: newProjectData({ program: prog, summary, step: 'simulate', robotConfirmed: true, ...extra, robotId, attachments: [...base, ...(extra.attachments ?? [])] }),
  }
}

const fork: AttachmentInstance = { uid: 'tool', kind: 'fork', port: null }
const obj = (id: string, type: SceneObject['type'], x: number, y: number, rot = 0): SceneObject => ({ id, type, x, y, rot })
const scene = (objects: SceneObject[], goal: Scene['goal'] = null, description = ''): Scene => ({ ...emptyScene(), objects, goal, description })

export const SAMPLES: Sample[] = [
  {
    id: 'drive-30',
    title: 'Drive 30 cm',
    emoji: '📏',
    blurb: 'Roll forward exactly three grid squares.',
    build: () => project('Drive 30 cm', 'Drive forward 30 cm', program([blk('move_for', { direction: 'forward', amount: 30, unit: 'cm' })])),
  },
  {
    id: 'turn-90',
    title: 'Turn 90°',
    emoji: '↪️',
    blurb: 'Spin a quarter turn to the right.',
    build: () => project('Turn 90°', 'Turn right 90°', program([blk('turn_for', { direction: 'right', degrees: 90 })])),
  },
  {
    id: 'square',
    title: 'Square route',
    emoji: '🟦',
    blurb: 'Four sides, four corners, back home.',
    build: () =>
      project(
        'Square route',
        'Drive a 20 cm square',
        program([blk('repeat', { times: 4 }, [blk('move_for', { direction: 'forward', amount: 20, unit: 'cm' }), blk('turn_for', { direction: 'right', degrees: 90 })])]),
      ),
  },
  {
    id: 'backward',
    title: 'There and back',
    emoji: '🔙',
    blurb: 'Drive forward, then reverse home.',
    build: () =>
      project(
        'There and back',
        'Forward 20 cm, backward 20 cm',
        program([blk('move_for', { direction: 'forward', amount: 20, unit: 'cm' }), blk('wait_seconds', { seconds: 0.5 }), blk('move_for', { direction: 'backward', amount: 20, unit: 'cm' })]),
      ),
  },
  {
    id: 'push-crate',
    title: 'Push a crate',
    emoji: '📦',
    blurb: 'A fork that only pushes – no lifting.',
    build: () =>
      project('Push a crate', 'Push the crate onto the green circle', program([blk('move_for', { direction: 'forward', amount: 35, unit: 'cm' })]), {
        attachments: [fork],
        scene: scene([obj('zone', 'target_zone', 0, 560), obj('crate', 'box', 0, 300)], { type: 'object_in_zone', objectId: 'crate', zoneId: 'zone' }, 'Push the crate onto the green circle'),
      }),
  },
  {
    id: 'arm',
    title: 'Move the arm',
    emoji: '🦾',
    blurb: 'Driving Base 2: motor E lifts a cube.',
    build: () =>
      project(
        'Move the arm',
        'Lift a cube with the motor arm',
        program([
          blk('move_for', { direction: 'forward', amount: 10, unit: 'cm' }),
          blk('motor_set_speed', { ports: 'E', speed: 30 }),
          blk('motor_run_for', { ports: 'E', direction: 'clockwise', amount: 60, unit: 'degrees' }),
          blk('move_for', { direction: 'forward', amount: 20, unit: 'cm' }),
          blk('motor_run_for', { ports: 'E', direction: 'counterclockwise', amount: 60, unit: 'degrees' }),
        ]),
        { robotId: 'db2', scene: scene([obj('cube', 'cube', 0, 270)]) },
      ),
  },
  {
    id: 'seed-pod',
    title: 'Big seed pod',
    emoji: '🌰',
    blurb: 'Not far enough yet… can you fix it?',
    build: () =>
      project('Big seed pod', 'Push the big seed pod into the circle', program([blk('move_for', { direction: 'forward', amount: 20, unit: 'cm' })]), {
        attachments: [fork],
        scene: scene([obj('zone', 'target_zone', 0, 540), obj('pod', 'seed_pod_large', 0, 300)], { type: 'object_in_zone', objectId: 'pod', zoneId: 'zone' }, 'Push the big seed pod into the circle'),
      }),
  },
]

/** Stored screenshot fixture used by the "example screenshot" path (upload → recognise → check → simulate). */
export const SAMPLE_SCREENSHOT = { url: 'samples/sample-program.png', name: 'sample-program.png', title: 'Example screenshot' }
