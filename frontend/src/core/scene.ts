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
  return { r: o.r ?? d.r ?? 0, w: o.w ?? d.w ?? 0, l: o.l ?? d.l ?? 0, h: d.h }
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
