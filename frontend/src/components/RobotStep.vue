<script setup lang="ts">
import { computed, ref } from 'vue'
import { PORTS, type Port } from '@/core/catalog'
import { ATTACHMENTS, defaultToolPort, hasOverrides, ROBOT_BY_ID, ROBOTS, wheelCircumferenceMm, type AttachmentInstance, type AttachmentKind, type RobotOverrides } from '@/core/robots'
import { suggestRobot } from '@/core/suggest'
import { useLab } from '@/stores/lab'
import RobotPreview from './RobotPreview.vue'

const lab = useLab()
const emit = defineEmits<{ done: [] }>()

const data = computed(() => lab.data!)
const suggestion = computed(() => suggestRobot(data.value.program))
const showAdvanced = ref(false)

const TOOLS: AttachmentKind[] = ['fork', 'wide_fork', 'dozer', 'lift_arm', 'grabber', 'bumper', 'custom', 'hook']
const SENSORS: AttachmentKind[] = ['color_sensor', 'distance_sensor', 'force_sensor']
const toolIcons: Record<string, string> = { fork: '🍴', wide_fork: '🔱', dozer: '🚜', lift_arm: '🏗️', grabber: '🦀', bumper: '🛡️', custom: '🧱', color_sensor: '🌈', distance_sensor: '👀', force_sensor: '👆' }

const builtIn = computed(() => new Set(ROBOT_BY_ID[data.value.robotId].defaultAttachments.map((a) => a.uid)))
const tool = computed(() => data.value.attachments.find((a) => ATTACHMENTS[a.kind].group === 'tool' && !builtIn.value.has(a.uid)) ?? null)
const builtInTool = computed(() => data.value.attachments.find((a) => ATTACHMENTS[a.kind].group === 'tool' && builtIn.value.has(a.uid)) ?? null)
const hasSensor = (kind: AttachmentKind) => data.value.attachments.some((a) => a.kind === kind)

function pickRobot(id: string) {
  lab.change((d) => {
    if (d.robotId !== id) {
      const keep = d.attachments.filter((a) => !ROBOT_BY_ID[d.robotId].defaultAttachments.some((x) => x.uid === a.uid) && !ATTACHMENTS[a.kind].motorised && !ATTACHMENTS[a.kind].sensor)
      const defaults = ROBOT_BY_ID[id].defaultAttachments.map((a) => ({ ...a }))
      // a robot that already has a built-in tool (Driving Base 2's arm) keeps only that one
      d.attachments = defaults.some((a) => ATTACHMENTS[a.kind].group === 'tool') ? defaults : [...defaults, ...keep.map((a) => ({ ...a, port: null }))]
      d.robotId = id
      d.overrides = {}
    }
    d.robotConfirmed = true
  })
}

function pickTool(kind: AttachmentKind | null) {
  lab.change((d) => {
    d.attachments = d.attachments.filter((a) => ATTACHMENTS[a.kind].group !== 'tool' || builtIn.value.has(a.uid))
    if (kind) d.attachments.push({ uid: 'tool', kind, port: ATTACHMENTS[kind].motorised ? defaultToolPort(lab.robot, kind) : null })
  })
}

function toggleSensor(kind: AttachmentKind) {
  lab.change((d) => {
    const existing = d.attachments.filter((a) => a.kind === kind)
    if (existing.length) d.attachments = d.attachments.filter((a) => a.kind !== kind)
    else d.attachments.push({ uid: `s-${kind}`, kind, port: defaultToolPort(lab.robot, kind), slot: 0 })
  })
}

function setPort(a: AttachmentInstance, value: string) {
  lab.change((d) => {
    const hit = d.attachments.find((x) => x.uid === a.uid)
    if (hit) hit.port = value ? (value as Port) : null
  })
}

function setSize(a: AttachmentInstance, key: 'widthMm' | 'lengthMm', e: Event) {
  const cm = Number((e.target as HTMLInputElement).value)
  if (!Number.isFinite(cm) || cm <= 0) return
  lab.change((d) => {
    const hit = d.attachments.find((x) => x.uid === a.uid)
    if (hit) hit[key] = Math.min(300, Math.max(10, cm * 10))
  })
}

function setOverride<K extends keyof RobotOverrides>(key: K, value: RobotOverrides[K] | undefined) {
  lab.change((d) => {
    if (value === undefined || value === ROBOT_BY_ID[d.robotId][key as 'wheelDiameterMm']) delete d.overrides[key]
    else d.overrides[key] = value
  })
}
function numOverride(key: 'wheelDiameterMm' | 'trackWidthMm', e: Event) {
  const mm = Number((e.target as HTMLInputElement).value)
  setOverride(key, Number.isFinite(mm) && mm > 5 ? mm : undefined)
}

// which ports are claimed twice? (a real hub has one thing per port)
const portClashes = computed(() => {
  const used = new Map<string, number>()
  const add = (p: string | null) => p && used.set(p, (used.get(p) ?? 0) + 1)
  add(lab.robot.drive.left.port)
  add(lab.robot.drive.right.port)
  data.value.attachments.forEach((a) => add(a.port))
  return [...used.entries()].filter(([, n]) => n > 1).map(([p]) => p)
})
const missingPort = computed(() => data.value.attachments.filter((a) => (ATTACHMENTS[a.kind].motorised || ATTACHMENTS[a.kind].sensor) && !a.port))
</script>

<template>
  <div class="scroll-y h-full" data-testid="robot-step">
    <div class="mx-auto flex max-w-5xl flex-col gap-4 px-3 pb-8">
      <div>
        <h2 class="text-2xl font-black">Which robot did you build?</h2>
        <p class="notice mt-2 font-bold" :class="suggestion.evidence ? 'notice-good' : 'notice-warn'" data-testid="robot-suggestion">
          💡 {{ suggestion.reason }}
          <span v-if="!data.robotConfirmed" class="muted block text-sm font-semibold">Tap a robot to confirm.</span>
        </p>
      </div>

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4" role="radiogroup" aria-label="Robot">
        <button
          v-for="r in ROBOTS"
          :key="r.id"
          class="card relative flex flex-col items-center gap-1 p-3 text-center transition active:scale-[0.98]"
          :class="data.robotId === r.id ? (data.robotConfirmed ? 'border-sun! bg-panel2!' : 'border-dashed! border-sun!') : ''"
          role="radio"
          :aria-checked="data.robotId === r.id"
          :data-testid="`robot-${r.id}`"
          @click="pickRobot(r.id)"
        >
          <!-- phones: the badges wrap in a row so they never overlap; wider: pinned to the corners -->
          <div class="flex w-full flex-wrap justify-between gap-1 sm:contents">
            <span v-if="suggestion.robotId === r.id && suggestion.evidence" class="chip chip-sky sm:absolute sm:left-2 sm:top-2" data-testid="robot-suggested">suggested</span>
            <span v-if="data.robotId === r.id" class="chip sm:absolute sm:right-2 sm:top-2" :class="data.robotConfirmed ? 'chip-leaf' : 'chip-flag'" data-testid="robot-state">{{ data.robotConfirmed ? '✓ chosen' : 'not confirmed' }}</span>
          </div>
          <RobotPreview :robot="r" :attachments="r.defaultAttachments" ports class="h-32 w-full sm:mt-5" />
          <span class="text-lg font-black leading-tight">{{ r.name }}</span>
          <span class="muted text-sm leading-snug">{{ r.tagline }}</span>
          <span class="muted text-xs">wheels on {{ r.drive.left.port }}+{{ r.drive.right.port }} · {{ (wheelCircumferenceMm(r) / 10).toFixed(1) }} cm per turn</span>
        </button>
      </div>

      <section class="card p-3">
        <h3 class="text-lg font-black">Add a tool to the front <span class="muted text-sm font-bold">(optional)</span></h3>
        <p v-if="builtInTool" class="muted text-sm">{{ lab.robot.name }} already has its {{ ATTACHMENTS[builtInTool.kind].name.toLowerCase() }} on motor {{ builtInTool.port }}.</p>
        <div v-else class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Front tool">
          <button class="btn btn-ghost flex-col py-2" :class="{ 'is-on': !tool }" role="radio" :aria-checked="!tool" data-testid="tool-none" @click="pickTool(null)"><span class="text-2xl">🚫</span>No tool</button>
          <button v-for="k in TOOLS" :key="k" class="btn btn-ghost flex-col py-2" :class="{ 'is-on': tool?.kind === k }" role="radio" :aria-checked="tool?.kind === k" :data-testid="`tool-${k}`" @click="pickTool(k)">
            <span class="text-2xl" aria-hidden="true">{{ toolIcons[k] }}</span>{{ ATTACHMENTS[k].name }}
          </button>
        </div>
        <div v-if="tool" class="mt-3 flex flex-wrap items-center gap-3">
          <RobotPreview :robot="lab.robot" :attachments="data.attachments" class="h-36 w-36 shrink-0 rounded-xl bg-deep" />
          <div class="min-w-48 flex-1">
            <p class="font-bold">{{ ATTACHMENTS[tool.kind].description }}</p>
            <p class="chip chip-est mt-1">≈ {{ ATTACHMENTS[tool.kind].approximations }}</p>
            <div v-if="tool.kind === 'custom' || tool.kind === 'hook'" class="mt-2 flex flex-wrap gap-3">
              <label class="font-bold">wide <input class="field ml-1 inline w-20" inputmode="decimal" :value="(tool.widthMm ?? ATTACHMENTS.custom.widthMm) / 10" aria-label="Tool width in cm" @change="setSize(tool, 'widthMm', $event)" /> cm</label>
              <label class="font-bold">long <input class="field ml-1 inline w-20" inputmode="decimal" :value="(tool.lengthMm ?? ATTACHMENTS.custom.lengthMm) / 10" aria-label="Tool length in cm" @change="setSize(tool, 'lengthMm', $event)" /> cm</label>
            </div>
            <p v-if="ATTACHMENTS[tool.kind].motorised" class="mt-2 font-bold">
              Its motor is on port
              <select class="field ml-1 inline w-20" :value="tool.port ?? ''" aria-label="Tool motor port" data-testid="tool-port" @change="setPort(tool, ($event.target as HTMLSelectElement).value)">
                <option v-for="p in PORTS" :key="p" :value="p">{{ p }}</option>
              </select>
            </p>
          </div>
        </div>
      </section>

      <section class="card p-3">
        <h3 class="text-lg font-black">Sensors <span class="muted text-sm font-bold">(optional)</span></h3>
        <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button v-for="k in SENSORS" :key="k" class="btn btn-ghost justify-start" :class="{ 'is-on': hasSensor(k) }" :aria-pressed="hasSensor(k)" :data-testid="`sensor-${k}`" @click="toggleSensor(k)">
            <span class="text-2xl" aria-hidden="true">{{ toolIcons[k] }}</span>
            <span class="text-left leading-tight">{{ ATTACHMENTS[k].name }}<span class="block text-xs font-semibold opacity-80">{{ hasSensor(k) ? `on port ${data.attachments.filter((a) => a.kind === k).map((a) => a.port ?? '?').join(' + ')}` : 'not fitted' }}</span></span>
          </button>
        </div>
      </section>

      <p v-if="portClashes.length" class="notice notice-warn font-bold" role="alert">⚠️ Port {{ portClashes.join(', ') }} is used by more than one thing. On a real hub each port holds one cable. Fix it under “Ports and calibration”.</p>
      <p v-if="missingPort.length" class="notice notice-warn font-bold" role="alert">⚠️ Choose a port for: {{ missingPort.map((a) => ATTACHMENTS[a.kind].name).join(', ') }}.</p>

      <section class="card p-3">
        <button class="flex min-h-12 w-full items-center justify-between text-left text-lg font-black" :aria-expanded="showAdvanced" data-testid="robot-advanced" @click="showAdvanced = !showAdvanced">
          <span>🔧 Ports and calibration</span><span>{{ showAdvanced ? '▲' : '▼' }}</span>
        </button>
        <div v-if="showAdvanced" class="mt-2 flex flex-col gap-3">
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label class="text-sm font-bold">Left wheel motor
              <select class="field mt-1" :value="lab.robot.drive.left.port" data-testid="left-port" @change="setOverride('leftPort', ($event.target as HTMLSelectElement).value as Port)"><option v-for="p in PORTS" :key="p">{{ p }}</option></select>
            </label>
            <label class="text-sm font-bold">Right wheel motor
              <select class="field mt-1" :value="lab.robot.drive.right.port" data-testid="right-port" @change="setOverride('rightPort', ($event.target as HTMLSelectElement).value as Port)"><option v-for="p in PORTS" :key="p">{{ p }}</option></select>
            </label>
            <label class="text-sm font-bold">Wheel size (mm across)
              <input class="field mt-1" inputmode="decimal" :value="Number(lab.robot.wheelDiameterMm.toFixed(2))" data-testid="wheel-diameter" @change="numOverride('wheelDiameterMm', $event)" />
            </label>
            <label class="text-sm font-bold">Between the wheels (mm)
              <input class="field mt-1" inputmode="decimal" :value="lab.robot.trackWidthMm" data-testid="track-width" @change="numOverride('trackWidthMm', $event)" />
            </label>
          </div>
          <div v-for="a in data.attachments.filter((x) => ATTACHMENTS[x.kind].sensor || ATTACHMENTS[x.kind].motorised || ATTACHMENTS[x.kind].optionalMotor)" :key="a.uid" class="flex items-center gap-2">
            <span class="flex-1 font-bold">{{ ATTACHMENTS[a.kind].name }}</span>
            <select class="field w-36" :value="a.port ?? ''" :aria-label="`${ATTACHMENTS[a.kind].name} port`" @change="setPort(a, ($event.target as HTMLSelectElement).value)">
              <option v-if="ATTACHMENTS[a.kind].optionalMotor" value="">no motor</option>
              <option v-for="p in PORTS" :key="p" :value="p">port {{ p }}</option>
            </select>
          </div>
          <button v-if="hasOverrides(data.overrides)" class="btn btn-ghost btn-sm self-start" @click="lab.change((d) => (d.overrides = {}))">↩ Back to the standard {{ ROBOT_BY_ID[data.robotId].name }}</button>
          <div class="grid gap-3 text-sm sm:grid-cols-2">
            <div class="notice notice-good">
              <p class="font-black">✓ From official LEGO material</p>
              <ul class="m-0 list-disc pl-5"><li v-for="v in lab.robot.accuracy.verified" :key="v">{{ v }}</li></ul>
            </div>
            <div class="notice notice-warn">
              <p class="font-black">≈ Our best estimate</p>
              <ul class="m-0 list-disc pl-5"><li v-for="v in lab.robot.accuracy.approximate" :key="v">{{ v }}</li></ul>
              <p class="mt-1">Measure your own robot and type the numbers above to make the simulation match.</p>
            </div>
          </div>
        </div>
      </section>

      <div class="flex justify-end">
        <button class="btn btn-sun btn-xl" data-testid="robot-confirm" @click="(pickRobot(data.robotId), emit('done'))">This is my robot ✓</button>
      </div>
    </div>
  </div>
</template>
