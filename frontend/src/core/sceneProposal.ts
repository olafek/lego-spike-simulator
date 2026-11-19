// Validation of an AI "mission mat" proposal. The AI only PROPOSES: this module turns its JSON into
// scene objects (or rejects it), and the child must approve before anything is placed.
// Unknown object types are dropped and reported, never replaced by a guess.

import { z } from 'zod'
import { COLOR_HEX, COLOR_NAMES, type ColorName } from './catalog'
import { makeObject, OBJECT_DEFS, type Goal, type ObjectType, type SceneObject } from './scene'
import { MM_PER_CM } from './units'

export class SceneProposalError extends Error {
  constructor(
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message)
    this.name = 'SceneProposalError'
  }
}

export interface SceneProposal {
  objects: SceneObject[]
  goal: Goal | null
  assumptions: string[]
  /** things the AI asked for that SPIKE Lab does not have (shown to the child) */
  dropped: string[]
}

export const MAX_PROPOSED_OBJECTS = 20
const POSITION_LIMIT_MM = 3000

const RawProposal = z.object({
  objects: z.array(z.unknown()),
  goal: z.unknown().optional(),
  assumptions: z.array(z.unknown()).optional(),
})

const ZONE_TYPES: ObjectType[] = ['target_zone', 'finish', 'color_zone']

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function parseSceneProposal(raw: unknown): SceneProposal {
  const top = RawProposal.safeParse(raw)
  if (!top.success) {
    throw new SceneProposalError(
      'The mat suggestion did not have the expected shape.',
      top.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    )
  }
  const objects: SceneObject[] = []
  const dropped: string[] = []

  for (const item of top.data.objects) {
    if (objects.length >= MAX_PROPOSED_OBJECTS) {
      dropped.push('extra objects (too many for one mat)')
      break
    }
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const type = typeof r.type === 'string' ? r.type.trim().toLowerCase() : ''
    if (!(type in OBJECT_DEFS)) {
      dropped.push(type ? `"${type.slice(0, 40)}"` : 'an object without a type')
      continue
    }
    const x = num(r.xCm)
    const y = num(r.yCm)
    if (x === null || y === null) {
      dropped.push(`a ${OBJECT_DEFS[type as ObjectType].label.toLowerCase()} without a position`)
      continue
    }
    const def = OBJECT_DEFS[type as ObjectType]
    const o = makeObject(type as ObjectType, clamp(x * MM_PER_CM, -POSITION_LIMIT_MM, POSITION_LIMIT_MM), clamp(y * MM_PER_CM, -POSITION_LIMIT_MM, POSITION_LIMIT_MM))
    const rot = num(r.rotationDeg)
    if (rot !== null) o.rot = ((rot % 360) + 360) % 360
    const w = num(r.widthCm)
    const l = num(r.lengthCm)
    if (def.shape === 'circle') {
      if (w !== null && w > 0) o.r = clamp((w * MM_PER_CM) / 2, 10, 400)
    } else {
      if (w !== null && w > 0) o.w = clamp(w * MM_PER_CM, 10, 2000)
      if (l !== null && l > 0) o.l = clamp(l * MM_PER_CM, 10, 2000)
    }
    if (typeof r.color === 'string') {
      const c = r.color.trim().toLowerCase()
      if (c !== 'none' && (COLOR_NAMES as readonly string[]).includes(c)) {
        o.color = COLOR_HEX[c as ColorName]
        if (def.surface) o.surface = c as ColorName
      }
    }
    objects.push(o)
  }

  const firstZone = (order: ObjectType[]): SceneObject | undefined => {
    for (const t of order) {
      const hit = objects.find((o) => o.type === t)
      if (hit) return hit
    }
    return undefined
  }

  let goal: Goal | null = null
  const g = top.data.goal
  if (g && typeof g === 'object') {
    const gr = g as Record<string, unknown>
    if (gr.type === 'robot_in_zone') {
      const zone = firstZone(['finish', 'target_zone', 'color_zone'])
      if (zone) goal = { type: 'robot_in_zone', zoneId: zone.id }
    } else if (gr.type === 'object_in_zone') {
      const zone = firstZone(ZONE_TYPES)
      const wanted = typeof gr.objectType === 'string' ? gr.objectType.trim().toLowerCase() : ''
      const movable = (o: SceneObject) => OBJECT_DEFS[o.type].solid && OBJECT_DEFS[o.type].movable
      const obj = objects.find((o) => o.type === wanted && movable(o)) ?? (wanted ? undefined : objects.find(movable))
      if (zone && obj) goal = { type: 'object_in_zone', objectId: obj.id, zoneId: zone.id }
    }
  }

  const assumptions = (top.data.assumptions ?? []).filter((a): a is string => typeof a === 'string' && a.trim().length > 0).map((a) => a.trim().slice(0, 240)).slice(0, 12)

  return { objects, goal, assumptions, dropped }
}
