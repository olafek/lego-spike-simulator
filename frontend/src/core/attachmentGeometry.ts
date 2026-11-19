// Attachment geometry in the robot frame (origin between the drive wheels, y forward, mm).
// Shared by the physics engine (collision) and the renderer (meshes) so they can never disagree.

import { ATTACHMENTS, type AttachmentInstance, type RobotConfig } from './robots'

export interface LocalRect {
  x0: number
  x1: number
  y0: number
  y1: number
  role: 'plate' | 'tine' | 'jaw' | 'blade' | 'body' | 'sensor'
}

export const LIFT_THRESHOLD_DEG = 12
const CLAW_OPEN_GAP = 104
const CLAW_CLOSED_GAP = 12

export function toolSize(inst: AttachmentInstance): { w: number; l: number } {
  const def = ATTACHMENTS[inst.kind]
  if (inst.kind === 'custom') return { w: inst.widthMm ?? def.widthMm, l: inst.lengthMm ?? def.lengthMm }
  return { w: def.widthMm, l: def.lengthMm }
}

/** Gap between the claw jaws (mm) for a joint angle. */
export function clawGap(jointDeg: number): number {
  const def = ATTACHMENTS.grabber.joint!
  const k = Math.min(1, Math.max(0, (jointDeg - def.minDeg) / (def.maxDeg - def.minDeg)))
  return CLAW_OPEN_GAP + (CLAW_CLOSED_GAP - CLAW_OPEN_GAP) * k
}

/** Joint angle at which the jaws are exactly `gap` mm apart. */
export function clawAngleForGap(gap: number): number {
  const def = ATTACHMENTS.grabber.joint!
  const k = (gap - CLAW_OPEN_GAP) / (CLAW_CLOSED_GAP - CLAW_OPEN_GAP)
  return def.minDeg + Math.min(1, Math.max(0, k)) * (def.maxDeg - def.minDeg)
}

/** Rectangles that make up a tool, for the given joint angle (degrees). */
export function toolRects(robot: RobotConfig, inst: AttachmentInstance, jointDeg: number): LocalRect[] {
  const y0 = robot.mounts.frontMm
  const { w, l } = toolSize(inst)
  switch (inst.kind) {
    case 'fork':
    case 'wide_fork':
    case 'lift_arm':
      return [
        { x0: -w / 2, x1: w / 2, y0, y1: y0 + 8, role: 'plate' },
        { x0: -w / 2, x1: -w / 2 + 8, y0: y0 + 8, y1: y0 + l, role: 'tine' },
        { x0: w / 2 - 8, x1: w / 2, y0: y0 + 8, y1: y0 + l, role: 'tine' },
      ]
    case 'dozer':
      return [{ x0: -w / 2, x1: w / 2, y0, y1: y0 + l, role: 'blade' }]
    case 'bumper':
    case 'custom':
      return [{ x0: -w / 2, x1: w / 2, y0, y1: y0 + l, role: 'body' }]
    case 'grabber': {
      const gap = clawGap(jointDeg)
      return [
        { x0: -w / 2, x1: w / 2, y0, y1: y0 + 8, role: 'plate' },
        { x0: -gap / 2 - 8, x1: -gap / 2, y0: y0 + 8, y1: y0 + l, role: 'jaw' },
        { x0: gap / 2, x1: gap / 2 + 8, y0: y0 + 8, y1: y0 + l, role: 'jaw' },
      ]
    }
    case 'force_sensor':
      return [{ x0: -8, x1: 8, y0, y1: y0 + l, role: 'sensor' }]
    default:
      return []
  }
}

/** True when a lift-type tool is raised high enough to pass over things on the floor. */
export function isRaised(inst: AttachmentInstance, jointDeg: number): boolean {
  const def = ATTACHMENTS[inst.kind]
  return def.joint?.type === 'lift' && inst.port !== null && jointDeg > LIFT_THRESHOLD_DEG
}

/** Zone (robot frame) in which a rising lift arm picks things up / a closing claw grabs. */
export function captureZone(robot: RobotConfig, inst: AttachmentInstance, jointDeg: number): LocalRect | null {
  const y0 = robot.mounts.frontMm
  const { w, l } = toolSize(inst)
  if (inst.kind === 'lift_arm') return { x0: -w / 2, x1: w / 2, y0: y0 + 8, y1: y0 + l + 12, role: 'body' }
  if (inst.kind === 'grabber') {
    const gap = clawGap(jointDeg)
    return { x0: -gap / 2, x1: gap / 2, y0: y0 + 8, y1: y0 + l, role: 'body' }
  }
  return null
}

/** Height (mm) of a carried object for a lift joint angle. */
export function liftHeight(inst: AttachmentInstance, jointDeg: number): number {
  const { l } = toolSize(inst)
  return Math.max(0, Math.sin((jointDeg * Math.PI) / 180) * l)
}
