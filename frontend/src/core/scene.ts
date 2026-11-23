// Scene (mission mat) model. Sizes are mm; `rot` is degrees clockwise.
// Object dimensions are generic approximations unless a preset says otherwise.

import type { ColorName } from './catalog'

export type ObjectType =
  | 'seed_pod_small'
  | 'seed_pod_large'
  | 'box'
  | 'cube'
  | 'ball'
  | 'cylinder'
  | 'obstacle'
  | 'wall'
  | 'color_zone'
  | 'target_zone'
  | 'line'
  | 'finish'
  | 'push_bar'
  | 'press_plate'
  | 'pull_ring'

export interface ObjectDef {
  type: ObjectType
  label: string
  icon: string
  shape: 'circle' | 'box'
  /** circle radius or box width/length */
  r?: number
  w?: number
  l?: number
  h: number
  /** blocks movement */
  solid: boolean
  /** can be pushed */
  movable: boolean
  /** can be picked up by a lift arm / grabber */
  liftable: boolean
  /** keeps rolling after a push */
  rolls: boolean
  color: string
  /** colour seen by a colour sensor (flat things only) */
  surface?: ColorName
  /** a practice stand-in that reacts to the robot: pushed along a rail, pressed on its front, or pulled by a hook */
  kit?: 'push' | 'press' | 'pull'
  note: string
}

export const OBJECT_DEFS: Record<ObjectType, ObjectDef> = {
  seed_pod_small: { type: 'seed_pod_small', label: 'Small seed pod', icon: '🌱', shape: 'circle', r: 24, h: 40, solid: true, movable: true, liftable: true, rolls: false, color: '#7ac74f', note: 'Approximate size: 4.8 cm across.' },
  seed_pod_large: { type: 'seed_pod_large', label: 'Large seed pod', icon: '🌰', shape: 'circle', r: 48, h: 72, solid: true, movable: true, liftable: true, rolls: false, color: '#3f9b3a', note: 'Approximate size: 9.6 cm across.' },
  box: { type: 'box', label: 'Crate', icon: '📦', shape: 'box', w: 96, l: 96, h: 64, solid: true, movable: true, liftable: true, rolls: false, color: '#d98b3a', note: 'Slides when pushed. It does not spin in this version.' },
  cube: { type: 'cube', label: 'Cube', icon: '🧊', shape: 'box', w: 48, l: 48, h: 48, solid: true, movable: true, liftable: true, rolls: false, color: '#e3242b', note: 'Slides when pushed.' },
  ball: { type: 'ball', label: 'Ball', icon: '⚽', shape: 'circle', r: 26, h: 52, solid: true, movable: true, liftable: false, rolls: true, color: '#f5f5f5', note: 'Keeps rolling a little after a push (estimated).' },
  cylinder: { type: 'cylinder', label: 'Cylinder', icon: '🥫', shape: 'circle', r: 28, h: 80, solid: true, movable: true, liftable: true, rolls: false, color: '#4cc9f0', note: 'Stands upright and slides when pushed.' },
  obstacle: { type: 'obstacle', label: 'Obstacle', icon: '🪨', shape: 'box', w: 96, l: 96, h: 80, solid: true, movable: false, liftable: false, rolls: false, color: '#6b7280', note: 'Too heavy to move. The robot gets stuck against it.' },
  wall: { type: 'wall', label: 'Wall', icon: '🧱', shape: 'box', w: 400, l: 24, h: 64, solid: true, movable: false, liftable: false, rolls: false, color: '#9aa3b5', note: 'Cannot be moved.' },
  color_zone: { type: 'color_zone', label: 'Colour patch', icon: '🟥', shape: 'box', w: 150, l: 150, h: 0, solid: false, movable: false, liftable: false, rolls: false, color: '#e3242b', surface: 'red', note: 'Flat. A colour sensor can see it.' },
  target_zone: { type: 'target_zone', label: 'Target circle', icon: '🎯', shape: 'circle', r: 90, h: 0, solid: false, movable: false, liftable: false, rolls: false, color: '#22a84a', surface: 'green', note: 'Flat. Use it as the place to deliver things.' },
  line: { type: 'line', label: 'Black line', icon: '➖', shape: 'box', w: 20, l: 500, h: 0, solid: false, movable: false, liftable: false, rolls: false, color: '#1b1f2a', surface: 'black', note: 'Flat tape for line following.' },
  // Practice kit: generic stand-ins for the kinds of things a mission asks for. Their front is the side
  // facing local -y; a push bar travels towards local +y. They are not copies of any real model.
  push_bar: { type: 'push_bar', label: 'Push bar', icon: '⏩', shape: 'box', w: 120, l: 24, h: 40, solid: true, movable: true, liftable: false, rolls: false, color: '#ff8a3d', kit: 'push', note: '≈ A bar on a short rail. It only slides when it is pushed from the front, and only so far.' },
  press_plate: { type: 'press_plate', label: 'Press plate', icon: '🔘', shape: 'box', w: 80, l: 40, h: 60, solid: true, movable: false, liftable: false, rolls: false, color: '#b06cff', kit: 'press', note: '≈ A fixed block. Touch its front face to press it.' },
  pull_ring: { type: 'pull_ring', label: 'Pull ring', icon: '⭕', shape: 'circle', r: 18, h: 10, solid: true, movable: true, liftable: false, rolls: false, color: '#ffd23f', kit: 'pull', note: '≈ A ring on the mat. A hook catches it and pulls it; a hook cannot let it go again.' },
  finish: { type: 'finish', label: 'Finish spot', icon: '🏁', shape: 'box', w: 200, l: 200, h: 0, solid: false, movable: false, liftable: false, rolls: false, color: '#ffd23f', surface: 'yellow', note: 'Flat. Where the robot should end up.' },
}

export interface SceneObject {
  id: string
  type: ObjectType
  x: number
  y: number
  /** degrees clockwise */
  rot: number
  r?: number
  w?: number
  l?: number
  color?: string
  surface?: ColorName
  /** kit pieces: false = just an obstacle. Block (obstacle): true = "do not touch" */
  task?: boolean
  /** how far a push bar must be pushed / a ring pulled for its task (mm) */
  targetMm?: number
  /** rough height of a block (mm); looks only */
  h?: number
}

/** Practice kit numbers (all approximate). */
export const KIT = {
  push: { travelMm: 80, targetMm: 50, min: 20, max: 80, step: 10 },
  pull: { targetMm: 100, min: 50, max: 300, step: 50 },
} as const

/** Rough block heights: low, medium (the usual block), tall. */
export const BLOCK_HEIGHTS = { low: 40, medium: 80, tall: 160 } as const

/** Does this thing on the mat ask the robot to do (or not do) something? */
export function hasTask(o: SceneObject): boolean {
  if (OBJECT_DEFS[o.type]?.kit) return o.task !== false
  return o.type === 'obstacle' && o.task === true
}

/** How far a push bar must travel / a ring must be pulled (mm). */
export function targetOf(o: SceneObject): number {
  const kit = OBJECT_DEFS[o.type]?.kit
  const fallback = kit === 'push' ? KIT.push.targetMm : kit === 'pull' ? KIT.pull.targetMm : 0
  return o.targetMm ?? fallback
}

export type Goal =
  | { type: 'object_in_zone'; objectId: string; zoneId: string }
  | { type: 'robot_in_zone'; zoneId: string }

export interface Scene {
  start: { x: number; y: number; headingDeg: number }
  objects: SceneObject[]
  goal: Goal | null
  description: string
  floor: ColorName
  /** 'open' = endless floor; the other two are bordered mats */
  mat: MatKind
}

export type MatKind = 'open' | 'classroom' | 'competition'

/** Basic classroom mat preset: 200 × 110 cm with a low border wall (approximate table size). */
export const CLASSROOM_MAT = { widthMm: 2000, lengthMm: 1100 }

/** Competition table: the common competition mat size, about 236 × 114 cm, with a border wall. */
export const COMPETITION_MAT = { widthMm: 2362, lengthMm: 1143 }

export function isWalled(mat: MatKind): boolean {
  return mat !== 'open'
}

export function matSize(mat: MatKind): { widthMm: number; lengthMm: number } | null {
  return mat === 'classroom' ? CLASSROOM_MAT : mat === 'competition' ? COMPETITION_MAT : null
}

/** Bounds of a bordered mat (null on the open floor). The default start (0, 0) sits near the bottom middle. */
export function matBounds(mat: MatKind): { x0: number; x1: number; y0: number; y1: number } | null {
  const size = matSize(mat)
  return size ? { x0: -size.widthMm / 2, x1: size.widthMm / 2, y0: -250, y1: size.lengthMm - 250 } : null
}

export function emptyScene(): Scene {
  return { start: { x: 0, y: 0, headingDeg: 0 }, objects: [], goal: null, description: '', floor: 'white', mat: 'open' }
}

export function objectSize(o: SceneObject): { r: number; w: number; l: number; h: number } {
  const d = OBJECT_DEFS[o.type]
  return { r: o.r ?? d.r ?? 0, w: o.w ?? d.w ?? 0, l: o.l ?? d.l ?? 0, h: o.h ?? d.h }
}

/** Was this picture straightened for this mat? (Same proportions; a picture is never stretched onto another mat.) */
export function pictureFitsMat(picture: { width: number; height: number }, mat: MatKind): boolean {
  const size = matSize(mat)
  if (!size || picture.height <= 0) return false
  const want = size.widthMm / size.lengthMm
  return Math.abs(picture.width / picture.height - want) / want < 0.01
}

let sceneId = 0
export function makeObject(type: ObjectType, x: number, y: number): SceneObject {
  sceneId += 1
  return { id: `o_${Date.now().toString(36)}${sceneId.toString(36)}`, type, x, y, rot: 0 }
}

export function goalText(scene: Scene): string | null {
  const g = scene.goal
  if (!g) return null
  const zone = scene.objects.find((o) => o.id === g.zoneId)
  if (!zone) return null
  const zoneName = OBJECT_DEFS[zone.type].label.toLowerCase()
  if (g.type === 'robot_in_zone') return `Park the robot on the ${zoneName}`
  const obj = scene.objects.find((o) => o.id === g.objectId)
  if (!obj) return null
  return `Get the ${OBJECT_DEFS[obj.type].label.toLowerCase()} onto the ${zoneName}`
}

export function snap(value: number, stepMm: number, enabled: boolean): number {
  return enabled && stepMm > 0 ? Math.round(value / stepMm) * stepMm : value
}
