<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError, type ProjectSummary } from '@/lib/api'
import { forgetProject, recentIds, rememberProject } from '@/lib/recent'
import { useLab } from '@/stores/lab'
import { DEMO } from '@/lib/demo'

const router = useRouter()
const lab = useLab()
const all = ref<ProjectSummary[]>([])
const loading = ref(true)
const error = ref('')
const everyone = ref(false)
const confirmDelete = ref<string | null>(null)
const mine = ref(new Set(recentIds()))
const importer = ref<HTMLInputElement | null>(null)

// in the demo the server only ever returns this visitor's own projects
const shown = computed(() => (DEMO || everyone.value ? all.value : all.value.filter((p) => mine.value.has(p.id))))

async function refresh() {
  loading.value = true
  try {
    all.value = await api.projects()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'The projects could not be loaded.'
  } finally {
    loading.value = false
  }
}

async function guard(fn: () => Promise<void>) {
  error.value = ''
  try {
    await fn()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'That did not work. Please try again.'
  }
}

const duplicate = (p: ProjectSummary) =>
  guard(async () => {
    const copy = await api.duplicateProject(p.id)
    rememberProject(copy.id)
    mine.value = new Set(recentIds())
    await refresh()
  })

const remove = (p: ProjectSummary) =>
  guard(async () => {
    await api.deleteProject(p.id)
    forgetProject(p.id)
    if (lab.id === p.id) lab.reset()
    confirmDelete.value = null
    await refresh()
  })

const exportProject = (p: ProjectSummary) =>
  guard(async () => {
    const doc = await api.exportProject(p.id)
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${p.name.replace(/[^\w\- ]+/g, '').trim() || 'spike-lab-project'}.spikelab.json`
    a.click()
    URL.revokeObjectURL(url)
  })

function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  void guard(async () => {
    let doc: unknown
    try {
      doc = JSON.parse(await file.text())
    } catch {
      error.value = 'That file is not a SPIKE Lab project.'
      return
    }
    const rec = await api.importProject(doc)
    rememberProject(rec.id)
    await router.push({ name: 'lab', params: { id: rec.id } })
  })
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

onMounted(refresh)
</script>

<template>
  <div class="scroll-y h-full" data-testid="projects-view">
    <div class="mx-auto flex max-w-4xl flex-col gap-3 px-4 pb-10">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="text-3xl font-black">Projects</h1>
        <div class="flex-1" />
        <input v-if="!DEMO" ref="importer" type="file" class="sr-only" accept=".json,application/json" aria-label="Import a project file" data-testid="import-input" @change="onImport" />
        <button v-if="!DEMO" class="btn btn-ghost btn-sm" @click="importer?.click()">📥 Import a file</button>
        <RouterLink to="/" class="btn btn-sun btn-sm">＋ New</RouterLink>
      </div>

      <div v-if="!DEMO" class="flex rounded-xl border-2 border-line p-0.5 self-start" role="group" aria-label="Which projects">
        <button class="btn btn-sm border-0" :class="!everyone ? 'bg-ink text-night' : 'bg-transparent'" :aria-pressed="!everyone" @click="everyone = false">On this device</button>
        <button class="btn btn-sm border-0" :class="everyone ? 'bg-ink text-night' : 'bg-transparent'" :aria-pressed="everyone" data-testid="show-everyone" @click="everyone = true">Whole lab</button>
      </div>
      <p v-if="DEMO" class="muted text-sm">Demo projects are only visible in this browser and are deleted after a day.</p>
      <p v-else class="muted text-sm">Everyone who knows the lab password can open any lab project, so do not put anything private in a project name.</p>

      <p v-if="error" role="alert" class="notice notice-bad font-bold">{{ error }}</p>
      <p v-if="loading" role="status" class="muted">Loading…</p>
      <p v-else-if="!shown.length" class="notice text-center font-bold">No projects here yet. Upload a screenshot to start one!</p>

      <ul class="m-0 flex list-none flex-col gap-3 p-0">
        <li v-for="p in shown" :key="p.id" class="card p-3" data-testid="project-row">
          <div class="flex items-center gap-3">
            <img v-if="p.firstScreenshotUrl" :src="p.firstScreenshotUrl" alt="" class="h-16 w-24 shrink-0 rounded-lg bg-deep object-cover" />
            <span v-else class="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-deep text-3xl" aria-hidden="true">🤖</span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-lg font-extrabold">{{ p.name }}</p>
              <p class="muted truncate text-sm">{{ p.summary || `${p.screenshotCount} screenshot${p.screenshotCount === 1 ? '' : 's'}` }} · {{ when(p.updatedAt) }}</p>
            </div>
            <RouterLink :to="{ name: 'lab', params: { id: p.id } }" class="btn btn-sun" data-testid="project-open">Open</RouterLink>
          </div>
          <div class="mt-2 flex flex-wrap gap-2">
            <button class="btn btn-ghost btn-sm" data-testid="project-duplicate" @click="duplicate(p)">⧉ Make a copy</button>
            <button class="btn btn-ghost btn-sm" data-testid="project-export" @click="exportProject(p)">📤 Save as file</button>
            <button v-if="confirmDelete !== p.id" class="btn btn-ghost btn-sm" data-testid="project-delete" @click="confirmDelete = p.id">🗑 Delete</button>
            <template v-else>
              <span class="self-center font-bold text-danger">Delete it and its screenshots for good?</span>
              <button class="btn btn-danger btn-sm" data-testid="project-delete-yes" @click="remove(p)">Yes, delete</button>
              <button class="btn btn-ghost btn-sm" @click="confirmDelete = null">No</button>
            </template>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
