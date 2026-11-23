<script setup lang="ts">
// 3D viewport: shows the snapshot the lab store points at. It owns no simulation state.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useLab } from '@/stores/lab'
import { SceneRenderer, type RendererSetup } from '@/render/SceneRenderer'
import { chooseScaleBar } from '@/render/scale'
import { gridChoices } from '@/core/units'

const lab = useLab()
const host = ref<HTMLDivElement | null>(null)
const renderer = shallowRef<SceneRenderer | null>(null)
const pxPerMm = ref<number | null>(null)
const failed = ref(false)
let observer: ResizeObserver | null = null

const setup = computed<RendererSetup | null>(() =>
  lab.data ? { robot: lab.robot, attachments: lab.data.attachments, scene: lab.data.scene, settings: lab.data.settings, matImageUrl: lab.matPicture?.url ?? null } : null,
)

const unit = computed(() => lab.data?.settings.unit ?? 'cm')
const bar = computed(() => (pxPerMm.value ? chooseScaleBar(pxPerMm.value, unit.value) : null))
const squareLabel = computed(() => {
  const s = lab.data?.settings
  if (!s) return ''
  const hit = gridChoices(s.unit).find((g) => Math.abs(g.majorMm - s.gridMajorMm) < 0.01)
  return hit ? hit.label : `${Math.round(s.gridMajorMm) / 10} cm`
})

function pushAll(): void {
  const r = renderer.value
  if (!r) return
  if (setup.value) r.setSetup(setup.value)
  if (lab.data) r.setCamera(lab.data.settings.camera)
  r.setTimeline(lab.result)
  r.setFrame(lab.frameIndex)
}

onMounted(() => {
  if (!host.value) return
  try {
    renderer.value = new SceneRenderer(host.value, { onScale: (info) => (pxPerMm.value = info.pxPerMm) })
  } catch {
    failed.value = true // WebGL is not available on this device/browser
    return
  }
  pushAll()
  observer = new ResizeObserver(() => renderer.value?.resize())
  observer.observe(host.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  renderer.value?.dispose()
  renderer.value = null
})

watch(setup, (s) => s && renderer.value?.setSetup(s), { deep: true })
watch(
  () => lab.result,
  (r) => {
    renderer.value?.setTimeline(r)
    renderer.value?.setFrame(lab.frameIndex)
  },
)
watch(
  () => lab.frameIndex,
  (i) => renderer.value?.setFrame(i),
)
watch(
  () => lab.data?.settings.camera,
  (mode) => mode && renderer.value?.setCamera(mode),
)

defineExpose({
  resetView: () => renderer.value?.resetView(),
  zoomBy: (factor: number) => renderer.value?.zoomBy(factor),
})
</script>

<template>
  <div class="relative w-full h-full overflow-hidden rounded-[1.1rem] bg-[#d6dcf2]">
    <div ref="host" data-testid="sim-canvas" class="absolute inset-0"></div>

    <div v-if="failed" class="absolute inset-0 grid place-items-center p-6 text-center text-[#26327a]">
      <p class="max-w-sm font-bold">This device could not start the 3D view. Try another browser, or update this one.</p>
    </div>

    <!-- measuring aids: clicks pass through everything except the buttons -->
    <div v-if="!failed" class="pointer-events-none absolute inset-0">
      <div class="absolute bottom-3 left-3 flex items-end gap-2">
        <div
          v-if="bar"
          data-testid="scale-bar"
          :data-px-per-mm="pxPerMm ?? ''"
          :data-length-mm="bar.lengthMm"
          class="rounded-xl bg-white/90 px-2.5 pt-1 pb-2 text-[#1b1f2a] shadow"
          role="img"
          :aria-label="`Scale: this bar is ${bar.label} long`"
        >
          <div class="mb-1 text-center text-sm font-extrabold leading-none">{{ bar.label }}</div>
          <div class="h-2.5 border-x-[3px] border-b-[3px] border-[#1b1f2a]" :style="{ width: `${bar.px}px` }"></div>
        </div>
        <div v-else data-testid="scale-chip" class="chip bg-white/90! text-[#1b1f2a]! shadow">1 square = {{ squareLabel }}</div>
      </div>

      <div class="pointer-events-auto absolute top-3 right-3 flex flex-col gap-2">
        <button type="button" class="btn btn-ghost btn-sm" aria-label="Zoom in" @click="renderer?.zoomBy(1.3)">＋</button>
        <button type="button" class="btn btn-ghost btn-sm" aria-label="Zoom out" @click="renderer?.zoomBy(1 / 1.3)">－</button>
        <button type="button" class="btn btn-ghost btn-sm" aria-label="Fit the whole run in view" @click="renderer?.resetView()">⤢</button>
      </div>
    </div>
  </div>
</template>
