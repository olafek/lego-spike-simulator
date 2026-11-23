<script setup lang="ts">
// Mission mat editor: a top-down, exactly-scaled SVG of the floor where the child places the
// robot start, objects and an optional goal. Everything here is optional for basic driving.

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { COLOR_HEX, type ColorName } from '@/core/catalog'
import { toolRects } from '@/core/attachmentGeometry'
import { toWorld } from '@/core/geometry'
import { MISSION_PRESETS, type MissionPreset } from '@/core/missionPresets'
import { ATTACHMENTS } from '@/core/robots'
import { emptyScene, goalText, makeObject, OBJECT_DEFS, objectSize, snap, type ObjectType, type Scene, type SceneObject } from '@/core/scene'
import { parseSceneProposal, SceneProposalError, type SceneProposal } from '@/core/sceneProposal'
import { setMat } from '@/core/project'
import { matBounds } from '@/core/scene'
import { DEG, MM_PER_INCH, mmToDisplay, round } from '@/core/units'
import { api, ApiError } from '@/lib/api'
import { useLab } from '@/stores/lab'
import { useSession } from '@/stores/session'
import MatPicturePanel from './MatPicturePanel.vue'

const lab = useLab()
const session = useSession()

const MAX_OBJECTS = 40
const SWATCHES: ColorName[] = ['red', 'green', 'blue', 'yellow', 'black', 'white', 'violet', 'azure']
const PALETTE = Object.values(OBJECT_DEFS)

const scene = computed<Scene | null>(() => lab.data?.scene ?? null)
const settings = computed(() => lab.data?.settings ?? null)
const unit = computed(() => settings.value?.unit ?? 'cm')
const snapStep = computed(() => (unit.value === 'cm' ? 10 : MM_PER_INCH / 2))

// ---- view -----------------------------------------------------------------------------------

const wrap = ref<HTMLDivElement | null>(null)
const svg = ref<SVGSVGElement | null>(null)
const size = ref({ w: 800, h: 600 })
const view = ref({ cx: 0, cy: 350, w: 1700 }) // world mm: centre + visible width
let observer: ResizeObserver | null = null

const viewH = computed(() => (view.value.w * size.value.h) / Math.max(1, size.value.w))
const x0 = computed(() => view.value.cx - view.value.w / 2)
const y0 = computed(() => view.value.cy - viewH.value / 2)
const y1 = computed(() => view.value.cy + viewH.value / 2)
const pxPerMm = computed(() => size.value.w / view.value.w)
const viewBox = computed(() => `${x0.value} ${-y1.value} ${view.value.w} ${viewH.value}`)
/** world length of n screen pixels */
const px = (n: number) => n / pxPerMm.value

function contentBounds(): { x0: number; x1: number; y0: number; y1: number } {
  const s = scene.value
  if (!s) return { x0: -800, x1: 800, y0: -250, y1: 950 }
  const b = matBounds(s.mat)
  if (b) {
    return { x0: b.x0 - 60, x1: b.x1 + 60, y0: b.y0 - 60, y1: b.y1 + 60 }
  }
  let bx0 = s.start.x - 200
  let bx1 = s.start.x + 200
  let by0 = s.start.y - 250
  let by1 = s.start.y + 250
  for (const o of s.objects) {
    const z = objectSize(o)
    const reach = Math.max(z.r, Math.hypot(z.w, z.l) / 2)
    bx0 = Math.min(bx0, o.x - reach)
    bx1 = Math.max(bx1, o.x + reach)
    by0 = Math.min(by0, o.y - reach)
    by1 = Math.max(by1, o.y + reach)
  }
  // minimum working area: about 1.6 m × 1.2 m around the robot
  const minW = 1600
  const minH = 1200
  if (bx1 - bx0 < minW) {
    const c = (bx0 + bx1) / 2
    bx0 = c - minW / 2
    bx1 = c + minW / 2
  }
  if (by1 - by0 < minH) {
    by0 = Math.min(by0, s.start.y - 250)
    by1 = Math.max(by1, by0 + minH)
  }
  return { x0: bx0 - 80, x1: bx1 + 80, y0: by0 - 80, y1: by1 + 80 }
}

function fit(): void {
  const b = contentBounds()
  const aspect = size.value.h / Math.max(1, size.value.w)
  const w = Math.max(b.x1 - b.x0, (b.y1 - b.y0) / aspect)
  view.value = { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, w }
}

function zoom(factor: number): void {
  view.value = { ...view.value, w: Math.min(8000, Math.max(400, view.value.w * factor)) }
}

onMounted(() => {
  if (wrap.value) {
    observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      if (r.width > 0 && r.height > 0) {
        const first = size.value.w === 800 && size.value.h === 600
        size.value = { w: r.width, h: r.height }
        if (first || !userMovedView) fit()
      }
    })
    observer.observe(wrap.value)
  }
  fit()
})
onBeforeUnmount(() => observer?.disconnect())
let userMovedView = false
watch(
  () => [scene.value?.mat, lab.id],
  () => fit(),
)

// ---- grid -----------------------------------------------------------------------------------

function lines(step: number, from: number, to: number): number[] {
  const out: number[] = []
  if (step <= 0) return out
  for (let v = Math.ceil(from / step) * step; v <= to + 1e-6 && out.length < 400; v += step) out.push(Math.round(v * 1000) / 1000)
  return out
}
const major = computed(() => settings.value?.gridMajorMm ?? 100)
const minor = computed(() => settings.value?.gridMinorMm ?? 10)
const showMinor = computed(() => minor.value * pxPerMm.value >= 6)
const majorX = computed(() => lines(major.value, x0.value, x0.value + view.value.w))
const majorY = computed(() => lines(major.value, y0.value, y1.value))
const minorX = computed(() => (showMinor.value ? lines(minor.value, x0.value, x0.value + view.value.w) : []))
const minorY = computed(() => (showMinor.value ? lines(minor.value, y0.value, y1.value) : []))
/** label every n-th major line so labels never crowd */
const labelEvery = computed(() => Math.max(1, Math.ceil(34 / (major.value * pxPerMm.value))))
const labelValue = (mm: number) => String(round(mmToDisplay(mm, unit.value), unit.value === 'cm' ? 0 : 1))
const isLabelled = (mm: number) => Math.round(mm / major.value) % labelEvery.value === 0
const legend = computed(() => `1 square = ${round(mmToDisplay(major.value, unit.value), 1)} ${unit.value}`)
const mat = computed(() => (scene.value ? matBounds(scene.value.mat) : null))
/** grid lines are fainter over a picture, so the picture stays readable */
const lineOpacity = computed(() => (lab.matImage ? 0.4 : 1))

// ---- selection & dragging -------------------------------------------------------------------

const selected = ref<string | null>(null) // 'robot' or an object id
const message = ref<string | null>(null)
const selectedObj = computed(() => scene.value?.objects.find((o) => o.id === selected.value) ?? null)
const flats = computed(() => (scene.value?.objects ?? []).filter((o) => !OBJECT_DEFS[o.type].solid))
const solids = computed(() => (scene.value?.objects ?? []).filter((o) => OBJECT_DEFS[o.type].solid))

function pointerWorld(e: PointerEvent): { x: number; y: number } {
  const el = svg.value!
  const pt = el.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const m = el.getScreenCTM()
  const p = m ? pt.matrixTransform(m.inverse()) : pt
  return { x: p.x, y: -p.y }
}

let drag: { id: string; dx: number; dy: number; moved: boolean } | null = null
let pan: { x: number; y: number; cx: number; cy: number } | null = null

function startDrag(e: PointerEvent, id: string): void {
  const s = scene.value
  if (!s) return
  e.stopPropagation()
  selected.value = id
  const p = pointerWorld(e)
  const at = id === 'robot' ? s.start : s.objects.find((o) => o.id === id)
  if (!at) return
  drag = { id, dx: at.x - p.x, dy: at.y - p.y, moved: false }
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
}

function moveDrag(e: PointerEvent): void {
  if (!drag || !settings.value) return
  const p = pointerWorld(e)
  const on = settings.value.snap
  const nx = snap(p.x + drag.dx, snapStep.value, on)
  const ny = snap(p.y + drag.dy, snapStep.value, on)
  const id = drag.id
  drag.moved = true
  // no re-simulation while the finger is moving; one run when it lifts
  lab.change((d) => {
    const t = id === 'robot' ? d.scene.start : d.scene.objects.find((o) => o.id === id)
    if (t) {
      t.x = nx
      t.y = ny
    }
  }, false)
}

function endDrag(): void {
  if (drag?.moved) lab.change(() => undefined, true)
  drag = null
}

function startPan(e: PointerEvent): void {
  selected.value = null
  pan = { x: e.clientX, y: e.clientY, cx: view.value.cx, cy: view.value.cy }
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
}

function movePan(e: PointerEvent): void {
  if (!pan) return
  userMovedView = true
  view.value = { ...view.value, cx: pan.cx - (e.clientX - pan.x) / pxPerMm.value, cy: pan.cy + (e.clientY - pan.y) / pxPerMm.value }
}

function onKey(e: KeyboardEvent): void {
  if (!selected.value) return
  const step = e.shiftKey ? 50 : 10
  const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
  const id = selected.value
  if (moves[e.key]) {
    e.preventDefault()
    const [mx, my] = moves[e.key]
    lab.change((d) => {
      const t = id === 'robot' ? d.scene.start : d.scene.objects.find((o) => o.id === id)
      if (t) {
        t.x += mx
        t.y += my
      }
    })
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && id !== 'robot') {
    e.preventDefault()
    removeSelected()
  } else if (e.key === 'Escape') selected.value = null
}

// ---- object actions -------------------------------------------------------------------------

function editObj(fn: (o: SceneObject) => void): void {
  const id = selected.value
  lab.change((d) => {
    const o = d.scene.objects.find((x) => x.id === id)
    if (o) fn(o)
  })
}

function rotate(deg: number): void {
  if (selected.value === 'robot') lab.change((d) => (d.scene.start.headingDeg = (((d.scene.start.headingDeg + deg) % 360) + 360) % 360))
  else editObj((o) => (o.rot = (((o.rot + deg) % 360) + 360) % 360))
}

function resize(factor: number): void {
  editObj((o) => {
    const z = objectSize(o)
    const c = (v: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, v * factor)))
    if (OBJECT_DEFS[o.type].shape === 'circle') o.r = c(z.r, 10, 400)
    else if (o.type === 'line') o.l = c(z.l, 50, 2000)
    else if (o.type === 'wall') o.w = c(z.w, 50, 2000)
    else {
      o.w = c(z.w, 20, 1000)
      o.l = c(z.l, 20, 1000)
    }
  })
}

function setColour(c: ColorName): void {
  editObj((o) => {
    o.color = COLOR_HEX[c]
    o.surface = c
  })
}

function cleanGoal(s: Scene): void {
  const g = s.goal
  if (!g) return
  const has = (id: string) => s.objects.some((o) => o.id === id)
  if (!has(g.zoneId) || (g.type === 'object_in_zone' && !has(g.objectId))) s.goal = null
}

function removeSelected(): void {
  const id = selected.value
  if (!id || id === 'robot') return
  lab.change((d) => {
    d.scene.objects = d.scene.objects.filter((o) => o.id !== id)
    cleanGoal(d.scene)
  })
  selected.value = null
}

function tooMany(): boolean {
  if ((scene.value?.objects.length ?? 0) < MAX_OBJECTS) return false
  message.value = `The mat is full (${MAX_OBJECTS} things). Take something away first.`
  return true
}

function duplicateSelected(): void {
  const src = selectedObj.value
  if (!src || tooMany()) return
  const copy: SceneObject = { ...src, ...makeObject(src.type, src.x + 60, src.y - 60), rot: src.rot }
  lab.change((d) => d.scene.objects.push(copy))
  selected.value = copy.id
}

function addObject(type: ObjectType): void {
  const s = scene.value
  if (!s || tooMany()) return
  message.value = null
  const pose = { x: s.start.x, y: s.start.y, h: s.start.headingDeg * DEG }
  let spot = toWorld(pose, 0, 300)
  for (let i = 1; i < 12 && s.objects.some((o) => Math.hypot(o.x - spot.x, o.y - spot.y) < 60); i++) {
    const side = i % 2 === 1 ? 1 : -1
    spot = toWorld(pose, side * Math.ceil(i / 2) * 140, 300)
  }
  const o = makeObject(type, snap(spot.x, snapStep.value, !!settings.value?.snap), snap(spot.y, snapStep.value, !!settings.value?.snap))
  lab.change((d) => d.scene.objects.push(o))
  selected.value = o.id
}

// ---- in-page confirm ------------------------------------------------------------------------

const confirm = ref<{ text: string; yes: string; run: () => void } | null>(null)
function ask(text: string, yes: string, run: () => void): void {
  confirm.value = { text, yes, run }
}
function confirmYes(): void {
  confirm.value?.run()
  confirm.value = null
}

function clearAll(): void {
  ask('Take everything off the mat?', 'Yes, clear it', () => {
    lab.change((d) => {
      d.scene.objects = []
      d.scene.goal = null
    })
    selected.value = null
  })
}

function applyPreset(p: MissionPreset): void {
  const run = () => {
    const built = p.build()
    lab.change((d) => {
      d.scene = { ...built, mat: d.scene.mat, floor: d.scene.floor }
    })
    selected.value = null
    userMovedView = false
    fit()
  }
  if ((scene.value?.objects.length ?? 0) > 0) ask(`Swap the mat for "${p.title}"? What is on it now will be removed.`, 'Yes, swap', run)
  else run()
}

// ---- goal -----------------------------------------------------------------------------------

function nameOf(o: SceneObject, list: SceneObject[]): string {
  const label = OBJECT_DEFS[o.type].label.toLowerCase()
  const same = list.filter((x) => x.type === o.type)
  return same.length > 1 ? `${label} ${same.indexOf(o) + 1}` : label
}

const goalOptions = computed(() => {
  const s = scene.value
  const out: Array<{ value: string; label: string }> = [{ value: 'none', label: 'No goal – just explore' }]
  if (!s) return out
  const zones = s.objects.filter((o) => !OBJECT_DEFS[o.type].solid && o.type !== 'line')
  const movers = s.objects.filter((o) => OBJECT_DEFS[o.type].solid && OBJECT_DEFS[o.type].movable)
  for (const m of movers) for (const z of zones) out.push({ value: `o:${m.id}:${z.id}`, label: `Get the ${nameOf(m, s.objects)} onto the ${nameOf(z, s.objects)}` })
  for (const z of zones) out.push({ value: `r:${z.id}`, label: `Park the robot on the ${nameOf(z, s.objects)}` })
  return out
})

const goalValue = computed(() => {
  const g = scene.value?.goal
  if (!g) return 'none'
  return g.type === 'robot_in_zone' ? `r:${g.zoneId}` : `o:${g.objectId}:${g.zoneId}`
})

function setGoal(value: string): void {
  const [kind, a, b] = value.split(':')
  lab.change((d) => {
    if (kind === 'o' && a && b) d.scene.goal = { type: 'object_in_zone', objectId: a, zoneId: b }
    else if (kind === 'r' && a) d.scene.goal = { type: 'robot_in_zone', zoneId: a }
    else d.scene.goal = null
  })
}

const goalLine = computed(() => (scene.value ? goalText(scene.value) : null))
const goalIds = computed(() => {
  const g = scene.value?.goal
  return new Set(g ? (g.type === 'object_in_zone' ? [g.objectId, g.zoneId] : [g.zoneId]) : [])
})

// ---- description & AI suggestion ------------------------------------------------------------

function setDescription(text: string): void {
  lab.change((d) => (d.scene.description = text.slice(0, 500)), false)
}

const proposing = ref(false)
const proposal = ref<SceneProposal | null>(null)
const aiError = ref<string | null>(null)

async function suggest(): Promise<void> {
  const text = scene.value?.description.trim() ?? ''
  aiError.value = null
  proposal.value = null
  if (text.length < 5) {
    aiError.value = 'Write a few words about your mission first.'
    return
  }
  proposing.value = true
  try {
    const res = await api.proposeScene(text)
    const p = parseSceneProposal(res.raw)
    if (p.objects.length === 0) aiError.value = 'The AI could not think of a mat for that. Try describing it another way, or add things yourself.'
    else proposal.value = p
  } catch (e) {
    if (e instanceof SceneProposalError) aiError.value = 'The AI answer was muddled, so nothing was changed. You can try again.'
    else if (e instanceof ApiError && e.code === 'ai_not_configured') aiError.value = 'The AI helper is switched off in this lab. You can still build the mat yourself.'
    else if (e instanceof ApiError) aiError.value = e.message
    else aiError.value = 'Something went wrong. Nothing was changed.'
  } finally {
    proposing.value = false
  }
}

function describe(o: SceneObject): string {
  const u = unit.value
  return `${OBJECT_DEFS[o.type].icon} ${OBJECT_DEFS[o.type].label} at x ${round(mmToDisplay(o.x, u), 1)} ${u}, y ${round(mmToDisplay(o.y, u), 1)} ${u}`
}

function useProposal(): void {
  const p = proposal.value
  if (!p) return
  lab.change((d) => {
    d.scene.objects = p.objects.slice(0, MAX_OBJECTS)
    d.scene.goal = p.goal
    cleanGoal(d.scene)
  })
  proposal.value = null
  selected.value = null
  userMovedView = false
  fit()
}

// ---- drawing helpers ------------------------------------------------------------------------

const robotRects = computed(() => {
  const r = lab.robot
  const half = Math.max(r.chassis.widthMm, r.trackWidthMm + r.wheelWidthMm) / 2
  const tools: Array<{ x: number; y: number; w: number; h: number }> = []
  for (const a of lab.data?.attachments ?? []) {
    if (ATTACHMENTS[a.kind]?.group !== 'tool' && a.kind !== 'force_sensor') continue
    for (const t of toolRects(r, a, 0)) tools.push({ x: t.x0, y: -t.y1, w: t.x1 - t.x0, h: t.y1 - t.y0 })
  }
  return { body: { x: -half, y: -r.chassis.frontMm, w: half * 2, h: r.chassis.frontMm + r.chassis.rearMm }, tools, front: r.chassis.frontMm }
})

const fill = (o: SceneObject) => o.color ?? OBJECT_DEFS[o.type].color
const posText = computed(() => {
  const s = scene.value
  if (!s || !selected.value) return ''
  const t = selected.value === 'robot' ? s.start : selectedObj.value
  if (!t) return ''
  const u = unit.value
  return `x ${round(mmToDisplay(t.x, u), 1)} ${u}, y ${round(mmToDisplay(t.y, u), 1)} ${u}`
})
const selectedName = computed(() => (selected.value === 'robot' ? 'Robot start' : selectedObj.value ? OBJECT_DEFS[selectedObj.value.type].label : ''))
</script>

<template>
  <div v-if="lab.data && scene && settings" data-testid="mission-editor" class="flex h-full min-h-0 flex-col gap-3 px-2 pb-2 max-lg:overflow-y-auto lg:flex-row">
    <!-- mat -->
    <div class="flex min-h-0 flex-1 flex-col gap-2 max-lg:flex-none">
      <div
        ref="wrap"
        class="relative min-h-[300px] flex-1 overflow-hidden rounded-2xl border-2 border-[var(--color-line)] bg-[#eef1fb] max-lg:h-[52vh] max-lg:flex-none"
        tabindex="0"
        role="application"
        aria-label="Mission mat. Tap a thing to select it, drag to move it. Arrow keys move the selected thing."
        @keydown="onKey"
      >
        <svg ref="svg" data-testid="mission-mat" :viewBox="viewBox" class="absolute inset-0 h-full w-full touch-none select-none" preserveAspectRatio="xMidYMid meet">
          <rect :x="x0" :y="-y1" :width="view.w" :height="viewH" fill="#eef1fb" @pointerdown="startPan" @pointermove="movePan" @pointerup="pan = null" @pointercancel="pan = null" />
          <g pointer-events="none">
            <rect v-if="mat" :x="mat.x0" :y="-mat.y1" :width="mat.x1 - mat.x0" :height="mat.y1 - mat.y0" fill="#ffffff" stroke="#5b6694" :stroke-width="px(4)" />
            <!-- the straightened photo of the table, exactly covering the mat, under the grid -->
            <image v-if="mat && lab.matImage" data-testid="mat-picture" :href="lab.matImage.url" :x="mat.x0" :y="-mat.y1" :width="mat.x1 - mat.x0" :height="mat.y1 - mat.y0" preserveAspectRatio="none" />
            <line v-for="v in minorX" :key="'mx' + v" :stroke-opacity="lineOpacity" :x1="v" :x2="v" :y1="-y1" :y2="-y0" stroke="#d3d9ee" :stroke-width="px(1)" />
            <line v-for="v in minorY" :key="'my' + v" :stroke-opacity="lineOpacity" :y1="-v" :y2="-v" :x1="x0" :x2="x0 + view.w" stroke="#d3d9ee" :stroke-width="px(1)" />
            <line v-for="v in majorX" :key="'Mx' + v" :stroke-opacity="lineOpacity" :x1="v" :x2="v" :y1="-y1" :y2="-y0" :stroke="v === 0 ? '#39448a' : '#9aa6d6'" :stroke-width="px(v === 0 ? 2.5 : 1.5)" />
            <line v-for="v in majorY" :key="'My' + v" :stroke-opacity="lineOpacity" :y1="-v" :y2="-v" :x1="x0" :x2="x0 + view.w" :stroke="v === 0 ? '#39448a' : '#9aa6d6'" :stroke-width="px(v === 0 ? 2.5 : 1.5)" />
            <!-- origin marker -->
            <circle cx="0" cy="0" :r="px(5)" fill="#39448a" />
          </g>

          <!-- flat zones under everything solid -->
          <g
            v-for="o in [...flats, ...solids]"
            :key="o.id"
            :data-testid="'obj-' + o.type"
            :transform="`translate(${o.x} ${-o.y}) rotate(${o.rot})`"
            class="cursor-grab"
            role="button"
            :aria-label="OBJECT_DEFS[o.type].label"
            @pointerdown="startDrag($event, o.id)"
            @pointermove="moveDrag"
            @pointerup="endDrag"
            @pointercancel="endDrag"
          >
            <!-- generous invisible touch area -->
            <circle :r="Math.max(px(24), Math.min(objectSize(o).r || Math.min(objectSize(o).w, objectSize(o).l) / 2, px(60)))" fill="transparent" />
            <template v-if="OBJECT_DEFS[o.type].shape === 'circle'">
              <circle
                :r="objectSize(o).r"
                :fill="fill(o)"
                :fill-opacity="OBJECT_DEFS[o.type].solid ? 1 : 0.55"
                :stroke="selected === o.id ? '#ff4ccd' : goalIds.has(o.id) ? '#b98f00' : '#1b1f2a'"
                :stroke-width="px(selected === o.id ? 4 : 2)"
                :stroke-dasharray="OBJECT_DEFS[o.type].solid ? undefined : `${px(8)} ${px(6)}`"
              />
            </template>
            <template v-else>
              <rect
                :x="-objectSize(o).w / 2"
                :y="-objectSize(o).l / 2"
                :width="objectSize(o).w"
                :height="objectSize(o).l"
                :rx="px(3)"
                :fill="fill(o)"
                :fill-opacity="OBJECT_DEFS[o.type].solid || o.type === 'line' ? 1 : 0.55"
                :stroke="selected === o.id ? '#ff4ccd' : goalIds.has(o.id) ? '#b98f00' : '#1b1f2a'"
                :stroke-width="px(selected === o.id ? 4 : 2)"
              />
            </template>
            <text v-if="o.type !== 'line' && o.type !== 'wall'" :transform="`rotate(${-o.rot})`" text-anchor="middle" dominant-baseline="central" :font-size="Math.max(px(16), Math.min(px(30), (objectSize(o).r || Math.min(objectSize(o).w, objectSize(o).l) / 2) * 1.1))" pointer-events="none">
              {{ OBJECT_DEFS[o.type].icon }}
            </text>
          </g>

          <!-- robot start -->
          <g
            data-testid="robot-start"
            :transform="`translate(${scene.start.x} ${-scene.start.y}) rotate(${scene.start.headingDeg})`"
            class="cursor-grab"
            role="button"
            aria-label="Robot start position"
            @pointerdown="startDrag($event, 'robot')"
            @pointermove="moveDrag"
            @pointerup="endDrag"
            @pointercancel="endDrag"
          >
            <circle :r="Math.max(px(26), 90)" fill="transparent" />
            <rect v-for="(t, i) in robotRects.tools" :key="i" :x="t.x" :y="t.y" :width="t.w" :height="t.h" fill="#5b6694" stroke="#1b1f2a" :stroke-width="px(1)" />
            <rect
              :x="robotRects.body.x"
              :y="robotRects.body.y"
              :width="robotRects.body.w"
              :height="robotRects.body.h"
              :rx="px(4)"
              fill="#ffd23f"
              :stroke="selected === 'robot' ? '#ff4ccd' : '#1b1f2a'"
              :stroke-width="px(selected === 'robot' ? 4 : 2)"
            />
            <!-- heading arrow -->
            <path :d="`M0 ${robotRects.body.h * 0.25} L0 ${-robotRects.front * 0.55} M${-px(8)} ${-robotRects.front * 0.55 + px(10)} L0 ${-robotRects.front * 0.55 - px(4)} L${px(8)} ${-robotRects.front * 0.55 + px(10)}`" fill="none" stroke="#1b1f2a" :stroke-width="px(3.5)" stroke-linecap="round" stroke-linejoin="round" />
          </g>

          <!-- axis labels along the left and bottom edges -->
          <g pointer-events="none" :font-size="px(12)" fill="#39448a" font-weight="700">
            <template v-for="v in majorX" :key="'lx' + v">
              <text v-if="isLabelled(v)" :x="v" :y="-y0 - px(6)" text-anchor="middle">{{ labelValue(v) }}</text>
            </template>
            <template v-for="v in majorY" :key="'ly' + v">
              <text v-if="isLabelled(v)" :x="x0 + px(6)" :y="-v - px(3)">{{ labelValue(v) }}</text>
            </template>
          </g>
        </svg>

        <div class="pointer-events-none absolute left-2 top-2 rounded-full bg-[#101a3a]/85 px-3 py-1 text-xs font-extrabold text-white">{{ legend }}</div>
        <div v-if="mat && lab.matImage" class="pointer-events-none absolute bottom-2 left-2 rounded-full bg-[#101a3a]/85 px-3 py-1 text-xs font-extrabold text-flag" data-testid="mat-picture-chip">≈ picture of the table</div>
        <div class="absolute right-2 top-2 flex gap-1">
          <button class="btn btn-ghost btn-sm" aria-label="Zoom out" @click="userMovedView = true; zoom(1.25)">−</button>
          <button class="btn btn-ghost btn-sm" aria-label="Zoom in" @click="userMovedView = true; zoom(0.8)">+</button>
          <button class="btn btn-ghost btn-sm" aria-label="Show the whole mat" @click="userMovedView = false; fit()">Fit</button>
        </div>
      </div>

      <!-- selection toolbar -->
      <div class="card flex min-h-[64px] flex-wrap items-center gap-2 p-2" aria-live="polite">
        <template v-if="selected">
          <div class="mr-1 px-1">
            <div class="font-extrabold leading-tight">{{ selectedName }}</div>
            <div class="muted text-sm" data-testid="selection-position">{{ posText }}</div>
          </div>
          <button class="btn btn-ghost btn-sm" aria-label="Turn left 15 degrees" @click="rotate(-15)">↺ 15°</button>
          <button class="btn btn-ghost btn-sm" aria-label="Turn right 15 degrees" @click="rotate(15)">↻ 15°</button>
          <template v-if="selected === 'robot'">
            <button class="btn btn-ghost btn-sm" aria-label="Turn left 90 degrees" @click="rotate(-90)">↺ 90°</button>
            <button class="btn btn-ghost btn-sm" aria-label="Turn right 90 degrees" @click="rotate(90)">↻ 90°</button>
            <span class="chip">facing {{ round(scene.start.headingDeg, 0) }}°</span>
          </template>
          <template v-else-if="selectedObj">
            <button class="btn btn-ghost btn-sm" aria-label="Make smaller" @click="resize(1 / 1.1)">Smaller</button>
            <button class="btn btn-ghost btn-sm" aria-label="Make bigger" @click="resize(1.1)">Bigger</button>
            <div v-if="selectedObj.type === 'color_zone'" class="flex flex-wrap gap-1" role="group" aria-label="Patch colour">
              <button
                v-for="c in SWATCHES"
                :key="c"
                class="h-11 w-11 rounded-full border-4"
                :class="selectedObj.surface === c || (!selectedObj.surface && c === 'red') ? 'border-[var(--color-pink)]' : 'border-white/40'"
                :style="{ background: COLOR_HEX[c] }"
                :aria-label="c"
                :aria-pressed="selectedObj.surface === c"
                @click="setColour(c)"
              />
            </div>
            <button class="btn btn-ghost btn-sm" @click="duplicateSelected">Copy</button>
            <button class="btn btn-danger btn-sm" @click="removeSelected">Delete</button>
          </template>
          <p v-if="selectedObj" class="muted w-full px-1 text-xs">{{ OBJECT_DEFS[selectedObj.type].note }}</p>
        </template>
        <p v-else class="muted px-2 text-sm">Tap the robot or a thing to move it. Drag the floor to look around.</p>
      </div>
    </div>

    <!-- side panel -->
    <div class="scroll-y flex min-h-0 flex-col gap-3 lg:w-[340px] lg:shrink-0">
      <div v-if="confirm" class="notice notice-warn pop" role="alertdialog" aria-label="Please confirm">
        <p class="font-bold">{{ confirm.text }}</p>
        <div class="mt-2 flex gap-2">
          <button class="btn btn-sun btn-sm" @click="confirmYes">{{ confirm.yes }}</button>
          <button class="btn btn-ghost btn-sm" @click="confirm = null">No, keep it</button>
        </div>
      </div>
      <div v-if="message" class="notice notice-warn" role="status">
        {{ message }}
        <button class="btn btn-ghost btn-sm ml-2" @click="message = null">OK</button>
      </div>

      <section class="card p-3">
        <h3 class="font-extrabold">Quick missions</h3>
        <p class="muted mb-2 text-sm">Optional. Skip this if you only want to drive.</p>
        <div class="grid grid-cols-2 gap-2">
          <button v-for="p in MISSION_PRESETS" :key="p.id" :data-testid="'preset-' + p.id" class="btn btn-ghost btn-sm flex-col !items-start text-left" :title="p.description" @click="applyPreset(p)">
            <span class="text-xl" aria-hidden="true">{{ p.emoji }}</span>
            <span class="text-sm leading-tight">{{ p.title }}</span>
          </button>
        </div>
      </section>

      <section class="card p-3">
        <h3 class="mb-2 font-extrabold">Add things</h3>
        <div class="grid grid-cols-3 gap-2">
          <button v-for="d in PALETTE" :key="d.type" :data-testid="'add-' + d.type" class="btn btn-ghost btn-sm flex-col !px-1" :aria-label="'Add ' + d.label" @click="addObject(d.type)">
            <span class="text-2xl" aria-hidden="true">{{ d.icon }}</span>
            <span class="text-xs leading-tight">{{ d.label }}</span>
          </button>
        </div>
        <p class="muted mt-2 text-xs">Sizes are close guesses, not exact LEGO measurements.</p>
      </section>

      <section class="card p-3">
        <h3 class="mb-2 font-extrabold">What is the mission?</h3>
        <select data-testid="goal-select" class="field" aria-label="Mission goal" :value="goalValue" @change="setGoal(($event.target as HTMLSelectElement).value)">
          <option v-for="g in goalOptions" :key="g.value" :value="g.value">{{ g.label }}</option>
        </select>
        <p v-if="goalLine" class="mt-2"><span class="chip chip-leaf">Goal</span> {{ goalLine }}</p>
        <p v-else-if="goalOptions.length === 1" class="muted mt-2 text-sm">Add a target circle or finish spot to set a goal.</p>

        <label class="mt-3 block text-sm font-bold" for="mission-description">Describe it (optional)</label>
        <textarea
          id="mission-description"
          class="field mt-1"
          rows="2"
          maxlength="500"
          placeholder="Push the big seed pod into the circle"
          :value="scene.description"
          @input="setDescription(($event.target as HTMLTextAreaElement).value)"
        />
        <template v-if="session.info?.assistant.available">
          <button class="btn btn-sky btn-sm mt-2 w-full" :disabled="proposing" @click="suggest">{{ proposing ? 'Thinking…' : '✨ Suggest a mat with AI' }}</button>
        </template>
        <div v-if="aiError" class="notice notice-warn mt-2 text-sm" role="alert">{{ aiError }}</div>

        <div v-if="proposal" class="notice mt-2 pop" data-testid="scene-proposal">
          <p class="font-extrabold">The AI suggests this mat:</p>
          <ul class="mt-1 list-none space-y-1 text-sm">
            <li v-for="o in proposal.objects" :key="o.id">{{ describe(o) }}</li>
          </ul>
          <p class="mt-2"><span class="chip chip-est">Guess</span> <span class="text-sm">AI guessed these sizes and positions – check them.</span></p>
          <ul v-if="proposal.assumptions.length" class="muted mt-1 list-disc pl-5 text-sm">
            <li v-for="(a, i) in proposal.assumptions" :key="i">{{ a }}</li>
          </ul>
          <p v-if="proposal.dropped.length" class="muted mt-1 text-sm">Left out (SPIKE Lab does not have these): {{ proposal.dropped.join(', ') }}</p>
          <p class="muted mt-1 text-sm">This replaces what is on the mat. Your program is not changed.</p>
          <div class="mt-2 flex gap-2">
            <button class="btn btn-sun btn-sm" @click="useProposal">Use this mat</button>
            <button class="btn btn-ghost btn-sm" @click="proposal = null">No thanks</button>
          </div>
        </div>
      </section>

      <section class="card p-3">
        <h3 class="mb-2 font-extrabold">Mat</h3>
        <div class="flex flex-wrap gap-2">
          <button class="btn btn-ghost btn-sm" :aria-pressed="scene.mat === 'open'" data-testid="mat-open" :disabled="!!lab.matImage" @click="lab.change((d) => setMat(d, 'open'))">Open floor</button>
          <button class="btn btn-ghost btn-sm" :aria-pressed="scene.mat === 'classroom'" data-testid="mat-classroom" :disabled="!!lab.matImage" @click="lab.change((d) => setMat(d, 'classroom'))">Classroom mat</button>
          <button class="btn btn-ghost btn-sm" :aria-pressed="scene.mat === 'competition'" data-testid="mat-competition" :disabled="!!lab.matImage" @click="lab.change((d) => setMat(d, 'competition'))">Competition table</button>
          <button class="btn btn-ghost btn-sm" :aria-pressed="settings.snap" @click="lab.change((d) => (d.settings.snap = !d.settings.snap), false)">Snap to grid: {{ settings.snap ? 'on' : 'off' }}</button>
          <button class="btn btn-danger btn-sm" :disabled="scene.objects.length === 0" @click="clearAll">Clear everything</button>
        </div>
        <p v-if="scene.mat === 'classroom'" class="muted mt-2 text-xs">Classroom mat: 200 × 110 cm with a border wall (a typical table size, not an official mat).</p>
        <p v-if="scene.mat === 'competition'" class="muted mt-2 text-xs" data-testid="mat-note">Competition table: about 236 × 114 cm with a border wall.</p>
        <p v-if="lab.matImage" class="muted mt-2 text-xs">Remove the picture to change the mat.</p>
      </section>

      <MatPicturePanel />
    </div>
  </div>
</template>
