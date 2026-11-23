// The open project: document, screenshots, simulation result and playback cursor.

import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { api, ApiError, type ScreenshotInfo } from '@/lib/api'
import { rememberProject } from '@/lib/recent'
import { BLOCK_BY_OP } from '@/core/catalog'
import { cloneBlock, makeBlock, newId, normaliseRecognition, programProblems, RecognitionError, type Block, type ParamValue, type Program } from '@/core/ir'
import { newProjectData, parseProjectData, type ProjectData } from '@/core/project'
import { resolveRobot, ROBOT_BY_ID } from '@/core/robots'
import { simulate, type SimResult } from '@/core/simulate'
import { nextBoundary, prevBoundary, readout } from '@/core/timeline'

export { SPEEDS } from '@/lib/speed'

function findList(program: Program, blockId: string): { list: Block[]; index: number } | null {
  const search = (list: Block[]): { list: Block[]; index: number } | null => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === blockId) return { list, index: i }
      const inner = (list[i].children && search(list[i].children!)) || (list[i].elseChildren && search(list[i].elseChildren!))
      if (inner) return inner
    }
    return null
  }
  for (const s of program.stacks) {
    const hit = search(s.blocks)
    if (hit) return hit
  }
  return null
}

export const useLab = defineStore('lab', () => {
  const id = ref<string | null>(null)
  const name = ref('')
  const data = ref<ProjectData | null>(null)
  const screenshots = ref<ScreenshotInfo[]>([])
  const loading = ref(false)
  const loadError = ref<string | null>(null)
  const saveState = ref<'saved' | 'saving' | 'error'>('saved')
  const saveText = computed(() => (saveState.value === 'saved' ? '✓ saved' : saveState.value === 'saving' ? 'saving…' : '⚠️ not saved'))

  const result = shallowRef<SimResult | null>(null)
  const cursor = ref(0) // fractional frame index
  const playing = ref(false)
  const selectedBlockId = ref<string | null>(null)
  const runCount = ref(0)

  const recognising = ref(false)
  const recogniseError = ref<{ message: string; details: string[] } | null>(null)

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let raf = 0
  let lastTs = 0

  const frameIndex = computed(() => (result.value ? Math.min(result.value.frames.length - 1, Math.max(0, Math.floor(cursor.value))) : 0))
  const frame = computed(() => result.value?.frames[frameIndex.value] ?? null)
  const lastFrame = computed(() => (result.value ? result.value.frames.length - 1 : 0))
  const atEnd = computed(() => frameIndex.value >= lastFrame.value)
  const robot = computed(() => (data.value ? resolveRobot(data.value.robotId, data.value.overrides) : ROBOT_BY_ID.db1))
  const problems = computed(() => (data.value ? programProblems(data.value.program) : []))
  const errorCount = computed(() => new Set(problems.value.filter((p) => p.level === 'error').map((p) => p.blockId)).size)
  const measures = computed(() => (result.value ? readout(result.value, frameIndex.value) : null))
  const activeBlocks = computed(() => new Set(frame.value?.active ?? []))

  // ---- loading & saving -------------------------------------------------------------------

  function reset(): void {
    pause()
    id.value = null
    name.value = ''
    data.value = null
    screenshots.value = []
    result.value = null
    cursor.value = 0
    selectedBlockId.value = null
    recogniseError.value = null
    loadError.value = null
  }

  async function load(projectId: string): Promise<void> {
    if (id.value === projectId && data.value) return
    reset()
    loading.value = true
    try {
      const rec = await api.project(projectId)
      id.value = rec.id
      name.value = rec.name
      screenshots.value = [...rec.screenshots].sort((a, b) => a.position - b.position)
      try {
        data.value = rec.data ? parseProjectData(rec.data) : newProjectData()
      } catch {
        loadError.value = 'This project was saved in a format SPIKE Lab cannot read. A fresh program was started; your screenshots are still here.'
        data.value = newProjectData()
      }
      rememberProject(rec.id)
      resimulate(false)
    } catch (e) {
      loadError.value = e instanceof ApiError ? e.message : 'This project could not be opened.'
    } finally {
      loading.value = false
    }
  }

  function scheduleSave(): void {
    if (!id.value || !data.value) return
    saveState.value = 'saving'
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void saveNow(), 700)
  }

  async function saveNow(): Promise<void> {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    if (!id.value || !data.value) return
    saveState.value = 'saving'
    try {
      await api.updateProject(id.value, { name: name.value, data: data.value })
      if (!saveTimer) saveState.value = 'saved'
    } catch {
      saveState.value = 'error'
    }
  }

  /** Change the project document. `sim` = the change affects the simulation. */
  function change(fn: (d: ProjectData) => void, sim = true): void {
    if (!data.value) return
    fn(data.value)
    if (sim) resimulate(false)
    scheduleSave()
  }

  function rename(value: string): void {
    name.value = value.slice(0, 80)
    scheduleSave()
  }

  // ---- simulation & playback --------------------------------------------------------------

  function resimulate(autoplay: boolean): void {
    pause()
    if (!data.value) return
    const d = data.value
    result.value = simulate({
      program: JSON.parse(JSON.stringify(d.program)),
      robot: robot.value,
      attachments: JSON.parse(JSON.stringify(d.attachments)),
      scene: JSON.parse(JSON.stringify(d.scene)),
      options: { calibration: d.settings.calibration, slip: d.settings.slip, maxSeconds: d.settings.maxSeconds },
    })
    cursor.value = 0
    runCount.value += 1
    if (autoplay) play()
  }

  function tick(ts: number): void {
    if (!playing.value || !result.value || !data.value) return
    const elapsed = Math.min(0.1, (ts - lastTs) / 1000)
    lastTs = ts
    cursor.value += (elapsed / result.value.dt) * data.value.settings.speed
    if (cursor.value >= lastFrame.value) {
      cursor.value = lastFrame.value
      playing.value = false
      return
    }
    raf = requestAnimationFrame(tick)
  }

  function play(): void {
    if (!result.value || result.value.frames.length < 2) return
    if (atEnd.value) cursor.value = 0
    playing.value = true
    lastTs = performance.now()
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(tick)
  }

  function pause(): void {
    playing.value = false
    cancelAnimationFrame(raf)
  }

  function toggle(): void {
    if (playing.value) pause()
    else play()
  }

  function seek(index: number): void {
    pause()
    cursor.value = Math.min(lastFrame.value, Math.max(0, index))
  }

  function resetRun(): void {
    seek(0)
  }

  function stepNext(): void {
    if (result.value) seek(nextBoundary(result.value, frameIndex.value))
  }

  function stepPrev(): void {
    if (result.value) seek(prevBoundary(result.value, frameIndex.value))
  }

  function setSpeed(speed: number): void {
    change((d) => (d.settings.speed = speed), false)
  }

  // ---- program editing --------------------------------------------------------------------

  function setParam(blockId: string, param: string, value: ParamValue): void {
    change((d) => {
      const hit = findList(d.program, blockId)
      if (!hit) return
      const b = hit.list[hit.index]
      b.params[param] = value
      if (value !== null) b.uncertain = b.uncertain.filter((u) => u !== param)
      if (b.uncertain.length === 0) b.confidence = 1
    })
  }

  function setCondition(blockId: string, condition: Block['condition']): void {
    change((d) => {
      const hit = findList(d.program, blockId)
      if (!hit) return
      const b = hit.list[hit.index]
      b.condition = condition
      b.uncertain = b.uncertain.filter((u) => u !== 'condition')
      if (b.uncertain.length === 0) b.confidence = 1
    })
  }

  /** The child looked at a low-confidence block and says it is right. */
  function confirmBlock(blockId: string): void {
    change((d) => {
      const hit = findList(d.program, blockId)
      if (!hit) return
      const b = hit.list[hit.index]
      const def = BLOCK_BY_OP[b.op]
      // only values that actually exist can be confirmed; missing ones stay flagged
      b.uncertain = b.uncertain.filter((u) => (u === 'condition' ? true : b.params[u] === null || b.params[u] === undefined) && def)
      if (b.uncertain.length === 0) b.confidence = 1
    })
  }

  function moveBlock(blockId: string, delta: -1 | 1): void {
    change((d) => {
      const hit = findList(d.program, blockId)
      if (!hit) return
      const to = hit.index + delta
      if (to < 0 || to >= hit.list.length) return
      const [b] = hit.list.splice(hit.index, 1)
      hit.list.splice(to, 0, b)
    })
  }

  function removeBlock(blockId: string): void {
    change((d) => {
      const hit = findList(d.program, blockId)
      if (hit) hit.list.splice(hit.index, 1)
    })
    if (selectedBlockId.value === blockId) selectedBlockId.value = null
  }

  function duplicateBlock(blockId: string): void {
    change((d) => {
      const hit = findList(d.program, blockId)
      if (!hit) return
      const copy = cloneBlock(hit.list[hit.index])
      hit.list.splice(hit.index + 1, 0, copy)
      selectedBlockId.value = copy.id
    })
  }

  /** Add a new block after `afterId`, or at the end of a list (stack or container). */
  function addBlock(op: string, target: { afterId?: string; stackId?: string; parentId?: string; branch?: 'children' | 'elseChildren' }): void {
    change((d) => {
      const b = makeBlock(op)
      // new movement blocks follow the robot the child picked
      if (op === 'set_movement_motors') b.params.ports = `${robot.value.drive.left.port}+${robot.value.drive.right.port}`
      if (target.afterId) {
        const hit = findList(d.program, target.afterId)
        if (hit) hit.list.splice(hit.index + 1, 0, b)
      } else if (target.parentId) {
        const hit = findList(d.program, target.parentId)
        const parent = hit?.list[hit.index]
        if (parent) (parent[target.branch ?? 'children'] ??= []).push(b)
      } else {
        const stack = d.program.stacks.find((s) => s.id === target.stackId) ?? d.program.stacks.find((s) => s.hat?.op === 'when_program_starts')
        if (stack) stack.blocks.push(b)
        else d.program.stacks.unshift({ id: newId('s'), hat: { op: 'when_program_starts' }, blocks: [b] })
      }
      selectedBlockId.value = b.id
    })
  }

  /** Connect a loose stack (give it a "when program starts" hat) or remove it. */
  function connectStack(stackId: string): void {
    change((d) => {
      const s = d.program.stacks.find((x) => x.id === stackId)
      if (s) s.hat = { op: 'when_program_starts' }
    })
  }

  function removeStack(stackId: string): void {
    change((d) => {
      d.program.stacks = d.program.stacks.filter((s) => s.id !== stackId)
    })
  }

  function addStack(): void {
    change((d) => {
      d.program.stacks.push({ id: newId('s'), hat: { op: 'when_program_starts' }, blocks: [] })
    })
  }

  /** Throw away the child's edits and go back to what was recognised from the screenshot. */
  function restoreOriginal(): void {
    change((d) => {
      if (d.original) d.program = JSON.parse(JSON.stringify(d.original))
    })
  }

  // ---- screenshots & recognition ----------------------------------------------------------

  async function uploadScreenshot(file: Blob, fileName: string, replaces?: string): Promise<ScreenshotInfo> {
    if (!id.value) throw new Error('No project')
    const shot = await api.uploadScreenshot(id.value, file, fileName, replaces)
    if (replaces) screenshots.value = screenshots.value.map((s) => (s.id === replaces ? shot : s))
    else screenshots.value = [...screenshots.value, shot]
    return shot
  }

  async function deleteScreenshot(sid: string): Promise<void> {
    if (!id.value) return
    await api.deleteScreenshot(id.value, sid)
    screenshots.value = screenshots.value.filter((s) => s.id !== sid)
  }

  async function moveScreenshot(sid: string, delta: -1 | 1): Promise<void> {
    if (!id.value) return
    const list = [...screenshots.value]
    const i = list.findIndex((s) => s.id === sid)
    const j = i + delta
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    screenshots.value = list
    screenshots.value = await api.orderScreenshots(
      id.value,
      list.map((s) => s.id),
    )
  }

  /** Send the screenshots to the recogniser and replace the program with the validated result. */
  async function recognise(): Promise<boolean> {
    if (!id.value || !data.value || recognising.value) return false
    recognising.value = true
    recogniseError.value = null
    try {
      const res = await api.recognise(id.value)
      const { program, issues } = normaliseRecognition(res.raw)
      if (program.stacks.every((s) => s.blocks.length === 0)) {
        recogniseError.value = { message: 'We could not find any SPIKE blocks in that picture. Try a clearer screenshot of your program, or build it by hand.', details: program.notes }
        return false
      }
      change((d) => {
        d.program = program
        d.original = JSON.parse(JSON.stringify(program))
        d.recognition = { driver: res.driver, model: res.model, at: new Date().toISOString(), issues }
        d.step = 'check'
      })
      await saveNow()
      return true
    } catch (e) {
      if (e instanceof RecognitionError) recogniseError.value = { message: 'The answer from the picture reader was muddled, so nothing was changed. Please try again.', details: e.details }
      else if (e instanceof ApiError) recogniseError.value = { message: e.message, details: e.retryAfter ? [`Try again in about ${Math.ceil(e.retryAfter / 60)} minute(s).`] : [] }
      else recogniseError.value = { message: 'Something went wrong while reading the picture. Please try again.', details: [] }
      return false
    } finally {
      recognising.value = false
    }
  }

  return {
    id,
    name,
    data,
    screenshots,
    loading,
    loadError,
    saveState,
    saveText,
    result,
    cursor,
    playing,
    selectedBlockId,
    runCount,
    recognising,
    recogniseError,
    frameIndex,
    frame,
    lastFrame,
    atEnd,
    robot,
    problems,
    errorCount,
    measures,
    activeBlocks,
    reset,
    load,
    saveNow,
    change,
    rename,
    resimulate,
    play,
    pause,
    toggle,
    seek,
    resetRun,
    stepNext,
    stepPrev,
    setSpeed,
    setParam,
    setCondition,
    confirmBlock,
    moveBlock,
    removeBlock,
    duplicateBlock,
    addBlock,
    connectStack,
    removeStack,
    addStack,
    restoreOriginal,
    uploadScreenshot,
    deleteScreenshot,
    moveScreenshot,
    recognise,
  }
})
