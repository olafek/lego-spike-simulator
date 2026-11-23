<script setup lang="ts">
// "Table picture": a photo of a real table becomes the floor of a walled mat.
// Choose a photo → put a dot on each corner of the mat → check the straightened picture → use it.
// The photo is straightened here in the browser; only the finished mat rectangle is uploaded.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { isProperQuad, matPictureSize, type Pt, type Quad } from '@/core/homography'
import { matSize } from '@/core/scene'
import { ApiError } from '@/lib/api'
import { ACCEPT_ATTR } from '@/lib/image'
import { openPhoto, straightenPhoto } from '@/lib/straighten'
import { useLab } from '@/stores/lab'
import { useSession } from '@/stores/session'

const lab = useLab()
const session = useSession()

type Stage = 'idle' | 'corners' | 'preview'
const stage = ref<Stage>('idle')
const busy = ref(false)
const error = ref('')

const size = computed(() => (lab.data ? matSize(lab.data.scene.mat) : null))
/** how far outside the photo a dot may go, as a fraction of the photo */
const OUTSIDE = 0.25
const CORNER_NAMES = ['top left', 'top right', 'bottom right', 'bottom left']

let photo: HTMLCanvasElement | null = null
const photoUrl = ref('')
const photoAspect = ref(1)
/** the four dots, as fractions of the photo (0…1, a little outside is allowed) */
const corners = ref<Pt[]>([])
const active = ref<number | null>(null)
const photoEl = ref<HTMLElement | null>(null)
/** the area the photo may fill (it leaves a margin so a dot can sit outside the photo) */
const areaEl = ref<HTMLElement | null>(null)
const fit = ref({ w: 0, h: 0 })
let areaObserver: ResizeObserver | null = null
function measure() {
  const el = areaEl.value
  if (!el) return
  const w = el.clientWidth * (1 - 2 * 0.09)
  const h = el.clientHeight * (1 - 2 * 0.09)
  const k = Math.min(w / photoAspect.value, h)
  fit.value = { w: Math.max(1, k * photoAspect.value), h: Math.max(1, k) }
}
watch(areaEl, (el) => {
  areaObserver?.disconnect()
  areaObserver = null
  if (!el) return
  areaObserver = new ResizeObserver(measure)
  areaObserver.observe(el)
  measure()
})

const previewUrl = ref('')
let previewBlob: Blob | null = null

const quad = computed(() => corners.value as unknown as Quad)
const proper = computed(() => corners.value.length === 4 && isProperQuad(quad.value))
const outline = computed(() => corners.value.map((c) => `${c.x * 100},${c.y * 100}`).join(' '))

function forget(url: string) {
  if (url) URL.revokeObjectURL(url)
}
function close() {
  stage.value = 'idle'
  forget(photoUrl.value)
  forget(previewUrl.value)
  photoUrl.value = ''
  previewUrl.value = ''
  photo = null
  previewBlob = null
  active.value = null
}
onBeforeUnmount(() => {
  areaObserver?.disconnect()
  close()
})

async function choose(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  error.value = ''
  busy.value = true
  try {
    photo = await openPhoto(file)
    photoAspect.value = photo.width / photo.height
    const blob = await new Promise<Blob | null>((resolve) => photo!.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) throw new Error('This picture could not be opened.')
    photoUrl.value = URL.createObjectURL(blob)
    corners.value = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]
    stage.value = 'corners'
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'This picture could not be opened.'
    close()
  } finally {
    busy.value = false
  }
}

const clamp = (v: number) => Math.min(1 + OUTSIDE, Math.max(-OUTSIDE, v))
function moveTo(i: number, clientX: number, clientY: number) {
  const rect = photoEl.value?.getBoundingClientRect()
  if (!rect || rect.width === 0) return
  corners.value[i] = { x: clamp((clientX - rect.left) / rect.width), y: clamp((clientY - rect.top) / rect.height) }
}
function grab(i: number, e: PointerEvent) {
  active.value = i
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
}
function drag(i: number, e: PointerEvent) {
  if (active.value === i && (e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) moveTo(i, e.clientX, e.clientY)
}
function nudge(i: number, e: KeyboardEvent) {
  const step = e.shiftKey ? 0.02 : 0.004
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
  if (!d) return
  e.preventDefault()
  const c = corners.value[i]
  corners.value[i] = { x: clamp(c.x + d[0]), y: clamp(c.y + d[1]) }
}

/** the magnifier: the photo three times larger, centred on the dot being moved */
const lens = computed(() => {
  const i = active.value
  const rect = photoEl.value?.getBoundingClientRect()
  if (i === null || !rect) return null
  const zoom = 3
  const sizePx = 132
  const c = corners.value[i]
  return {
    side: c.x < 0.5 ? 'right' : 'left',
    style: {
      width: `${sizePx}px`,
      height: `${sizePx}px`,
      backgroundImage: `url(${photoUrl.value})`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: `${rect.width * zoom}px ${rect.height * zoom}px`,
      backgroundPosition: `${sizePx / 2 - c.x * rect.width * zoom}px ${sizePx / 2 - c.y * rect.height * zoom}px`,
    },
  }
})

async function toPreview() {
  if (!photo || !size.value || !proper.value) return
  busy.value = true
  error.value = ''
  try {
    const px = matPictureSize(size.value, Math.min(session.info?.limits.maxImageDimension ?? 2400, 2400))
    const inPhoto = corners.value.map((c) => ({ x: c.x * photo!.width, y: c.y * photo!.height })) as Quad
    previewBlob = await straightenPhoto(photo, inPhoto, px, [238, 241, 251])
    forget(previewUrl.value)
    previewUrl.value = URL.createObjectURL(previewBlob)
    stage.value = 'preview'
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'That did not work. Move the dots and try again.'
  } finally {
    busy.value = false
  }
}

async function use() {
  if (!previewBlob) return
  busy.value = true
  error.value = ''
  try {
    await lab.setMatPicture(previewBlob)
    close()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'The picture could not be saved. Please try again.'
  } finally {
    busy.value = false
  }
}

async function remove() {
  busy.value = true
  error.value = ''
  try {
    await lab.removeMatPicture()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'The picture could not be removed. Please try again.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section v-if="size" class="card p-3" data-testid="mat-picture-panel">
    <h3 class="mb-1 font-extrabold">Table picture</h3>

    <template v-if="lab.matImage">
      <div class="flex flex-wrap items-center gap-2">
        <img :src="lab.matImage.url" alt="The picture of the table used as the floor" class="h-14 rounded-lg border-2 border-line" />
        <button class="btn btn-ghost btn-sm" :disabled="busy" data-testid="mat-picture-remove" @click="remove">Remove picture</button>
      </div>
      <p class="muted mt-2 text-xs">≈ The picture is a straightened photo. Places on it are only as exact as the photo and the four corners.</p>
    </template>
    <template v-else>
      <p class="muted mb-2 text-sm">Use a photo of a real table as the floor. Take it from above, with all four corners of the mat in view if you can.</p>
      <label class="btn btn-ghost btn-sm cursor-pointer" :class="{ 'opacity-60': busy }">
        📷 Choose a photo
        <input type="file" class="sr-only" :accept="ACCEPT_ATTR" :disabled="busy" data-testid="mat-picture-choose" @change="choose" />
      </label>
    </template>
    <p v-if="error && stage === 'idle'" class="notice notice-warn mt-2 text-sm font-bold" role="alert" data-testid="mat-picture-error">{{ error }}</p>

    <!-- corners and preview: a full-screen sheet, so the photo is as large as the screen allows -->
    <div v-if="stage !== 'idle'" class="fixed inset-0 z-40 flex flex-col gap-2 bg-night p-3" role="dialog" aria-modal="true" aria-label="Table picture">
      <template v-if="stage === 'corners'">
        <p class="shrink-0 font-black">Put each dot on a corner of the mat.</p>
        <p v-if="!proper" class="notice notice-warn shrink-0 text-sm font-bold" role="alert">The four corners must make a four-sided shape. Move the dots apart.</p>
        <div ref="areaEl" class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          <div ref="photoEl" class="relative shrink-0 touch-none select-none" :style="{ width: `${fit.w}px`, height: `${fit.h}px` }" data-testid="corner-photo">
            <img :src="photoUrl" alt="" class="absolute inset-0 h-full w-full rounded" draggable="false" />
            <svg class="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polygon :points="outline" fill="rgba(255,210,63,0.12)" :stroke="proper ? '#ffd23f' : '#ff5d6c'" stroke-width="2" vector-effect="non-scaling-stroke" />
            </svg>
            <button
              v-for="(c, i) in corners"
              :key="i"
              type="button"
              class="absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-full border-2 border-night bg-sun/80 text-sm font-black text-sunink shadow-lg"
              :class="{ 'ring-4 ring-sky': active === i }"
              :style="{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }"
              :aria-label="`Corner ${i + 1}: ${CORNER_NAMES[i]}. Drag it, or use the arrow keys.`"
              :data-testid="`corner-${i}`"
              @pointerdown="grab(i, $event)"
              @pointermove="drag(i, $event)"
              @pointerup="active = null"
              @pointercancel="active = null"
              @keydown="nudge(i, $event)"
            >
              {{ i + 1 }}
            </button>
          </div>
          <div v-if="lens" class="pointer-events-none absolute top-2 overflow-hidden rounded-full border-4 border-sun bg-night shadow-xl" :class="lens.side === 'right' ? 'right-2' : 'left-2'" :style="lens.style" aria-hidden="true">
            <span class="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-pink"></span>
          </div>
        </div>
        <div class="flex shrink-0 flex-wrap justify-end gap-2">
          <button class="btn btn-ghost" data-testid="mat-picture-cancel" @click="close">Cancel</button>
          <button class="btn btn-sun" :disabled="!proper || busy" data-testid="mat-picture-next" @click="toPreview">{{ busy ? 'Straightening…' : 'Looks right ➜' }}</button>
        </div>
      </template>

      <template v-else>
        <p class="shrink-0 font-black">This is the mat from above. Does it look right?</p>
        <div class="flex min-h-0 flex-1 items-center justify-center">
          <img :src="previewUrl" alt="The straightened picture of the mat" class="max-h-full max-w-full rounded border-2 border-line" data-testid="mat-picture-preview" />
        </div>
        <p class="muted shrink-0 text-sm">≈ Places on the picture are only as exact as the photo and the four corners.</p>
        <p v-if="error" class="notice notice-warn shrink-0 text-sm font-bold" role="alert" data-testid="mat-picture-error">{{ error }}</p>
        <div class="flex shrink-0 flex-wrap justify-end gap-2">
          <button class="btn btn-ghost" :disabled="busy" data-testid="mat-picture-back" @click="stage = 'corners'">Move the corners</button>
          <button class="btn btn-sun" :disabled="busy" data-testid="mat-picture-use" @click="use">{{ busy ? 'Saving…' : 'Use this picture' }}</button>
        </div>
      </template>
    </div>
  </section>
</template>
