// Suggest a robot from what the program uses. It is only ever a suggestion: the child confirms.

import { allBlocks, type Condition, type Program } from './ir'

export interface RobotSuggestion {
  robotId: string
  reason: string
  /** false = nothing in the program points at a robot; Driving Base 1 is a plain default */
  evidence: boolean
}

function conditionSensors(c: Condition | undefined, out: Set<string>): void {
  if (!c) return
  if (c.type === 'color' || c.type === 'reflection') out.add('color')
  else if (c.type === 'distance') out.add('distance')
  else if (c.type === 'force') out.add('force')
  else if (c.type === 'and' || c.type === 'or') {
    conditionSensors(c.a, out)
    conditionSensors(c.b, out)
  } else if (c.type === 'not') conditionSensors(c.a, out)
}

export function suggestRobot(program: Program): RobotSuggestion {
  const blocks = allBlocks({ ...program, stacks: program.stacks.filter((s) => s.hat?.op === 'when_program_starts') })
  const pair = blocks.find((b) => b.op === 'set_movement_motors')?.params.ports
  const motorPorts = new Set<string>()
  const sensors = new Set<string>()
  for (const b of blocks) {
    if (b.op.startsWith('motor_') && typeof b.params.ports === 'string') b.params.ports.split('+').forEach((p) => motorPorts.add(p))
    conditionSensors(b.condition, sensors)
  }

  if (pair === 'A+E') return { robotId: 'adb', reason: 'Your program drives motors A+E, like the Advanced Driving Base.', evidence: true }
  const base = pair === 'C+D'
  if (motorPorts.has('E') || sensors.has('distance')) {
    return { robotId: 'db2', reason: `Your program uses ${motorPorts.has('E') ? 'motor E' : 'a distance sensor'}, like Driving Base 2 with its arm and distance sensor.`, evidence: true }
  }
  if (sensors.has('color')) return { robotId: 'db3', reason: 'Your program uses a colour sensor, like Driving Base 3.', evidence: true }
  if (base) return { robotId: 'db1', reason: 'Your program drives motors C+D, like the Driving Base.', evidence: true }
  return { robotId: 'db1', reason: 'We could not tell which robot you built, so Driving Base 1 is selected. Change it if yours is different.', evidence: false }
}
