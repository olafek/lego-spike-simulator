<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError, type ProjectSummary } from '@/lib/api'
import { ACCEPT_ATTR } from '@/lib/image'
import { recentIds } from '@/lib/recent'
import { startEmpty, StartError, startFromFiles, startFromSample, startFromSampleScreenshot, type UploadProgress } from '@/lib/start'
import { SAMPLES, type Sample } from '@/core/samples'
import { useSession } from '@/stores/session'
import RobotFace from '@/components/RobotFace.vue'
import { DEMO } from '@/lib/demo'

const router = useRouter()
const session = useSession()

const dragging = ref(false)
const busy = ref<string | null>(null)
const progress = ref<UploadProgress | null>(null)
const error = ref('')
const picker = ref<HTMLInputElement | null>(null)
const recent = ref<ProjectSummary[]>([])

const limits = computed(() => session.info?.limits)
const mock = computed(() => session.info && !session.info.vision.live)

async function run(label: string, fn: () => Promise<{ id: string; read: boolean }>) {
  if (busy.value) return
  busy.value = label
  error.value = ''
  progress.value = null
  try {
    const { id, read } = await fn()
    await router.push({ name: 'lab', params: { id }, query: read ? { read: '1' } : {} })
  } catch (e) {
    error.value = e instanceof StartError || e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'
  } finally {
    busy.value = null
  }
}

function useFiles(files: File[]) {
  if (files.length === 0) return
  void run('Sending your screenshot…', async () => ({ id: await startFromFiles(files, limits.value, (p) => (progress.value = p)), read: true }))
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  useFiles([...(input.files ?? [])])
  input.value = ''
}

function onDrop(e: DragEvent) {
  dragging.value = false
  useFiles([...(e.dataTransfer?.files ?? [])])
}

function onPaste(e: ClipboardEvent) {
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
  if (files.length) {
    e.preventDefault()
    useFiles(files)
  }
}

const trySample = (s: Sample) => run('Opening the example…', async () => ({ id: await startFromSample(s), read: false }))
const tryScreenshot = () => run('Sending the example screenshot…', async () => ({ id: await startFromSampleScreenshot(limits.value, (p) => (progress.value = p)), read: true }))
const buildManually = () => run('Getting a blank program…', async () => ({ id: await startEmpty(), read: false }))

onMounted(async () => {
  window.addEventListener('paste', onPaste)
  try {
    const mine = new Set(recentIds())
    // in the demo the server already returns only this visitor's projects
    recent.value = (await api.projects()).filter((p) => DEMO || mine.has(p.id)).slice(0, 4)
  } catch {
    recent.value = []
  }
})
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))
</script>

<template>
  <div class="scroll-y h-full">
    <div class="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-10 pt-2">
      <!-- hero: the one thing to do -->
      <section
        class="card relative overflow-hidden p-5 text-center transition sm:p-8"
        :class="dragging ? 'border-sun! bg-panel2!' : ''"
        data-testid="upload-zone"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <RobotFace class="mx-auto h-20 w-20" :class="busy ? 'wiggle' : ''" :mood="error ? 'oops' : busy ? 'think' : 'happy'" />
        <h1 class="mt-2 text-3xl font-black sm:text-4xl">Upload your SPIKE screenshot</h1>
        <p class="muted mx-auto mt-2 max-w-xl text-base sm:text-lg">Take a screenshot of your program in the SPIKE app. We turn it into blocks and your robot drives it right here.</p>

        <input ref="picker" type="file" class="sr-only" :accept="ACCEPT_ATTR" multiple data-testid="file-input" aria-label="Choose screenshots" @change="onPick" />
        <div class="mt-5 flex flex-col items-center gap-3">
          <button class="btn btn-sun btn-xl w-full max-w-md" :disabled="!!busy" data-testid="pick-button" @click="picker?.click()">📸 Choose screenshot</button>
          <p class="muted text-sm">or drop pictures here · or paste <span class="hidden sm:inline">(Ctrl/⌘ + V)</span> · up to {{ limits?.maxScreenshotsPerProject ?? 6 }} at once</p>
        </div>

        <div v-if="busy" class="mt-4" role="status" aria-live="polite" data-testid="start-busy">
          <p class="font-extrabold">{{ busy }}</p>
          <div v-if="progress" class="mx-auto mt-2 h-3 max-w-sm overflow-hidden rounded-full bg-deep">
            <div class="h-full rounded-full bg-sun transition-all" :style="{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }" />
          </div>
        </div>
        <p v-if="error" role="alert" class="notice notice-bad mx-auto mt-4 max-w-xl font-bold" data-testid="start-error">{{ error }}</p>
        <p v-if="DEMO" class="notice mx-auto mt-4 max-w-xl text-sm font-bold" data-testid="demo-notice">
          This is the public demo. The picture reader is switched off, so every upload shows a stored example – try the samples below. What you make here is deleted after a day.
        </p>
        <p v-else-if="mock" class="chip chip-est mx-auto mt-4">Practice mode: the picture reader is switched off, so every upload shows a stored example.</p>
      </section>

      <!-- samples -->
      <section aria-labelledby="samples-title">
        <h2 id="samples-title" class="mb-2 text-xl font-black">Try a sample</h2>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button class="card flex min-h-28 flex-col items-start gap-1 p-3 text-left transition active:scale-[0.98]" :disabled="!!busy" data-testid="sample-screenshot" @click="tryScreenshot">
            <span class="text-3xl" aria-hidden="true">🖼️</span>
            <span class="font-extrabold leading-tight">Example screenshot</span>
            <span class="muted text-sm leading-snug">See the whole trip: picture → blocks → robot.</span>
          </button>
          <button
            v-for="s in SAMPLES"
            :key="s.id"
            class="card flex min-h-28 flex-col items-start gap-1 p-3 text-left transition active:scale-[0.98]"
            :disabled="!!busy"
            :data-testid="`sample-${s.id}`"
            @click="trySample(s)"
          >
            <span class="text-3xl" aria-hidden="true">{{ s.emoji }}</span>
            <span class="font-extrabold leading-tight">{{ s.title }}</span>
            <span class="muted text-sm leading-snug">{{ s.blurb }}</span>
          </button>
        </div>
      </section>

      <!-- continue -->
      <section v-if="recent.length" aria-labelledby="recent-title">
        <div class="mb-2 flex items-center justify-between">
          <h2 id="recent-title" class="text-xl font-black">Continue a project</h2>
          <RouterLink to="/projects" class="btn btn-ghost btn-sm">See all</RouterLink>
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RouterLink v-for="p in recent" :key="p.id" :to="{ name: 'lab', params: { id: p.id } }" class="card flex items-center gap-3 p-3" data-testid="recent-project">
            <img v-if="p.firstScreenshotUrl" :src="p.firstScreenshotUrl" alt="" class="h-14 w-20 rounded-lg bg-deep object-cover" />
            <span v-else class="flex h-14 w-20 items-center justify-center rounded-lg bg-deep text-2xl" aria-hidden="true">🤖</span>
            <span class="min-w-0">
              <span class="block truncate font-extrabold">{{ p.name }}</span>
              <span class="muted block truncate text-sm">{{ p.summary || 'Tap to open' }}</span>
            </span>
          </RouterLink>
        </div>
      </section>

      <div class="text-center">
        <button class="btn btn-ghost btn-sm" :disabled="!!busy" data-testid="build-manually" @click="buildManually">🧩 Build a program by hand</button>
      </div>
    </div>
  </div>
</template>
