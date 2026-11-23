<script setup lang="ts">
// "Use a table" in the Mat step: put a saved table (mat, picture, things, start spot) onto this program.
// The table is copied, so nothing done here can change the saved table.
import { ref } from 'vue'
import { api, ApiError, type ProjectSummary } from '@/lib/api'
import { LAST_TABLE_KEY, useLab } from '@/stores/lab'

const lab = useLab()

const open = ref(false)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const tables = ref<ProjectSummary[]>([])
/** the table waiting for a "yes" because this mat is not empty */
const pending = ref<ProjectSummary | null>(null)

function lastUsed(): string | null {
  try {
    return localStorage.getItem(LAST_TABLE_KEY)
  } catch {
    return null
  }
}

async function toggle() {
  open.value = !open.value
  pending.value = null
  error.value = ''
  if (!open.value) return
  loading.value = true
  try {
    const last = lastUsed()
    const list = (await api.tables()).filter((t) => t.id !== lab.id)
    // the table used last time comes first
    tables.value = [...list.filter((t) => t.id === last), ...list.filter((t) => t.id !== last)]
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'The tables could not be loaded. Please try again.'
    tables.value = []
  } finally {
    loading.value = false
  }
}

function choose(table: ProjectSummary) {
  const scene = lab.data?.scene
  const notEmpty = !!scene && (scene.objects.length > 0 || !!lab.matImage)
  if (notEmpty) pending.value = table
  else void apply(table)
}

async function apply(table: ProjectSummary) {
  busy.value = true
  error.value = ''
  try {
    await lab.useTable(table.id)
    open.value = false
    pending.value = null
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'That table could not be used. Please try again.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="card p-3" data-testid="table-picker">
    <div class="flex flex-wrap items-center gap-2">
      <h3 class="flex-1 font-extrabold">Tables</h3>
      <button class="btn btn-ghost btn-sm" :aria-expanded="open" data-testid="use-table" @click="toggle">🏁 Use a table</button>
    </div>

    <div v-if="open" class="mt-2 flex flex-col gap-2" data-testid="table-picker-list">
      <p v-if="loading" class="muted text-sm" role="status">Looking for tables…</p>
      <p v-else-if="!tables.length && !error" class="muted text-sm">No tables yet. Make one with “New table” on the home screen.</p>

      <div v-if="pending" class="notice notice-warn pop" role="alertdialog" aria-label="Please confirm">
        <p class="font-bold">Replace what is on this mat with “{{ pending.name }}”?</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button class="btn btn-sun btn-sm" :disabled="busy" data-testid="use-table-confirm" @click="apply(pending)">Yes, use the table</button>
          <button class="btn btn-ghost btn-sm" :disabled="busy" @click="pending = null">No, keep it</button>
        </div>
      </div>

      <button
        v-for="t in tables"
        :key="t.id"
        class="btn btn-ghost min-h-14 justify-start gap-3 text-left"
        :disabled="busy"
        data-testid="table-option"
        @click="choose(t)"
      >
        <img v-if="t.matImageUrl" :src="t.matImageUrl" alt="" class="h-10 w-20 shrink-0 rounded bg-deep object-cover" />
        <span v-else class="flex h-10 w-20 shrink-0 items-center justify-center rounded bg-deep text-xl" aria-hidden="true">🏁</span>
        <span class="min-w-0 truncate font-extrabold">{{ t.name }}</span>
      </button>
      <p v-if="error" class="notice notice-warn text-sm font-bold" role="alert">{{ error }}</p>
      <p class="muted text-xs">The table is copied onto this program. Changing things here never changes the saved table.</p>
    </div>
  </section>
</template>
