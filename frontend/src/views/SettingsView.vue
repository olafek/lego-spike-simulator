<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import { gridChoices, type DisplayUnit } from '@/core/units'
import { hasOverrides, wheelCircumferenceMm } from '@/core/robots'
import { useLab } from '@/stores/lab'
import { useSession } from '@/stores/session'

const lab = useLab()
const session = useSession()

interface Counter {
  limitPerHour: number
  used: number
  remaining: number
  resetsInSeconds: number
}
const usage = ref<Record<string, Counter> | null>(null)
const vision = ref<{ driver: string; model: string | null; live: boolean } | null>(null)
const s = computed(() => lab.data?.settings)

function setUnit(u: DisplayUnit) {
  lab.change((d) => {
    d.settings.unit = u
    const g = gridChoices(u)[1]
    d.settings.gridMajorMm = g.majorMm
    d.settings.gridMinorMm = g.minorMm
  }, false)
}

function num(key: 'slip' | 'maxSeconds', e: Event, min: number, max: number, scale = 1) {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v)) lab.change((d) => (d.settings[key] = Math.min(max, Math.max(min, v * scale))))
}

onMounted(async () => {
  try {
    const u = await api.usage()
    usage.value = (u.usage as Record<string, Counter>) ?? null
    vision.value = (u.vision as typeof vision.value) ?? null
  } catch {
    usage.value = null
  }
})
</script>

<template>
  <div class="scroll-y h-full" data-testid="settings-view">
    <div class="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-10">
      <h1 class="text-3xl font-black">Settings</h1>

      <section v-if="lab.data && s" class="card flex flex-col gap-4 p-4">
        <h2 class="text-xl font-black">This project: {{ lab.name }}</h2>

        <div>
          <p class="font-bold">Units</p>
          <div class="mt-1 flex gap-2">
            <button class="btn btn-ghost" :class="{ 'is-on': s.unit === 'cm' }" :aria-pressed="s.unit === 'cm'" @click="setUnit('cm')">Centimetres (cm)</button>
            <button class="btn btn-ghost" :class="{ 'is-on': s.unit === 'in' }" :aria-pressed="s.unit === 'in'" @click="setUnit('in')">Inches</button>
          </div>
          <p class="muted mt-1 text-sm">New projects always start in centimetres.</p>
        </div>

        <div>
          <p class="font-bold">How does the hub measure distance?</p>
          <div class="mt-1 flex flex-col gap-2" role="radiogroup" aria-label="Calibration">
            <button class="btn btn-ghost justify-start text-left" :class="{ 'is-on': s.calibration === 'ideal' }" role="radio" :aria-checked="s.calibration === 'ideal'" data-testid="calibration-ideal" @click="lab.change((d) => (d.settings.calibration = 'ideal'))">
              <span><b>Perfect wheels</b> – the hub knows this robot's wheel size ({{ (wheelCircumferenceMm(lab.robot) / 10).toFixed(2) }} cm per turn). 30 cm is exactly 30 cm.</span>
            </button>
            <button class="btn btn-ghost justify-start text-left" :class="{ 'is-on': s.calibration === 'hardware' }" role="radio" :aria-checked="s.calibration === 'hardware'" data-testid="calibration-hardware" @click="lab.change((d) => (d.settings.calibration = 'hardware'))">
              <span><b>Like a new hub</b> – it assumes 17.5 cm per wheel turn unless your program sets it. Distances can be a little off, like on the real robot.</span>
            </button>
          </div>
        </div>

        <label class="font-bold">Wheel slip: {{ Math.round(s.slip * 100) }} %
          <input type="range" class="mt-1 block h-11 w-full accent-(--color-sun)" min="0" max="30" step="1" :value="Math.round(s.slip * 100)" data-testid="slip" @input="num('slip', $event, 0, 0.3, 0.01)" />
          <span class="muted block text-sm font-semibold">0 % is a perfect floor. Anything above 0 makes every distance an estimate.</span>
        </label>

        <label class="font-bold">Stop a never-ending program after
          <input class="field ml-1 inline w-24" inputmode="numeric" :value="s.maxSeconds" data-testid="max-seconds" @change="num('maxSeconds', $event, 5, 300)" /> seconds
        </label>

        <p class="muted text-sm">
          Robot ports, wheel size and the distance between the wheels are under <b>Robot → Ports and calibration</b>.
          <span v-if="hasOverrides(lab.data.overrides)" class="chip chip-est ml-1">custom calibration in use</span>
        </p>
      </section>
      <p v-else class="notice">Open a project to change its units and calibration.</p>

      <section class="card flex flex-col gap-2 p-4" data-testid="diagnostics">
        <h2 class="text-xl font-black">Lab check-up</h2>
        <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt class="muted">Picture reader</dt>
          <dd class="m-0 font-bold">{{ session.info?.vision.live ? `on (${vision?.driver ?? session.info.vision.driver}${vision?.model ? `, ${vision.model}` : ''})` : 'practice mode – stored example only' }}</dd>
          <dt class="muted">Explain helper</dt>
          <dd class="m-0 font-bold">{{ session.info?.assistant.available ? 'on' : 'off' }}</dd>
          <dt class="muted">Biggest picture</dt>
          <dd class="m-0 font-bold">{{ session.info?.limits.maxUploadMb }} MB, {{ session.info?.limits.maxScreenshotsPerProject }} per program</dd>
          <template v-if="usage">
            <template v-for="(c, key) in usage" :key="key">
              <dt class="muted">{{ key === 'ai' ? 'AI helper uses this hour' : key === 'upload' ? 'Uploads this hour' : 'New projects this hour' }}</dt>
              <dd class="m-0 font-bold">{{ c.used }} of {{ c.limitPerHour }}</dd>
            </template>
          </template>
        </dl>
        <p class="muted text-sm">The limits are set by your teacher on the server. They keep the lab fast and stop surprise costs.</p>
      </section>

      <section class="card p-4 text-sm">
        <h2 class="text-xl font-black">Good to know</h2>
        <ul class="m-0 mt-1 list-disc pl-5">
          <li>The robot's movement is calculated with maths, not made up by AI. AI only reads your screenshot and can explain blocks.</li>
          <li>Pushing, lifting and grabbing are simplified. Things slide but do not tip over or spin.</li>
          <li>Old projects and their screenshots are deleted automatically after a while.</li>
        </ul>
      </section>
    </div>
  </div>
</template>
