// SPIKE Lab intermediate representation (IR) v1.
// A strictly typed, JSON-serialisable description of a SPIKE word-block program.
// AI output is NEVER trusted: `normaliseRecognition` validates it and turns anything
// unreadable into an explicit `null` + `uncertain` flag for the child to fix.

import { z } from 'zod'
import { BLOCK_BY_OP, COLOR_NAMES, PORTS, type BlockDef, type ParamDef } from './catalog'

export const IR_VERSION = 1

export type Expr =
  | number
  | { type: 'var'; name: string }
  | { type: 'sensor'; sensor: 'distance' | 'reflection' | 'yaw' | 'timer' | 'motor_position' | 'motor_speed'; port?: string | null }
  | { type: 'op'; op: '+' | '-' | '*' | '/'; a: Expr; b: Expr }

export type Condition =
  | { type: 'color'; port: string | null; color: string | null }
  | { type: 'distance'; port: string | null; comparator: 'closer_than' | 'farther_than' | 'exactly'; value: Expr | null; unit: 'cm' | 'in' | '%' }
  | { type: 'force'; port: string | null; state: 'pressed' | 'hard_pressed' | 'released' }
  | { type: 'reflection'; port: string | null; comparator: '<' | '>' | '='; value: Expr | null }
  | { type: 'compare'; left: Expr | null; comparator: '<' | '>' | '='; right: Expr | null }
  | { type: 'and' | 'or'; a: Condition; b: Condition }
  | { type: 'not'; a: Condition }
  | { type: 'unknown'; text: string }

export type ParamValue = number | string | boolean | null | Exclude<Expr, number>

export interface Block {
  id: string
  op: string
  params: Record<string, ParamValue>
  condition?: Condition
  children?: Block[]
  elseChildren?: Block[]
  /** 0..1, how sure the recogniser was. 1 for blocks made or confirmed by the child. */
  confidence: number
  /** names of params (or "condition") that could not be read and must be confirmed */
  uncertain: string[]
  /** text as seen in the screenshot */
  text?: string
  /** index of the source screenshot */
  screenshot?: number
}

export interface Hat {
  op: 'when_program_starts' | 'other'
  text?: string
}

export interface Stack {
  id: string
  /** null = disconnected blocks: shown, never run */
  hat: Hat | null
  blocks: Block[]
}

export interface Program {
  irVersion: 1
  stacks: Stack[]
  notes: string[]
}

// ---------------------------------------------------------------------------------------------
// ids

let idCounter = 0
export function newId(prefix = 'b'): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
}

// ---------------------------------------------------------------------------------------------
// strict schema (stored projects, imports)

const ExprSchema: z.ZodType<Expr> = z.lazy(() =>
  z.union([
    z.number().finite(),
    z.object({ type: z.literal('var'), name: z.string().min(1).max(60) }),
    z.object({
      type: z.literal('sensor'),
      sensor: z.enum(['distance', 'reflection', 'yaw', 'timer', 'motor_position', 'motor_speed']),
      port: z.string().nullable().optional(),
    }),
    z.object({ type: z.literal('op'), op: z.enum(['+', '-', '*', '/']), a: ExprSchema, b: ExprSchema }),
  ]),
)

const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal('color'), port: z.string().nullable(), color: z.string().nullable() }),
    z.object({
      type: z.literal('distance'),
      port: z.string().nullable(),
      comparator: z.enum(['closer_than', 'farther_than', 'exactly']),
      value: ExprSchema.nullable(),
      unit: z.enum(['cm', 'in', '%']),
    }),
    z.object({ type: z.literal('force'), port: z.string().nullable(), state: z.enum(['pressed', 'hard_pressed', 'released']) }),
    z.object({ type: z.literal('reflection'), port: z.string().nullable(), comparator: z.enum(['<', '>', '=']), value: ExprSchema.nullable() }),
    z.object({ type: z.literal('compare'), left: ExprSchema.nullable(), comparator: z.enum(['<', '>', '=']), right: ExprSchema.nullable() }),
    z.object({ type: z.enum(['and', 'or']), a: ConditionSchema, b: ConditionSchema }),
    z.object({ type: z.literal('not'), a: ConditionSchema }),
    z.object({ type: z.literal('unknown'), text: z.string() }),
  ]),
)

const ParamValueSchema = z.union([z.number().finite(), z.string().max(200), z.boolean(), z.null(), ExprSchema])

const BlockSchema: z.ZodType<Block> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    op: z.string().min(1),
    params: z.record(z.string(), ParamValueSchema),
    condition: ConditionSchema.optional(),
    children: z.array(BlockSchema).optional(),
    elseChildren: z.array(BlockSchema).optional(),
    confidence: z.number().min(0).max(1),
    uncertain: z.array(z.string()),
    text: z.string().max(400).optional(),
    screenshot: z.number().int().min(0).optional(),
  }),
) as z.ZodType<Block>

export const ProgramSchema = z.object({
  irVersion: z.literal(1),
  stacks: z.array(
    z.object({
      id: z.string().min(1),
      hat: z.object({ op: z.enum(['when_program_starts', 'other']), text: z.string().optional() }).nullable(),
      blocks: z.array(BlockSchema),
    }),
  ),
  notes: z.array(z.string()),
})

export function parseProgram(value: unknown): Program {
  return ProgramSchema.parse(value) as Program
}

// ---------------------------------------------------------------------------------------------
// recognition normaliser (lenient in, strict out)

export class RecognitionError extends Error {
  constructor(
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message)
    this.name = 'RecognitionError'
  }
}

export interface NormaliseResult {
  program: Program
  /** human-readable schema problems that were repaired into review flags */
  issues: string[]
}

const RawTop = z.object({
  stacks: z.array(z.object({ hat: z.unknown().optional(), blocks: z.array(z.unknown()).optional() })),
  notes: z.array(z.unknown()).optional(),
})

const ENUM_ALIASES: Record<string, string> = {
  up: 'forward',
  forwards: 'forward',
  straight: 'forward',
  down: 'backward',
  backwards: 'backward',
  back: 'backward',
  reverse: 'backward',
  'counter-clockwise': 'counterclockwise',
  'counter clockwise': 'counterclockwise',
  anticlockwise: 'counterclockwise',
  'anti-clockwise': 'counterclockwise',
  ccw: 'counterclockwise',
  cw: 'clockwise',
  inches: 'in',
  inch: 'in',
  centimeters: 'cm',
  centimetres: 'cm',
  rotation: 'rotations',
  degree: 'degrees',
  second: 'seconds',
  sec: 'seconds',
  'shortest path': 'shortest',
  'this stack': 'this_stack',
  'other stacks': 'other_stacks',
  'other stacks in sprite': 'other_stacks',
}

export function normalisePorts(value: unknown, def: Pick<ParamDef, 'multi' | 'pair'>): string | null {
  let letters: string[]
  if (Array.isArray(value)) letters = value.map((v) => String(v).trim().toUpperCase())
  else if (typeof value === 'string') letters = value.toUpperCase().split(/[^A-Z]+|(?=[A-Z])/).filter(Boolean)
  else return null
  if (letters.length === 0 || letters.some((l) => !(PORTS as readonly string[]).includes(l))) return null
  if (new Set(letters).size !== letters.length) return null
  if (def.pair && letters.length !== 2) return null
  if (!def.pair && !def.multi && letters.length !== 1) return null
  return letters.join('+')
}

function normaliseExpr(value: unknown, depth = 0): Expr | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const t = value.trim().replace(',', '.')
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
    return null
  }
  if (!value || typeof value !== 'object' || depth > 6) return null
  const v = value as Record<string, unknown>
  if (v.type === 'var' && typeof v.name === 'string' && v.name.trim()) return { type: 'var', name: v.name.trim().slice(0, 60) }
  if (v.type === 'sensor' && typeof v.sensor === 'string') {
    const sensors = ['distance', 'reflection', 'yaw', 'timer', 'motor_position', 'motor_speed'] as const
    const s = sensors.find((x) => x === v.sensor)
    if (!s) return null
    const port = v.port == null ? null : normalisePorts(v.port, {})
    return { type: 'sensor', sensor: s, port }
  }
  if (v.type === 'op' && typeof v.op === 'string' && ['+', '-', '*', '/'].includes(v.op)) {
    const a = normaliseExpr(v.a, depth + 1)
    const b = normaliseExpr(v.b, depth + 1)
    if (a === null || b === null) return null
    return { type: 'op', op: v.op as '+' | '-' | '*' | '/', a, b }
  }
  return null
}

function normaliseCondition(value: unknown, depth = 0): Condition {
  const unknown = (): Condition => ({ type: 'unknown', text: typeof value === 'string' ? value : JSON.stringify(value ?? null).slice(0, 200) })
  if (!value || typeof value !== 'object' || depth > 6) return unknown()
  const v = value as Record<string, unknown>
  const port = v.port == null ? null : normalisePorts(v.port, {})
  const cmp = (c: unknown): '<' | '>' | '=' | null => (c === '<' || c === '>' || c === '=' ? c : null)
  switch (v.type) {
    case 'color': {
      const color = typeof v.color === 'string' && (COLOR_NAMES as readonly string[]).includes(v.color.toLowerCase()) ? v.color.toLowerCase() : null
      return { type: 'color', port, color }
    }
    case 'distance': {
      const comparator = v.comparator === 'closer_than' || v.comparator === 'farther_than' || v.comparator === 'exactly' ? v.comparator : null
      const unit = v.unit === 'cm' || v.unit === 'in' || v.unit === '%' ? v.unit : null
      if (!comparator || !unit) return unknown()
      return { type: 'distance', port, comparator, value: normaliseExpr(v.value), unit }
    }
    case 'force': {
      const state = v.state === 'pressed' || v.state === 'hard_pressed' || v.state === 'released' ? v.state : null
      if (!state) return unknown()
      return { type: 'force', port, state }
    }
    case 'reflection': {
      const comparator = cmp(v.comparator)
      if (!comparator) return unknown()
      return { type: 'reflection', port, comparator, value: normaliseExpr(v.value) }
    }
    case 'compare': {
      const comparator = cmp(v.comparator)
      if (!comparator) return unknown()
      return { type: 'compare', left: normaliseExpr(v.left), comparator, right: normaliseExpr(v.right) }
    }
    case 'and':
    case 'or':
      return { type: v.type, a: normaliseCondition(v.a, depth + 1), b: normaliseCondition(v.b, depth + 1) }
    case 'not':
      return { type: 'not', a: normaliseCondition(v.a, depth + 1) }
    case 'unknown':
      return { type: 'unknown', text: typeof v.text === 'string' ? v.text.slice(0, 200) : '' }
    default:
      return unknown()
  }
}

/** true when the condition still contains something the child must fill in */
export function conditionIncomplete(c: Condition | undefined): boolean {
  if (!c) return true
  switch (c.type) {
    case 'unknown':
      return true
    case 'color':
      return c.port === null || c.color === null
    case 'distance':
    case 'reflection':
      return c.port === null || c.value === null
    case 'force':
      return c.port === null
    case 'compare':
      return c.left === null || c.right === null
    case 'and':
    case 'or':
      return conditionIncomplete(c.a) || conditionIncomplete(c.b)
    case 'not':
      return conditionIncomplete(c.a)
  }
}

function normaliseParam(def: ParamDef, raw: unknown): ParamValue {
  switch (def.kind) {
    case 'number': {
      const e = normaliseExpr(raw)
      return e
    }
    case 'enum': {
      if (typeof raw !== 'string') return null
      let s = raw.trim().toLowerCase()
      s = ENUM_ALIASES[s] ?? s
      return def.options!.includes(s) ? s : null
    }
    case 'ports':
      return normalisePorts(raw, def)
    case 'text':
      return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 120) : typeof raw === 'number' ? String(raw) : null
    case 'bool':
      return typeof raw === 'boolean' ? raw : (def.default as boolean)
  }
}

function normaliseBlock(raw: unknown, issues: string[], path: string, depth: number): Block {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const text = typeof r.text === 'string' ? r.text.slice(0, 400) : undefined
  const rawOp = typeof r.op === 'string' ? r.op.trim().toLowerCase() : ''
  let def: BlockDef | undefined = BLOCK_BY_OP[rawOp]
  const uncertain = new Set<string>(Array.isArray(r.uncertain) ? r.uncertain.filter((u): u is string => typeof u === 'string') : [])

  if (!def || depth > 8) {
    if (rawOp && rawOp !== 'unsupported') issues.push(`${path}: unknown block "${rawOp}" was marked as not supported.`)
    def = BLOCK_BY_OP.unsupported
    return {
      id: newId(),
      op: 'unsupported',
      params: {},
      confidence: 0,
      uncertain: [],
      text: text ?? (rawOp ? rawOp : 'unreadable block'),
      screenshot: typeof r.screenshot === 'number' ? Math.max(0, Math.floor(r.screenshot)) : undefined,
    }
  }

  const rawParams = (r.params && typeof r.params === 'object' ? r.params : {}) as Record<string, unknown>
  const params: Record<string, ParamValue> = {}
  for (const p of def.params) {
    const value = normaliseParam(p, rawParams[p.name])
    params[p.name] = value
    if (value === null) {
      uncertain.add(p.name)
      if (rawParams[p.name] != null) issues.push(`${path}: could not understand ${p.name} = ${JSON.stringify(rawParams[p.name]).slice(0, 60)}.`)
    } else if (p.kind === 'number' && typeof value === 'number') {
      if ((p.min !== undefined && value < p.min) || (p.max !== undefined && value > p.max)) {
        // out-of-range numbers are kept (the child sees exactly what was read) but must be confirmed
        uncertain.add(p.name)
        issues.push(`${path}: ${p.name} = ${value} is outside ${p.min}..${p.max}.`)
      }
    }
  }
  // drop "uncertain" entries that do not name a real param
  for (const u of [...uncertain]) if (u !== 'condition' && !def.params.some((p) => p.name === u)) uncertain.delete(u)

  const block: Block = {
    id: newId(),
    op: def.op,
    params,
    confidence: 0.5,
    uncertain: [],
    text,
    screenshot: typeof r.screenshot === 'number' ? Math.max(0, Math.floor(r.screenshot)) : undefined,
  }
  if (def.hasCondition) {
    block.condition = normaliseCondition(r.condition)
    if (conditionIncomplete(block.condition)) uncertain.add('condition')
  }
  if (def.container) {
    block.children = Array.isArray(r.children) ? r.children.map((c, i) => normaliseBlock(c, issues, `${path} > ${i + 1}`, depth + 1)) : []
    if (def.hasElse) {
      block.elseChildren = Array.isArray(r.elseChildren) ? r.elseChildren.map((c, i) => normaliseBlock(c, issues, `${path} > else ${i + 1}`, depth + 1)) : []
    }
  }
  let confidence = typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? Math.min(1, Math.max(0, r.confidence)) : 0.5
  if (uncertain.size > 0) confidence = Math.min(confidence, 0.5)
  block.confidence = confidence
  block.uncertain = [...uncertain]
  return block
}

/**
 * Validate raw recogniser output and convert it into a Program.
 * Throws RecognitionError when the overall shape is wrong; repairs block-level problems
 * into `uncertain` flags so nothing is silently guessed.
 */
export function normaliseRecognition(raw: unknown): NormaliseResult {
  const top = RawTop.safeParse(raw)
  if (!top.success) {
    throw new RecognitionError(
      'The recognition result did not have the expected shape.',
      top.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    )
  }
  const issues: string[] = []
  const stacks: Stack[] = top.data.stacks.map((s, si) => {
    let hat: Hat | null = null
    if (s.hat && typeof s.hat === 'object') {
      const h = s.hat as Record<string, unknown>
      hat = h.op === 'when_program_starts' ? { op: 'when_program_starts' } : { op: 'other', text: typeof h.text === 'string' ? h.text.slice(0, 200) : 'other event' }
    }
    return {
      id: newId('s'),
      hat,
      blocks: (s.blocks ?? []).map((b, bi) => normaliseBlock(b, issues, `stack ${si + 1}, block ${bi + 1}`, 0)),
    }
  })
  const program: Program = {
    irVersion: 1,
    stacks,
    notes: (top.data.notes ?? []).filter((n): n is string => typeof n === 'string').map((n) => n.slice(0, 300)),
  }
  return { program: parseProgram(program), issues }
}

// ---------------------------------------------------------------------------------------------
// helpers used by the editor and the simulator

export const REVIEW_CONFIDENCE = 0.7

export function blockNeedsReview(b: Block): boolean {
  return b.uncertain.length > 0 || b.confidence < REVIEW_CONFIDENCE
}

export function walkBlocks(blocks: Block[], fn: (b: Block, parent: Block | null) => void, parent: Block | null = null): void {
  for (const b of blocks) {
    fn(b, parent)
    if (b.children) walkBlocks(b.children, fn, b)
    if (b.elseChildren) walkBlocks(b.elseChildren, fn, b)
  }
}

export function allBlocks(program: Program): Block[] {
  const out: Block[] = []
  for (const s of program.stacks) walkBlocks(s.blocks, (b) => out.push(b))
  return out
}

export interface ProgramProblem {
  blockId: string
  message: string
  /** 'error' blocks Play; 'warning' is informational */
  level: 'error' | 'warning'
}

/** Problems that must be fixed before the program can be simulated honestly. */
export function programProblems(program: Program): ProgramProblem[] {
  const out: ProgramProblem[] = []
  for (const s of program.stacks) {
    if (!s.hat || s.hat.op !== 'when_program_starts') continue // not run
    walkBlocks(s.blocks, (b) => {
      const def = BLOCK_BY_OP[b.op]
      if (!def) return
      if (b.op === 'unsupported') {
        out.push({ blockId: b.id, level: 'warning', message: 'This block is not supported yet and will be skipped.' })
        return
      }
      for (const p of def.params) {
        if (b.params[p.name] === null || b.params[p.name] === undefined) {
          out.push({ blockId: b.id, level: 'error', message: `Fill in "${p.name}" – it could not be read.` })
        }
      }
      if (def.hasCondition && conditionIncomplete(b.condition)) {
        out.push({ blockId: b.id, level: 'error', message: 'Finish the condition – part of it could not be read.' })
      }
    })
  }
  return out
}

export function makeBlock(op: string): Block {
  const def = BLOCK_BY_OP[op]
  if (!def) throw new Error(`Unknown block ${op}`)
  const params: Record<string, ParamValue> = {}
  for (const p of def.params) params[p.name] = p.default
  const b: Block = { id: newId(), op, params, confidence: 1, uncertain: [] }
  if (def.hasCondition) b.condition = { type: 'compare', left: { type: 'sensor', sensor: 'timer' }, comparator: '>', right: 1 }
  if (def.container) b.children = []
  if (def.hasElse) b.elseChildren = []
  return b
}

export function cloneBlock(b: Block): Block {
  const copy: Block = JSON.parse(JSON.stringify(b))
  const reId = (x: Block) => {
    x.id = newId()
    x.children?.forEach(reId)
    x.elseChildren?.forEach(reId)
  }
  reId(copy)
  return copy
}

export function emptyProgram(): Program {
  return { irVersion: 1, stacks: [{ id: newId('s'), hat: { op: 'when_program_starts' }, blocks: [] }], notes: [] }
}

/** Plain-English one-liner for a block (logs, explanations, AI context). */
export function blockText(b: Block): string {
  const def = BLOCK_BY_OP[b.op]
  if (!def) return b.op
  if (b.op === 'unsupported') return `(not supported) ${b.text ?? ''}`.trim()
  return def.template.replace(/\{(\w+)\}/g, (_, name: string) => {
    if (name === 'condition') return conditionText(b.condition)
    const v = b.params[name]
    return v === null || v === undefined ? '?' : exprText(v as Expr | string | boolean)
  })
}

export function exprText(e: Expr | string | boolean | null): string {
  if (e === null) return '?'
  if (typeof e === 'number' || typeof e === 'string' || typeof e === 'boolean') return String(e)
  if (e.type === 'var') return e.name
  if (e.type === 'sensor') return `${e.sensor.replace('_', ' ')}${e.port ? ` ${e.port}` : ''}`
  return `(${exprText(e.a)} ${e.op} ${exprText(e.b)})`
}

export function conditionText(c: Condition | undefined): string {
  if (!c) return '?'
  switch (c.type) {
    case 'color':
      return `colour sensor ${c.port ?? '?'} sees ${c.color ?? '?'}`
    case 'distance':
      return `distance sensor ${c.port ?? '?'} is ${c.comparator.replace('_', ' ')} ${exprText(c.value)} ${c.unit}`
    case 'force':
      return `force sensor ${c.port ?? '?'} is ${c.state.replace('_', ' ')}`
    case 'reflection':
      return `reflected light ${c.port ?? '?'} ${c.comparator} ${exprText(c.value)} %`
    case 'compare':
      return `${exprText(c.left)} ${c.comparator} ${exprText(c.right)}`
    case 'and':
    case 'or':
      return `${conditionText(c.a)} ${c.type} ${conditionText(c.b)}`
    case 'not':
      return `not (${conditionText(c.a)})`
    case 'unknown':
      return `? ${c.text}`
  }
}

export function programText(program: Program): string {
  const lines: string[] = []
  const emit = (blocks: Block[], indent: number) => {
    for (const b of blocks) {
      lines.push(`${'  '.repeat(indent)}${blockText(b)}`)
      if (b.children) emit(b.children, indent + 1)
      if (b.elseChildren) {
        lines.push(`${'  '.repeat(indent)}else`)
        emit(b.elseChildren, indent + 1)
      }
    }
  }
  for (const s of program.stacks) {
    lines.push(s.hat ? (s.hat.op === 'when_program_starts' ? 'when program starts' : `(${s.hat.text ?? 'other event'})`) : '(not connected)')
    emit(s.blocks, 1)
  }
  return lines.join('\n')
}
