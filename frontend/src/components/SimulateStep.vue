<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CameraMode } from '@/core/project'
import { ATTACHMENTS } from '@/core/robots'
import { goalText } from '@/core/scene'
import { formatLength, gridChoices, round, type DisplayUnit } from '@/core/units'
import { blip } from '@/lib/sound'
import { SPEEDS, useLab } from '@/stores/lab'
import { useSession } from '@/stores/session'
import ProgramPanel from './ProgramPanel.vue'
import SimViewport from './SimViewport.vue'

const lab = useLab()
const session = useSession()
const emit = defineEmits<{ step: [step: 'robot' | 'mission'] }>()

const data = computed(() => lab.data!)
const settings = computed(() => data.value.settings)
const unit = computed(() => settings.value.unit)
const result = computed(() => lab.result)
const m = computed(() => lab.measures)
const showView = ref(false)
const showTelemetry = ref(false)
const showLog = ref(false)
const celebrate = ref(false)
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

const cameras: { id: CameraMode; label: string; icon: string }[] = [
  { id: 'top', label: 'From above', icon: '⬇️' },
  { id: 'orbit', label: '3D', icon: '🧊' },
  { id: 'follow', label: 'Follow', icon: '🎯' },
  { id: 'behind', label: 'Behind', icon: '🚗' },
  { id: 'side', label: 'Side', icon: '↔️' },
]

const len = (mm: number, d = 1) => formatLength(mm, unit.value, d)
const blocked = computed(() => result.value?.status === 'invalid' || result.value?.status === 'empty')
const canPlay = computed(() => !!result.value && result.value.frames.length > 1)
const goal = computed(() => goalText(data.value.scene))
const finished = computed(() => lab.atEnd && canPlay.value)
const visibleEvents = computed(() => (result.value?.events ?? []).filter((e) => e.frame <= lab.frameIndex))
const sensors = computed(() => data.value.attachments.filter((a) => ATTACHMENTS[a.kind].sensor))

function setCamera(mode: CameraMode) {
  lab.change((d) => (d.settings.camera = mode), false)
}
function setUnit(u: DisplayUnit) {
  lab.change((d) => {
    d.settings.unit = u
    const g = gridChoices(u)[1]
    d.settings.gridMajorMm = g.majorMm
    d.settings.gridMinorMm = g.minorMm
  }, false)
}
function setGrid(majorMm: number, minorMm: number) {
  lab.change((d) => {
    d.settings.gridMajorMm = majorMm
    d.settings.gridMinorMm = minorMm
  }, false)
}
const toggle = (key: 'gridLabels' | 'trail' | 'distanceMarkers') => lab.change((d) => (d.settings[key] = !d.settings[key]), false)

function play() {
  if (session.sound && !lab.playing) blip('start')
  lab.toggle()
}
function step(dir: 1 | -1) {
  if (dir === 1) lab.stepNext()
  else lab.stepPrev()
  if (session.sound) blip('step')
}

// tasteful celebration, only for a goal the simulation itself verified
watch(finished, (done) => {
  if (!done || !result.value?.goal) return
  if (result.value.goal.met) {
    celebrate.value = true
    if (session.sound) blip('win')
    setTimeout(() => (celebrate.value = false), reducedMotion ? 1500 : 2600)
  } else if (session.sound) blip('oops')
})

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  if (t.closest('input, select, textarea, [contenteditable]')) return
  if (e.key === ' ') {
    e.preventDefault()
    play()
  } else if (e.key === 'ArrowRight') step(1)
  else if (e.key === 'ArrowLeft') step(-1)
  else if (e.key.toLowerCase() === 'r') lab.resetRun()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  lab.pause()
})

const confetti = Array.from({ length: 28 }, (_, i) => ({ left: (i * 37) % 100, delay: (i % 7) * 0.08, color: ['#ffd23f', '#34ccf1', '#ff4ccd', '#3ddc84'][i % 4], rot: (i * 53) % 360 }))
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-2 px-2 pb-2 lg:flex-row" data-testid="simulate-step">
    <!-- stage -->
    <section class="flex min-h-0 flex-col gap-2 max-lg:h-[62dvh] max-lg:shrink-0 lg:flex-1" aria-label="Robot simulation">
      <!-- readouts -->
      <div class="flex flex-wrap items-center gap-1.5" data-testid="readouts" aria-live="off">
        <span class="chip text-base" data-testid="readout-moved">Moved: <b>{{ len(m?.movedMm ?? 0) }}</b></span>
        <span class="chip text-base" data-testid="readout-turned">Turned: <b>{{ round(m?.turnedDeg ?? 0, 0) }}°</b></span>
        <span class="chip text-base" data-testid="readout-position">Position: <b>x {{ len(m?.xMm ?? 0) }}, y {{ len(m?.yMm ?? 0) }}</b></span>
        <span v-if="result && !result.exact" class="chip chip-est" data-testid="estimated-chip" title="See the notes below">≈ estimated</span>
        <span v-if="m?.blocked" class="chip chip-flag">🧱 stuck</span>
      </div>
      <div v-if="m?.move" class="flex flex-wrap items-center gap-1.5 text-sm" data-testid="move-readout">
        <template v-if="m.move.commandedMm !== null">
          <span class="chip chip-sky">Asked: {{ len(m.move.commandedMm) }}</span>
          <span class="chip">Driven: {{ len(m.move.actualMm) }}</span>
          <span class="chip">To go: {{ len(m.move.remainingMm ?? 0) }}</span>
        </template>
        <template v-else>
          <span v-if="m.move.commandedDeg !== null" class="chip chip-sky">Asked: turn {{ round(Math.abs(m.move.commandedDeg), 0) }}° {{ m.move.commandedDeg < 0 ? 'left' : 'right' }}</span>
          <span class="chip">This block turned: {{ round(m.move.turnedDeg, 0) }}°</span>
          <span class="chip">Robot centre moved: {{ len(m.move.actualMm) }}</span>
        </template>
        <span class="muted">Wheels rolled: left {{ len(m.move.wheelLMm) }}, right {{ len(m.move.wheelRMm) }}</span>
      </div>

      <!-- viewport -->
      <div class="relative min-h-0 flex-1 overflow-hidden rounded-2xl border-2 border-line bg-[#dfe4f5]">
        <SimViewport />
        <div class="pointer-events-none absolute left-2 top-2 flex max-w-[70%] flex-wrap gap-1.5">
          <button
            v-for="c in cameras"
            :key="c.id"
            class="btn btn-ghost btn-sm pointer-events-auto"
            :class="{ 'is-on': settings.camera === c.id }"
            :aria-pressed="settings.camera === c.id"
            :aria-label="`Camera: ${c.label}`"
            :data-testid="`camera-${c.id}`"
            @click="setCamera(c.id)"
          >
            <span aria-hidden="true">{{ c.icon }}</span><span class="hidden sm:inline">{{ c.label }}</span>
          </button>
        </div>
        <div v-if="celebrate" class="pointer-events-none absolute inset-0 overflow-hidden" data-testid="celebration">
          <template v-if="!reducedMotion">
            <span v-for="(c, i) in confetti" :key="i" class="confetti" :style="{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s`, transform: `rotate(${c.rot}deg)` }" />
          </template>
          <div class="pop absolute left-1/2 top-1/3 -translate-x-1/2 rounded-2xl bg-night/90 px-6 py-3 text-2xl font-black text-sun">🎉 Mission complete!</div>
        </div>
        <div v-if="blocked" class="absolute inset-x-3 bottom-3 notice notice-warn font-bold" role="status" data-testid="sim-blocked">{{ result?.reason }}</div>
      </div>

      <!-- playback -->
      <div class="card flex flex-col gap-2 p-2" data-testid="playback">
        <div class="flex items-center gap-2">
          <span class="w-14 text-right font-mono text-sm tabular-nums">{{ (m?.timeS ?? 0).toFixed(1) }} s</span>
          <input
            type="range"
            class="h-11 flex-1 accent-(--color-sun)"
            min="0"
            :max="lab.lastFrame"
            :value="lab.frameIndex"
            :disabled="!canPlay"
            aria-label="Timeline"
            data-testid="timeline"
            @input="lab.seek(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="w-14 font-mono text-sm tabular-nums">{{ ((result?.frames.length ?? 1) * (result?.dt ?? 0.01) - (result?.dt ?? 0.01)).toFixed(1) }} s</span>
        </div>
        <div class="flex flex-wrap items-center justify-center gap-2">
          <button class="btn btn-ghost" :disabled="!canPlay" aria-label="Back to the start" data-testid="reset" @click="lab.resetRun()">⏮</button>
          <button class="btn btn-ghost" :disabled="!canPlay || lab.frameIndex === 0" aria-label="Previous instruction" data-testid="step-prev" @click="step(-1)">◀ <span class="hidden sm:inline">Back</span></button>
          <button class="btn btn-sun btn-xl min-w-36" :disabled="!canPlay" :aria-label="lab.playing ? 'Pause' : 'Play'" data-testid="play" @click="play">
            {{ lab.playing ? '⏸ Pause' : finished ? '↻ Again' : '▶ Play' }}
          </button>
          <button class="btn btn-ghost" :disabled="!canPlay || lab.atEnd" aria-label="Next instruction" data-testid="step-next" @click="step(1)"><span class="hidden sm:inline">Next</span> ▶</button>
          <div class="flex gap-1" role="group" aria-label="Playback speed">
            <button v-for="s in SPEEDS" :key="s" class="btn btn-ghost btn-sm px-2" :class="{ 'is-on': settings.speed === s }" :aria-pressed="settings.speed === s" :data-testid="`speed-${s}`" @click="lab.setSpeed(s)">{{ s }}×</button>
          </div>
        </div>
      </div>
    </section>

    <!-- side: result, tinker, view options -->
    <aside class="scroll-y flex min-h-0 flex-col gap-2 lg:w-[26rem] lg:shrink-0" aria-label="Program and results">
      <div v-if="goal" class="notice" :class="finished && result?.goal ? (result.goal.met ? 'notice-good' : 'notice-warn') : ''" data-testid="goal-banner">
        <p class="font-black">🎯 {{ goal }}</p>
        <p v-if="finished && result?.goal" class="font-bold" data-testid="goal-result">{{ result.goal.met ? '✅' : '🤔' }} {{ result.goal.text }} <span v-if="!result.goal.met">Change a number and try again!</span></p>
      </div>

      <div v-if="finished && result" class="notice" :class="result.status === 'cutoff' ? 'notice-warn' : ''" data-testid="run-summary">
        <p class="font-bold">{{ result.reason }}</p>
        <p>The robot drove <b>{{ len(m?.movedMm ?? 0) }}</b> and ended at <b>x {{ len(m?.xMm ?? 0) }}, y {{ len(m?.yMm ?? 0) }}</b>, facing <b>{{ round((((m?.headingDeg ?? 0) % 360) + 360) % 360, 0) }}°</b>.</p>
      </div>

      <div v-for="w in result?.warnings ?? []" :key="w" class="notice notice-warn text-sm font-bold" data-testid="sim-warning">⚠️ {{ w }}</div>
      <details v-if="result?.assumptions.length" class="notice text-sm" data-testid="assumptions">
        <summary class="min-h-8 cursor-pointer font-bold">≈ What SPIKE Lab assumed ({{ result.assumptions.length }})</summary>
        <ul class="m-0 mt-1 list-disc pl-5"><li v-for="a in result.assumptions" :key="a">{{ a }}</li></ul>
      </details>

      <div class="card p-2">
        <div class="mb-1 flex flex-wrap items-center gap-2 text-sm">
          <span class="font-bold">🤖 {{ lab.robot.name }}</span>
          <button class="btn btn-ghost btn-sm" data-testid="go-robot" @click="emit('step', 'robot')">Change</button>
          <button class="btn btn-ghost btn-sm" data-testid="go-mission" @click="emit('step', 'mission')">🗺️ Mat</button>
          <button class="btn btn-ghost btn-sm ml-auto" :aria-expanded="showView" data-testid="view-options" @click="showView = !showView">📐 Grid</button>
        </div>
        <div v-if="showView" class="mb-2 flex flex-col gap-2 rounded-xl bg-deep p-2" data-testid="grid-options">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="w-16 text-sm font-bold">Squares</span>
            <button v-for="g in gridChoices(unit)" :key="g.label" class="btn btn-ghost btn-sm" :class="{ 'is-on': Math.abs(settings.gridMajorMm - g.majorMm) < 0.01 }" :aria-pressed="Math.abs(settings.gridMajorMm - g.majorMm) < 0.01" :data-testid="`grid-${g.label.replace(' ', '')}`" @click="setGrid(g.majorMm, g.minorMm)">{{ g.label }}</button>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="w-16 text-sm font-bold">Units</span>
            <button class="btn btn-ghost btn-sm" :class="{ 'is-on': unit === 'cm' }" :aria-pressed="unit === 'cm'" data-testid="unit-cm" @click="setUnit('cm')">cm</button>
            <button class="btn btn-ghost btn-sm" :class="{ 'is-on': unit === 'in' }" :aria-pressed="unit === 'in'" data-testid="unit-in" @click="setUnit('in')">inches</button>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button class="btn btn-ghost btn-sm" :class="{ 'is-on': settings.gridLabels }" :aria-pressed="settings.gridLabels" @click="toggle('gridLabels')">Numbers</button>
            <button class="btn btn-ghost btn-sm" :class="{ 'is-on': settings.trail }" :aria-pressed="settings.trail" @click="toggle('trail')">Path</button>
            <button class="btn btn-ghost btn-sm" :class="{ 'is-on': settings.distanceMarkers }" :aria-pressed="settings.distanceMarkers" @click="toggle('distanceMarkers')">Distance dots</button>
          </div>
        </div>
        <p class="muted mb-2 text-sm">Change a number below and the robot runs your new program straight away. Your screenshot stays as it was.</p>
        <ProgramPanel />
      </div>

      <div class="card p-2">
        <button class="flex min-h-11 w-full items-center justify-between font-bold" :aria-expanded="showTelemetry" data-testid="telemetry-toggle" @click="showTelemetry = !showTelemetry"><span>📊 More numbers</span><span>{{ showTelemetry ? '▲' : '▼' }}</span></button>
        <dl v-if="showTelemetry && lab.frame" class="m-0 grid grid-cols-2 gap-x-3 gap-y-1 text-sm" data-testid="telemetry">
          <dt class="muted">Time</dt><dd class="m-0 font-mono">{{ lab.frame.t.toFixed(2) }} s</dd>
          <dt class="muted">Heading (0° = up the mat)</dt><dd class="m-0 font-mono">{{ round(m?.headingDeg ?? 0, 1) }}°</dd>
          <dt class="muted">Hub yaw angle</dt><dd class="m-0 font-mono">{{ round(lab.frame.yaw, 1) }}°</dd>
          <dt class="muted">Left wheel rolled</dt><dd class="m-0 font-mono">{{ len(lab.frame.wheelL, 2) }}</dd>
          <dt class="muted">Right wheel rolled</dt><dd class="m-0 font-mono">{{ len(lab.frame.wheelR, 2) }}</dd>
          <template v-for="(angle, port) in lab.frame.motors" :key="port"><dt class="muted">Motor {{ port }}</dt><dd class="m-0 font-mono">{{ round(angle, 0) }}°</dd></template>
          <template v-for="a in sensors" :key="a.uid"><dt class="muted">{{ ATTACHMENTS[a.kind].name }} {{ a.port }}</dt><dd class="m-0 font-mono">{{ a.kind === 'distance_sensor' ? len(Number(lab.frame.sensors[a.uid] ?? 0)) : a.kind === 'force_sensor' ? (lab.frame.sensors[a.uid] ? 'pressed' : 'not pressed') : lab.frame.sensors[a.uid] }}</dd></template>
          <template v-for="(v, k) in lab.frame.vars" :key="k"><dt class="muted">Variable {{ k }}</dt><dd class="m-0 font-mono">{{ round(v, 3) }}</dd></template>
          <dt class="muted">Light matrix</dt><dd class="m-0 font-mono">{{ lab.frame.light ?? 'off' }}</dd>
          <dt class="muted">Distances</dt><dd class="m-0">{{ result?.exact ? 'exact for ideal wheels, no slip' : 'estimated' }}</dd>
        </dl>
      </div>

      <div class="card p-2">
        <button class="flex min-h-11 w-full items-center justify-between font-bold" :aria-expanded="showLog" data-testid="log-toggle" @click="showLog = !showLog"><span>📜 What happened ({{ visibleEvents.length }})</span><span>{{ showLog ? '▲' : '▼' }}</span></button>
        <ol v-if="showLog" class="m-0 list-none p-0 text-sm" data-testid="event-log">
          <li v-for="(e, i) in visibleEvents" :key="i" class="flex gap-2 py-0.5"><span class="muted w-12 shrink-0 font-mono">{{ e.t.toFixed(1) }} s</span><span>{{ e.level === 'warn' ? '⚠️' : '•' }} {{ e.text }}</span></li>
          <li v-if="!visibleEvents.length" class="muted">Nothing special yet.</li>
        </ol>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.confetti {
  position: absolute;
  top: -12px;
  width: 10px;
  height: 16px;
  border-radius: 3px;
  animation: fall 2.2s ease-in forwards;
}
@keyframes fall {
  to {
    top: 105%;
    transform: rotate(540deg);
  }
}
</style>
