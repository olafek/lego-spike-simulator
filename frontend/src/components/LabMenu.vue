<script setup lang="ts">
// Phones only: the ☰ button in the lab's top row and the panel it opens
// (home, project name, save state, projects, settings, sound, leave).
import { ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { DEMO } from '@/lib/demo'
import { useDismiss } from '@/lib/dismiss'
import { leaveLab } from '@/lib/leave'
import { useLab } from '@/stores/lab'
import { useSession } from '@/stores/session'
import RobotFace from './RobotFace.vue'

const lab = useLab()
const session = useSession()
const route = useRoute()
const router = useRouter()

const open = ref(false)
const button = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
useDismiss(open, button, panel)
watch(
  () => route.fullPath,
  () => (open.value = false),
)
</script>

<template>
  <button ref="button" type="button" class="btn btn-ghost btn-sm text-xl" aria-label="Menu" :aria-expanded="open" data-testid="lab-menu" @click="open = !open">☰</button>
  <div v-if="open" ref="panel" class="card absolute inset-x-2 top-full z-30 flex flex-col gap-2 p-3 shadow-xl" role="group" aria-label="Lab menu" data-testid="lab-menu-panel">
    <div class="flex items-center gap-2">
      <RouterLink to="/" class="flex min-h-11 items-center gap-2 rounded-xl pr-2 text-lg font-black tracking-tight" data-testid="nav-home">
        <RobotFace class="h-10 w-10" />
        <span>SPIKE <span class="text-sun">Lab</span></span>
      </RouterLink>
      <span v-if="DEMO" class="chip chip-sky" data-testid="demo-chip">Demo</span>
      <span class="chip ml-auto" :class="lab.saveState === 'error' ? 'chip-flag' : ''" role="status" data-testid="save-state">{{ lab.saveText }}</span>
    </div>
    <input
      class="field h-11 min-h-11 w-full font-extrabold"
      :value="lab.name"
      aria-label="Project name"
      maxlength="80"
      data-testid="project-name"
      @change="lab.rename(($event.target as HTMLInputElement).value)"
    />
    <div class="grid grid-cols-2 gap-2">
      <RouterLink to="/projects" class="btn btn-ghost btn-sm" data-testid="nav-projects">📁 Projects</RouterLink>
      <RouterLink to="/settings" class="btn btn-ghost btn-sm" data-testid="nav-settings">⚙️ Settings</RouterLink>
      <button type="button" class="btn btn-ghost btn-sm" :aria-pressed="session.sound" @click="session.sound = !session.sound">
        {{ session.sound ? '🔊 Sound on' : '🔇 Sound off' }}
      </button>
      <button v-if="!DEMO" type="button" class="btn btn-ghost btn-sm" data-testid="logout" @click="leaveLab(router)">🚪 Leave lab</button>
    </div>
  </div>
</template>
