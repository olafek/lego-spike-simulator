// Block catalogue: the single description of every instruction SPIKE Lab understands.
// The editor, the validator, the recogniser normaliser and the interpreter all read from here.

export type Category = 'events' | 'movement' | 'motors' | 'control' | 'sensors' | 'variables' | 'light' | 'sound' | 'unsupported'

export type ParamKind = 'number' | 'enum' | 'ports' | 'text' | 'bool'

export interface ParamDef {
  name: string
  kind: ParamKind
  options?: readonly string[]
  /** labels shown to the child for enum options */
  optionLabels?: Record<string, string>
  default: number | string | boolean
  min?: number
  max?: number
  /** ports: allow more than one motor ("A+B") */
  multi?: boolean
  /** ports: exactly two (left+right) */
  pair?: boolean
}

export type SimSupport =
  | 'full' // deterministic kinematics
  | 'approx' // simulated with documented approximations
  | 'state' // changes state only (lights, sounds, variables)
  | 'none' // not simulated: surfaced, never faked

export interface BlockDef {
  op: string
  category: Category
  /** "move {direction} for {amount} {unit}" */
  template: string
  params: ParamDef[]
  container?: boolean
  hasElse?: boolean
  hasCondition?: boolean
  advanced?: boolean
  support: SimSupport
  help: string
}

export const PORTS = ['A', 'B', 'C', 'D', 'E', 'F'] as const
export type Port = (typeof PORTS)[number]

const MOVE_UNITS = ['cm', 'in', 'rotations', 'degrees', 'seconds'] as const
const MOTOR_UNITS = ['rotations', 'degrees', 'seconds'] as const
const MOVE_DIRS = ['forward', 'backward', 'left', 'right'] as const

const moveDirLabels = { forward: '↑ forward', backward: '↓ backward', left: '↺ spin left', right: '↻ spin right' }
const unitLabels = { cm: 'cm', in: 'inches', rotations: 'rotations', degrees: 'degrees', seconds: 'seconds' }
const rotLabels = { clockwise: '↻ clockwise', counterclockwise: '↺ counter-clockwise', shortest: 'shortest path' }

const num = (name: string, def: number, min?: number, max?: number): ParamDef => ({ name, kind: 'number', default: def, min, max })
const en = (name: string, options: readonly string[], def: string, optionLabels?: Record<string, string>): ParamDef => ({
  name,
  kind: 'enum',
  options,
  default: def,
  optionLabels,
})

export const BLOCKS: BlockDef[] = [
  // ---- movement -------------------------------------------------------------------------------
  {
    op: 'set_movement_motors',
    category: 'movement',
    template: 'set movement motors to {ports}',
    params: [{ name: 'ports', kind: 'ports', default: 'A+B', pair: true }],
    support: 'full',
    help: 'Tells the hub which two motors are the wheels: left wheel first, then right wheel.',
  },
  {
    op: 'set_movement_speed',
    category: 'movement',
    template: 'set movement speed to {speed} %',
    params: [num('speed', 50, -100, 100)],
    support: 'full',
    help: 'How fast the wheels turn when the robot moves. 100 % is full speed.',
  },
  {
    op: 'set_motor_rotation',
    category: 'movement',
    template: 'set 1 motor rotation to {amount} {unit} moved',
    params: [num('amount', 17.5, 0.1, 1000), en('unit', ['cm', 'in'], 'cm', unitLabels)],
    support: 'full',
    advanced: true,
    help: 'Tells the hub how far the robot rolls when a wheel turns once. It depends on the wheel size.',
  },
  {
    op: 'move_for',
    category: 'movement',
    template: 'move {direction} for {amount} {unit}',
    params: [en('direction', MOVE_DIRS, 'forward', moveDirLabels), num('amount', 10, 0, 10000), en('unit', MOVE_UNITS, 'cm', unitLabels)],
    support: 'full',
    help: 'Drives the robot. With cm it rolls that far. With rotations or degrees it counts how much the wheels turn.',
  },
  {
    op: 'move_steering_for',
    category: 'movement',
    template: 'move steering {steering} for {amount} {unit}',
    params: [num('steering', 30, -100, 100), num('amount', 10, 0, 10000), en('unit', MOVE_UNITS, 'cm', unitLabels)],
    support: 'full',
    help: 'Drives in a curve. 0 is straight, a positive number curves right, a negative number curves left. 100 spins on the spot.',
  },
  {
    op: 'move_tank_for',
    category: 'movement',
    template: 'move left {left} % right {right} % for {amount} {unit}',
    params: [num('left', 50, -100, 100), num('right', 50, -100, 100), num('amount', 10, 0, 10000), en('unit', MOVE_UNITS, 'cm', unitLabels)],
    support: 'full',
    advanced: true,
    help: 'Sets the speed of each wheel separately. Different speeds make the robot curve.',
  },
  {
    op: 'turn_for',
    category: 'movement',
    template: 'turn {direction} by {degrees} ° heading',
    params: [en('direction', ['left', 'right'], 'right', { left: '↺ left', right: '↻ right' }), num('degrees', 90, 0, 3600)],
    support: 'full',
    help: 'Spins the robot on the spot until it has turned this many degrees. This is the robot turning, not the wheels.',
  },
  {
    op: 'start_moving',
    category: 'movement',
    template: 'start moving {direction}',
    params: [en('direction', MOVE_DIRS, 'forward', moveDirLabels)],
    support: 'full',
    help: 'Starts driving and keeps going while the next blocks run. Use "stop moving" to stop.',
  },
  {
    op: 'start_steering',
    category: 'movement',
    template: 'start moving steering {steering}',
    params: [num('steering', 30, -100, 100)],
    support: 'full',
    help: 'Starts driving in a curve and keeps going while the next blocks run.',
  },
  {
    op: 'start_tank',
    category: 'movement',
    template: 'start moving left {left} % right {right} %',
    params: [num('left', 50, -100, 100), num('right', 50, -100, 100)],
    support: 'full',
    advanced: true,
    help: 'Starts each wheel at its own speed and keeps going while the next blocks run.',
  },
  { op: 'stop_moving', category: 'movement', template: 'stop moving', params: [], support: 'full', help: 'Stops both wheels.' },

  // ---- motors ---------------------------------------------------------------------------------
  {
    op: 'motor_run_for',
    category: 'motors',
    template: 'motor {ports} run {direction} for {amount} {unit}',
    params: [
      { name: 'ports', kind: 'ports', default: 'C', multi: true },
      en('direction', ['clockwise', 'counterclockwise'], 'clockwise', rotLabels),
      num('amount', 1, 0, 100000),
      en('unit', MOTOR_UNITS, 'rotations', unitLabels),
    ],
    support: 'full',
    help: 'Turns one motor. Degrees here mean how far the MOTOR turns, not how far the robot turns.',
  },
  {
    op: 'motor_go_to_position',
    category: 'motors',
    template: 'motor {ports} go {direction} to position {position}',
    params: [
      { name: 'ports', kind: 'ports', default: 'C', multi: true },
      en('direction', ['shortest', 'clockwise', 'counterclockwise'], 'shortest', rotLabels),
      num('position', 0, 0, 359),
    ],
    support: 'full',
    advanced: true,
    help: 'Turns the motor until its dial points at this position (0 to 359).',
  },
  {
    op: 'motor_start',
    category: 'motors',
    template: 'motor {ports} start {direction}',
    params: [{ name: 'ports', kind: 'ports', default: 'C', multi: true }, en('direction', ['clockwise', 'counterclockwise'], 'clockwise', rotLabels)],
    support: 'full',
    help: 'Starts a motor and keeps it running while the next blocks run.',
  },
  {
    op: 'motor_stop',
    category: 'motors',
    template: 'motor {ports} stop',
    params: [{ name: 'ports', kind: 'ports', default: 'C', multi: true }],
    support: 'full',
    help: 'Stops a motor.',
  },
  {
    op: 'motor_set_speed',
    category: 'motors',
    template: 'motor {ports} set speed to {speed} %',
    params: [{ name: 'ports', kind: 'ports', default: 'C', multi: true }, num('speed', 75, -100, 100)],
    support: 'full',
    help: 'How fast this motor turns the next time it runs.',
  },

  // ---- control --------------------------------------------------------------------------------
  { op: 'wait_seconds', category: 'control', template: 'wait {seconds} seconds', params: [num('seconds', 1, 0, 600)], support: 'full', help: 'Pauses the program. Motors that were started keep running.' },
  { op: 'wait_until', category: 'control', template: 'wait until {condition}', params: [], hasCondition: true, support: 'approx', help: 'Pauses until something becomes true, like a sensor seeing a colour.' },
  { op: 'repeat', category: 'control', template: 'repeat {times}', params: [num('times', 4, 0, 10000)], container: true, support: 'full', help: 'Runs the blocks inside this many times.' },
  { op: 'forever', category: 'control', template: 'forever', params: [], container: true, support: 'full', help: 'Runs the blocks inside again and again. SPIKE Lab stops it at the safety time limit.' },
  { op: 'repeat_until', category: 'control', template: 'repeat until {condition}', params: [], container: true, hasCondition: true, support: 'approx', help: 'Repeats the blocks inside until something becomes true.' },
  { op: 'if', category: 'control', template: 'if {condition} then', params: [], container: true, hasCondition: true, support: 'approx', help: 'Runs the blocks inside only when the condition is true.' },
  { op: 'if_else', category: 'control', template: 'if {condition} then', params: [], container: true, hasElse: true, hasCondition: true, support: 'approx', help: 'Runs the first group when true, otherwise the second group.' },
  {
    op: 'stop',
    category: 'control',
    template: 'stop {what}',
    params: [en('what', ['all', 'this_stack', 'other_stacks'], 'all', { all: 'all', this_stack: 'this stack', other_stacks: 'other stacks' })],
    support: 'full',
    help: 'Stops the program, this stack, or the other stacks.',
  },

  // ---- sensors / variables --------------------------------------------------------------------
  { op: 'reset_yaw', category: 'sensors', template: 'set yaw angle to 0', params: [], support: 'full', advanced: true, help: 'Tells the hub: the way I am facing now is 0 degrees.' },
  { op: 'reset_timer', category: 'sensors', template: 'reset timer', params: [], support: 'full', advanced: true, help: 'Sets the timer back to 0.' },
  { op: 'set_variable', category: 'variables', template: 'set {name} to {value}', params: [{ name: 'name', kind: 'text', default: 'my variable' }, num('value', 0)], support: 'state', advanced: true, help: 'Stores a number in a variable.' },
  { op: 'change_variable', category: 'variables', template: 'change {name} by {by}', params: [{ name: 'name', kind: 'text', default: 'my variable' }, num('by', 1)], support: 'state', advanced: true, help: 'Adds a number to a variable.' },

  // ---- light & sound (state only: they never move the robot) ------------------------------------
  { op: 'light_display', category: 'light', template: 'light matrix show {what}', params: [{ name: 'what', kind: 'text', default: 'smile' }], support: 'state', help: 'Shows a picture or text on the hub lights. It does not move the robot.' },
  { op: 'light_off', category: 'light', template: 'turn off light matrix', params: [], support: 'state', help: 'Turns the hub lights off.' },
  { op: 'sound_play', category: 'sound', template: 'play sound {name}', params: [{ name: 'name', kind: 'text', default: 'Cat Meow 1' }, { name: 'wait', kind: 'bool', default: false }], support: 'state', help: 'Plays a sound. SPIKE Lab only shows that a sound played.' },
  { op: 'sound_beep', category: 'sound', template: 'beep {note} for {seconds} seconds', params: [num('note', 60, 0, 130), num('seconds', 0.2, 0, 60)], support: 'state', help: 'Plays a beep and waits until it is over.' },

  // ---- unsupported ----------------------------------------------------------------------------
  { op: 'unsupported', category: 'unsupported', template: 'not supported yet', params: [], support: 'none', help: 'SPIKE Lab cannot run this block yet. It is skipped and flagged, never faked.' },
]

export const BLOCK_BY_OP: Record<string, BlockDef> = Object.fromEntries(BLOCKS.map((b) => [b.op, b]))

export const CATEGORY_STYLE: Record<Category, { label: string; color: string; ink: string }> = {
  events: { label: 'Events', color: '#f5c402', ink: '#3b2f00' },
  movement: { label: 'Movement', color: '#ff4ccd', ink: '#ffffff' },
  motors: { label: 'Motors', color: '#0090f5', ink: '#ffffff' },
  control: { label: 'Control', color: '#ffb515', ink: '#3b2a00' },
  sensors: { label: 'Sensors', color: '#34ccf1', ink: '#00303b' },
  variables: { label: 'Variables', color: '#ff9835', ink: '#3b1c00' },
  light: { label: 'Light', color: '#9b6af6', ink: '#ffffff' },
  sound: { label: 'Sound', color: '#c061f1', ink: '#ffffff' },
  unsupported: { label: 'Not supported', color: '#8a93a8', ink: '#ffffff' },
}

export const COLOR_NAMES = ['red', 'green', 'blue', 'yellow', 'black', 'white', 'violet', 'azure', 'none'] as const
export type ColorName = (typeof COLOR_NAMES)[number]

export const COLOR_HEX: Record<ColorName, string> = {
  red: '#e3242b',
  green: '#22a84a',
  blue: '#1f6feb',
  yellow: '#ffd23f',
  black: '#1b1f2a',
  white: '#f7f8fb',
  violet: '#8b3fd9',
  azure: '#4cc9f0',
  none: '#c8cedb',
}

/** Approximate reflected-light percentage per surface colour (documented approximation). */
export const COLOR_REFLECTION: Record<ColorName, number> = {
  red: 60,
  green: 35,
  blue: 25,
  yellow: 85,
  black: 5,
  white: 95,
  violet: 30,
  azure: 70,
  none: 0,
}
