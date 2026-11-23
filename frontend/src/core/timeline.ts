// Read-only helpers over a SimResult: stepping boundaries and child-facing measurements.

import type { Frame, SimResult, Span, TaskResult } from './simulate'
import { DEG } from './units'

/** Frame indices where an instruction starts, plus the final frame. */
export function boundaries(r: SimResult): number[] {
  const set = new Set<number>([0, r.frames.length - 1])
  for (const s of r.spans) set.add(s.start)
  return [...set].sort((a, b) => a - b)
}

/** "Next instruction": the frame where the next instruction begins (or the end). */
export function nextBoundary(r: SimResult, i: number): number {
  for (const b of boundaries(r)) if (b > i) return b
  return r.frames.length - 1
}

/** "Previous instruction": the start of the current instruction, or of the one before. */
export function prevBoundary(r: SimResult, i: number): number {
  const bs = boundaries(r)
  for (let k = bs.length - 1; k >= 0; k--) if (bs[k] < i) return bs[k]
  return 0
}

/** The movement instruction to describe at frame i (the one running, else the one that just ended). */
export function movementSpanAt(r: SimResult, i: number): Span | null {
  let running: Span | null = null
  let ended: Span | null = null
  for (const s of r.spans) {
    if (s.kind !== 'move' && s.kind !== 'turn') continue
    if (s.end === s.start) continue
    if (s.start <= i && i < s.end) running = !running || s.start >= running.start ? s : running
    else if (s.end <= i) ended = !ended || s.end >= ended.end ? s : ended
  }
  return running ?? ended
}

export interface Readout {
  /** total path of the robot centre since the start (mm) */
  movedMm: number
  /** net heading change since the start (degrees, right positive) */
  turnedDeg: number
  xMm: number
  yMm: number
  headingDeg: number
  timeS: number
  blocked: boolean
  /** current/last movement instruction */
  move: null | {
    text: string
    running: boolean
    commandedMm: number | null
    /** robot-centre distance covered in this instruction (mm) */
    actualMm: number
    remainingMm: number | null
    commandedDeg: number | null
    turnedDeg: number
    /** wheel travel in this instruction (mm) – differs from the centre distance when turning */
    wheelLMm: number
    wheelRMm: number
  }
}

export function readout(r: SimResult, i: number): Readout {
  const f: Frame = r.frames[Math.min(Math.max(0, i), r.frames.length - 1)]
  const f0 = r.frames[0]
  const span = movementSpanAt(r, i)
  let move: Readout['move'] = null
  if (span) {
    const a = r.frames[span.start]
    const b = r.frames[Math.min(i, span.end)]
    const actual = b.path - a.path
    move = {
      text: span.text,
      running: i < span.end,
      commandedMm: span.commandedMm ?? null,
      actualMm: actual,
      remainingMm: span.commandedMm !== undefined ? Math.max(0, span.commandedMm - actual) : null,
      commandedDeg: span.commandedDeg ?? null,
      turnedDeg: (b.h - a.h) / DEG,
      wheelLMm: b.wheelL - a.wheelL,
      wheelRMm: b.wheelR - a.wheelR,
    }
  }
  return {
    movedMm: f.path,
    turnedDeg: (f.h - f0.h) / DEG,
    xMm: f.x,
    yMm: f.y,
    headingDeg: f.h / DEG,
    timeS: f.t,
    blocked: f.blocked,
    move,
  }
}

/** How many whole major grid cells the robot centre crossed along its straight path. */
export function cellsCovered(distanceMm: number, majorMm: number): number {
  return distanceMm / majorMm
}

/** The checklist as it stood at a frame (stepping back un-ticks what was ticked later). */
export function tasksAt(r: SimResult, frame: number): TaskResult[] {
  const rows = r.tasks.map((t) => ({ ...t, met: false }))
  for (const c of r.taskChanges) {
    if (c.frame > frame) break
    rows[c.task].met = c.met
  }
  return rows
}

/** Everything is done, and at least one thing was something to do (not only "do not touch"). */
export function missionComplete(tasks: TaskResult[]): boolean {
  return tasks.length > 0 && tasks.every((t) => t.met) && tasks.some((t) => t.kind !== 'avoid')
}
