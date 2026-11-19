<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ApiError } from '@/lib/api'
import { ACCEPT_ATTR, cropImage, fetchBlob, looksLikeImage, prepareForUpload, rotateImage } from '@/lib/image'
import { useLab } from '@/stores/lab'
import { useSession } from '@/stores/session'

const lab = useLab()
const session = useSession()
const emit = defineEmits<{ changed: [] }>()

const current = ref(0)
const busy = ref('')
const error = ref('')
const picker = ref<HTMLInputElement | null>(null)

const shots = computed(() => lab.screenshots)
const shot = computed(() => shots.value[Math.min(current.value, shots.value.length - 1)] ?? null)
const max = computed(() => session.info?.limits.maxScreenshotsPerProject ?? 6)
watch(shots, (s) => {
  if (current.value >= s.length) current.value = Math.max(0, s.length - 1)
})

// crop: drag the four edges with big handles, or drag a new box
const cropping = ref(false)
const box = ref({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 })
const frame = ref<HTMLElement | null>(null)
let drag: { mode: 'new' | 'move'; sx: number; sy: number; start: typeof box.value } | null = null

function rel(e: PointerEvent) {
  const r = frame.value!.getBoundingClientRect()
  return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
}
function cropDown(e: PointerEvent) {
  if (!cropping.value) return
  const p = rel(e)
  const b = box.value
  const inside = p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h
  drag = { mode: inside ? 'move' : 'new', sx: p.x, sy: p.y, start: { ...b } }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function cropMove(e: PointerEvent) {
  if (!drag) return
  const p = rel(e)
  if (drag.mode === 'move') {
    box.value = {
      ...drag.start,
      x: Math.min(1 - drag.start.w, Math.max(0, drag.start.x + p.x - drag.sx)),
      y: Math.min(1 - drag.start.h, Math.max(0, drag.start.y + p.y - drag.sy)),
    }
  } else {
    box.value = { x: Math.min(p.x, drag.sx), y: Math.min(p.y, drag.sy), w: Math.max(0.05, Math.abs(p.x - drag.sx)), h: Math.max(0.05, Math.abs(p.y - drag.sy)) }
  }
}
function nudge(edge: 'x' | 'y' | 'w' | 'h', d: number) {
  const b = { ...box.value }
  if (edge === 'x') {
    const nx = Math.min(b.x + b.w - 0.05, Math.max(0, b.x + d))
    b.w += b.x - nx
    b.x = nx
  } else if (edge === 'y') {
    const ny = Math.min(b.y + b.h - 0.05, Math.max(0, b.y + d))
    b.h += b.y - ny
    b.y = ny
  } else if (edge === 'w') b.w = Math.min(1 - b.x, Math.max(0.05, b.w + d))
  else b.h = Math.min(1 - b.y, Math.max(0.05, b.h + d))
  box.value = b
}

async function work(label: string, fn: () => Promise<void>) {
  if (busy.value) return
  busy.value = label
  error.value = ''
  try {
    await fn()
    emit('changed')
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : 'That did not work. Please try again.'
  } finally {
    busy.value = ''
  }
}

const rotate = (turns: number) =>
  work('Turning…', async () => {
    const s = shot.value
    if (!s) return
    const blob = await rotateImage(await fetchBlob(s.url), turns)
    await lab.uploadScreenshot(blob, 'rotated.png', s.id)
  })

const applyCrop = () =>
  work('Cropping…', async () => {
    const s = shot.value
    if (!s) return
    const blob = await cropImage(await fetchBlob(s.url), box.value)
    await lab.uploadScreenshot(blob, 'cropped.png', s.id)
    cropping.value = false
  })

const remove = () =>
  work('Removing…', async () => {
    if (shot.value) await lab.deleteScreenshot(shot.value.id)
  })

const move = (delta: -1 | 1) =>
  work('Moving…', async () => {
    const s = shot.value
    if (!s) return
    await lab.moveScreenshot(s.id, delta)
    current.value = Math.min(shots.value.length - 1, Math.max(0, current.value + delta))
  })

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])].filter(looksLikeImage)
  input.value = ''
  if (!files.length) return
  void work('Adding…', async () => {
    for (const f of files) {
      if (shots.value.length >= max.value) throw new Error(`You can use up to ${max.value} screenshots for one program.`)
      const p = await prepareForUpload(f, session.info?.limits.maxImageDimension ?? 4096)
      await lab.uploadScreenshot(p.blob, p.name)
    }
    current.value = shots.value.length - 1
  })
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-2" data-testid="screenshot-panel">
    <div class="flex items-center gap-2">
      <h2 class="text-lg font-black">Your screenshot</h2>
      <span v-if="shots.length > 1" class="chip">{{ current + 1 }} of {{ shots.length }}</span>
      <span v-if="busy" class="chip chip-sky" role="status">{{ busy }}</span>
    </div>

    <div v-if="shot" class="relative min-h-40 flex-1 overflow-auto rounded-2xl border-2 border-line bg-black/30">
      <div ref="frame" class="relative mx-auto w-fit max-w-full touch-none select-none" @pointerdown="cropDown" @pointermove="cropMove" @pointerup="drag = null" @pointercancel="drag = null">
        <img :src="shot.url" alt="Your SPIKE program screenshot" class="block max-h-[70dvh] max-w-full" draggable="false" data-testid="screenshot-image" />
        <template v-if="cropping">
          <div class="pointer-events-none absolute inset-0 bg-black/55" :style="{ clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 0,${box.x * 100}% ${box.y * 100}%,${box.x * 100}% ${(box.y + box.h) * 100}%,${(box.x + box.w) * 100}% ${(box.y + box.h) * 100}%,${(box.x + box.w) * 100}% ${box.y * 100}%,${box.x * 100}% ${box.y * 100}%)` }" />
          <div class="pointer-events-none absolute border-4 border-sun" :style="{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }" />
        </template>
      </div>
    </div>
    <div v-else class="notice flex-1 text-center">
      <p class="font-bold">No screenshot here yet.</p>
      <p class="muted text-sm">Add one, or just build your blocks by hand.</p>
    </div>

    <div v-if="cropping" class="card flex flex-col gap-2 p-2" data-testid="crop-tools">
      <p class="text-sm font-bold">Drag on the picture to draw the part to keep, or use the buttons.</p>
      <div class="grid grid-cols-4 gap-1.5">
        <button class="btn btn-ghost btn-sm" aria-label="Move left edge in" @click="nudge('x', 0.05)">⇥ left</button>
        <button class="btn btn-ghost btn-sm" aria-label="Move right edge in" @click="nudge('w', -0.05)">right ⇤</button>
        <button class="btn btn-ghost btn-sm" aria-label="Move top edge down" @click="nudge('y', 0.05)">⤓ top</button>
        <button class="btn btn-ghost btn-sm" aria-label="Move bottom edge up" @click="nudge('h', -0.05)">bottom ⤒</button>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-sun btn-sm flex-1" :disabled="!!busy" data-testid="crop-apply" @click="applyCrop">✂️ Keep this part</button>
        <button class="btn btn-ghost btn-sm" @click="cropping = false">Cancel</button>
      </div>
    </div>

    <div v-else class="flex flex-wrap gap-2">
      <template v-if="shot">
        <button class="btn btn-ghost btn-sm" :disabled="!!busy" aria-label="Turn left" data-testid="rotate-left" @click="rotate(-1)">↺</button>
        <button class="btn btn-ghost btn-sm" :disabled="!!busy" aria-label="Turn right" data-testid="rotate-right" @click="rotate(1)">↻</button>
        <button class="btn btn-ghost btn-sm" :disabled="!!busy" data-testid="crop-start" @click="((box = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 }), (cropping = true))">✂️ Crop</button>
        <button class="btn btn-ghost btn-sm" :disabled="!!busy" aria-label="Delete this screenshot" data-testid="delete-screenshot" @click="remove">🗑</button>
      </template>
      <input ref="picker" type="file" class="sr-only" :accept="ACCEPT_ATTR" multiple aria-label="Add screenshots" data-testid="add-screenshot-input" @change="onPick" />
      <button class="btn btn-ghost btn-sm" :disabled="!!busy || shots.length >= max" @click="picker?.click()">＋ Add picture</button>
    </div>

    <!-- order matters: the program is read from the first picture to the last -->
    <div v-if="shots.length > 1" class="flex items-center gap-2 overflow-x-auto pb-1" data-testid="screenshot-strip">
      <button class="btn btn-ghost btn-sm" :disabled="!!busy || current === 0" aria-label="Move this picture earlier" @click="move(-1)">◀ earlier</button>
      <button
        v-for="(s, i) in shots"
        :key="s.id"
        class="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl border-4"
        :class="i === current ? 'border-sun' : 'border-line'"
        :aria-label="`Show screenshot ${i + 1}`"
        :aria-pressed="i === current"
        @click="current = i"
      >
        <img :src="s.url" alt="" class="h-full w-full object-cover" />
        <span class="absolute left-0.5 top-0.5 rounded-md bg-night/85 px-1.5 text-xs font-black">{{ i + 1 }}</span>
      </button>
      <button class="btn btn-ghost btn-sm" :disabled="!!busy || current === shots.length - 1" aria-label="Move this picture later" @click="move(1)">later ▶</button>
    </div>

    <p v-if="error" role="alert" class="notice notice-bad text-sm font-bold">{{ error }}</p>
  </div>
</template>
