// Project document: everything the backend stores as one JSON blob (plus screenshots as files).
// The recognised program (`original`) and the child's editable copy (`program`) are kept separately.

import { z } from 'zod'
import { emptyProgram, ProgramSchema, type Program } from './ir'
import { ROBOT_BY_ID, type AttachmentInstance, type RobotOverrides } from './robots'
import { emptyScene, OBJECT_DEFS, type MatKind, type Scene } from './scene'
import type { DisplayUnit } from './units'

export const PROJECT_VERSION = 1

export type CameraMode = 'top' | 'orbit' | 'behind' | 'side' | 'follow'
export type LabStep = 'check' | 'robot' | 'mission' | 'simulate'

export interface ProjectSettings {
  unit: DisplayUnit
  gridMajorMm: number
  gridMinorMm: number
  gridLabels: boolean
  snap: boolean
  speed: number
  camera: CameraMode
  calibration: 'ideal' | 'hardware'
  slip: number
  maxSeconds: number
  mode: 'beginner' | 'advanced'
  trail: boolean
  distanceMarkers: boolean
}

export interface ProjectData {
  version: 1
  program: Program
  /** exactly what recognition returned (after validation). Never edited. */
  original: Program | null
  recognition: { driver: string; model: string | null; at: string; issues: string[] } | null
  robotId: string
  /** the child has confirmed the robot (Driving Base 1 is only a visible default until then) */
  robotConfirmed: boolean
  attachments: AttachmentInstance[]
  overrides: RobotOverrides
  scene: Scene
  settings: ProjectSettings
  step: LabStep
  summary: string
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  unit: 'cm',
  gridMajorMm: 100,
  gridMinorMm: 10,
  gridLabels: true,
  snap: true,
  speed: 1,
  camera: 'top',
  calibration: 'ideal',
  slip: 0,
  maxSeconds: 60,
  mode: 'beginner',
  trail: true,
  distanceMarkers: true,
}

export function newProjectData(partial: Partial<ProjectData> = {}): ProjectData {
  const robotId = partial.robotId ?? 'db1'
  return {
    version: 1,
    program: emptyProgram(),
    original: null,
    recognition: null,
    robotId,
    robotConfirmed: false,
    attachments: ROBOT_BY_ID[robotId].defaultAttachments.map((a) => ({ ...a })),
    overrides: {},
    scene: emptyScene(),
    step: 'check',
    summary: '',
    ...partial,
    settings: { ...DEFAULT_SETTINGS, ...partial.settings },
  }
}

/** Put the project on a mat. A competition table gets the length of a real match unless the limit was changed. */
export function setMat(d: ProjectData, mat: MatKind): void {
  d.scene.mat = mat
  if (mat === 'competition' && d.settings.maxSeconds === DEFAULT_SETTINGS.maxSeconds) d.settings.maxSeconds = COMPETITION_MAX_SECONDS
}

/** A competition match lasts two and a half minutes. */
export const COMPETITION_MAX_SECONDS = 150

const PortSchema = z.enum(['A', 'B', 'C', 'D', 'E', 'F'])
const finite = z.number().finite()

const SceneSchema = z.object({
  start: z.object({ x: finite, y: finite, headingDeg: finite }),
  objects: z
    .array(
      z.object({
        id: z.string().min(1),
        type: z.string().refine((t) => t in OBJECT_DEFS, 'unknown object type'),
        x: finite,
        y: finite,
        rot: finite,
        r: finite.positive().max(2000).optional(),
        w: finite.positive().max(4000).optional(),
        l: finite.positive().max(4000).optional(),
        color: z.string().max(20).optional(),
        surface: z.string().max(20).optional(),
      }),
    )
    .max(60),
  goal: z
    .union([
      z.object({ type: z.literal('object_in_zone'), objectId: z.string(), zoneId: z.string() }),
      z.object({ type: z.literal('robot_in_zone'), zoneId: z.string() }),
    ])
    .nullable(),
  description: z.string().max(500),
  floor: z.string(),
  mat: z.enum(['open', 'classroom', 'competition']),
})

const ProjectSchema = z.object({
  version: z.literal(1),
  program: ProgramSchema,
  original: ProgramSchema.nullable(),
  recognition: z.object({ driver: z.string(), model: z.string().nullable(), at: z.string(), issues: z.array(z.string()) }).nullable(),
  robotId: z.string().refine((id) => id in ROBOT_BY_ID, 'unknown robot'),
  robotConfirmed: z.boolean(),
  attachments: z
    .array(
      z.object({
        uid: z.string().min(1),
        kind: z.string(),
        port: PortSchema.nullable(),
        widthMm: finite.positive().max(400).optional(),
        lengthMm: finite.positive().max(400).optional(),
        slot: z.number().int().min(0).max(1).optional(),
      }),
    )
    .max(8),
  overrides: z.object({
    wheelDiameterMm: finite.positive().max(300).optional(),
    trackWidthMm: finite.positive().max(500).optional(),
    leftPort: PortSchema.optional(),
    rightPort: PortSchema.optional(),
    leftPolarity: z.union([z.literal(1), z.literal(-1)]).optional(),
    rightPolarity: z.union([z.literal(1), z.literal(-1)]).optional(),
    gearRatio: finite.positive().max(20).optional(),
  }),
  scene: SceneSchema,
  settings: z.object({
    unit: z.enum(['cm', 'in']),
    gridMajorMm: finite.positive(),
    gridMinorMm: finite.positive(),
    gridLabels: z.boolean(),
    snap: z.boolean(),
    speed: finite.positive().max(8),
    camera: z.enum(['top', 'orbit', 'behind', 'side', 'follow']),
    calibration: z.enum(['ideal', 'hardware']),
    slip: finite.min(0).max(0.9),
    maxSeconds: finite.min(1).max(600),
    mode: z.enum(['beginner', 'advanced']),
    trail: z.boolean(),
    distanceMarkers: z.boolean(),
  }),
  step: z.enum(['check', 'robot', 'mission', 'simulate']),
  summary: z.string().max(200),
})

/** Validate a stored/imported project blob. Missing newer settings fall back to defaults. */
export function parseProjectData(raw: unknown): ProjectData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const merged = { ...r, settings: { ...DEFAULT_SETTINGS, ...((r.settings as object | undefined) ?? {}) } }
  return ProjectSchema.parse(merged) as unknown as ProjectData
}
